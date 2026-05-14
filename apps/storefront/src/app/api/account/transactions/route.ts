import { NextResponse } from "next/server";
import {
  createTransactionRecord,
  getCurrentCustomer,
  getShopCustomerToken,
  listTransactions,
} from "@/lib/customer-account";
import { shopBackendCreateOrder, shopFetch } from "@/lib/shop-backend-client";

// If a transaction line is missing variant_id (older code path), look up the
// first variant of the referenced product so the order mirror still works.
async function resolveVariantId(item: { productId?: string; variantId?: string }) {
  if (item.variantId) return item.variantId;
  if (!item.productId) return null;
  try {
    const res = await shopFetch<{
      product?: { variants?: Array<{ id: string }> };
    }>(`/store/products/${encodeURIComponent(item.productId)}`);
    return res.data?.product?.variants?.[0]?.id || null;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const transactions = await listTransactions(String(customer.id));
  return NextResponse.json({ transactions });
}

export async function POST(req: Request) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await req.json();

  const orderNumber = String(body.orderNumber || "").trim();
  const amount = Number(body.amount || 0);
  const items = Array.isArray(body.items) ? body.items : [];

  if (!orderNumber || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid transaction payload." }, { status: 400 });
  }

  const normalizedItems = items.map((item: unknown) => {
    const o = item as Record<string, unknown>;
    const metaRaw = o.metadata;
    const metadata =
      metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)
        ? (metaRaw as Record<string, unknown>)
        : undefined;
    return {
      productId: String(o.productId || ""),
      productHandle: o.productHandle ? String(o.productHandle) : undefined,
      productTitle: String(o.productTitle || "Product"),
      variantId: o.variantId ? String(o.variantId) : undefined,
      quantity: Number(o.quantity || 1),
      unitPrice: Number(o.unitPrice || 0),
      metadata,
    };
  });

  await createTransactionRecord(String(customer.id), {
    orderNumber,
    amount,
    currencyCode: String(body.currencyCode || "usd"),
    status: String(body.status || "paid"),
    invoiceUrl: body.invoiceUrl ? String(body.invoiceUrl) : null,
    items: normalizedItems,
  });

  // Mirror the order into shop_order so the admin Finance page reflects real
  // sales. Resolve variant ids on the fly when older callers only pass
  // product_id. Errors are logged loudly so we can see if the mirror skips.
  try {
    const itemsForShop: Array<{
      variant_id: string;
      quantity: number;
      unit_price: number;
      pack_slot_id?: string;
      pack_campaign_id?: string;
      metadata?: Record<string, unknown>;
    }> = [];
    let skippedNoVariant = 0;
    for (const it of normalizedItems) {
      const variantId = await resolveVariantId({
        productId: it.productId,
        variantId: it.variantId,
      });
      if (!variantId) { skippedNoVariant++; continue; }
      // Forward pack-slot metadata so the order POST can flip
      // reserved → paid for group buys.
      const meta = (it as { metadata?: Record<string, unknown> }).metadata;
      itemsForShop.push({
        variant_id: variantId,
        quantity: it.quantity,
        unit_price: Math.round(it.unitPrice * 100),
        pack_slot_id: meta?.pack_slot_id ? String(meta.pack_slot_id) : undefined,
        pack_campaign_id: meta?.pack_campaign_id
          ? String(meta.pack_campaign_id)
          : undefined,
        metadata: meta,
      });
    }
    if (itemsForShop.length > 0) {
      const shopToken = await getShopCustomerToken();
      const res = await shopBackendCreateOrder({
        order_number: orderNumber,
        email: String(customer.email || ""),
        currency_code: String(body.currencyCode || "usd"),
        items: itemsForShop,
        shipping_total: Math.round(Number(body.shippingTotal ?? 0) * 100),
        tax_total: Math.round(Number(body.taxTotal ?? 0) * 100),
        discount_total: Math.round(Number(body.discountTotal ?? 0) * 100),
        payment_method: body.paymentMethod ? String(body.paymentMethod) : "stripe",
        payment_status: "paid",
        status: "completed",
        customer_token: shopToken || undefined,
      });
      if (!res.ok) {
        console.error(
          "[transactions] shop_order mirror returned",
          res.status,
          res.error,
          "items:",
          itemsForShop.length,
          "skipped:",
          skippedNoVariant
        );
      } else {
        console.log(
          `[transactions] shop_order mirrored ${orderNumber} (${itemsForShop.length} items, ${skippedNoVariant} skipped)`
        );
      }
    } else {
      console.warn(
        `[transactions] shop_order mirror skipped — no resolvable variants for ${orderNumber}`
      );
    }
  } catch (err) {
    console.error("[transactions] shop backend order mirror failed", err);
  }

  return NextResponse.json({ ok: true });
}
