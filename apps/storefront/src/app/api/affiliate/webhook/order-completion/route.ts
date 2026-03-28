import { NextRequest, NextResponse } from "next/server";
import { createCommissionFromOrder } from "@/lib/affiliate";
import { dispatchPackOrderCompletionEffects } from "@/lib/pack-order-completion-effects";
import { applyPackOrderToSlot } from "@/lib/packs";

export const dynamic = "force-dynamic";

/** Prefer order timestamps from the webhook payload (UTC); fallback to server time. */
function orderPaidAt(body: Record<string, unknown>): Date {
  const updated = body.updated_at;
  const created = body.created_at;
  const paid = (body as { paid_at?: unknown }).paid_at;
  const raw =
    (typeof updated === "string" && updated) ||
    (typeof created === "string" && created) ||
    (typeof paid === "string" && paid);
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

/** Medusa line amounts are usually smallest currency unit; convert to major (e.g. USD). */
function lineItemPaidUsdMajor(li: Record<string, unknown>): number | null {
  const sub = Number(li.subtotal ?? li.total ?? 0);
  if (Number.isFinite(sub) && sub > 0) {
    return sub >= 50 ? sub / 100 : sub;
  }
  const up = Number(li.unit_price ?? 0);
  const q = Number(li.quantity ?? 1);
  const raw = up * q;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw >= 50 ? raw / 100 : raw;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const metadata = (body.metadata || {}) as Record<string, unknown>;
    const orderId = String(body.id || body.order_id || "").trim();
    const orderTotal = Number(
      body.total || body.total_amount || metadata.total || metadata.order_total || 0
    );
    const currencyCode = String(body.currency_code || metadata.currency_code || "usd");
    const refCode = String(
      metadata.affiliate_code || metadata.ref || body.ref || body.affiliate_code || ""
    ).trim();

    if (!orderId) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const customerId = String(
      body.customer_id || (body.customer as { id?: string } | undefined)?.id || metadata.customer_id || ""
    ).trim();

    const lineItems = (Array.isArray(body.items) ? body.items : Array.isArray((body as { order?: { items?: unknown[] } }).order?.items) ? (body as { order: { items: unknown[] } }).order.items : []) as Array<Record<string, unknown>>;

    const paidAt = orderPaidAt(body as Record<string, unknown>);

    for (const li of lineItems) {
      const lim = (li.metadata || {}) as Record<string, unknown>;
      const packCampaignId = String(lim.pack_campaign_id || "").trim();
      const packSlotId = String(lim.pack_slot_id || "").trim();
      const variantId = String(li.variant_id || "").trim();
      const lineItemId = String(li.id || (li as { line_item_id?: string }).line_item_id || "").trim();
      const storefrontCustomerId = String(lim.storefront_customer_id || "").trim();
      const linePaidUsd = lineItemPaidUsdMajor(li);
      if (packCampaignId && packSlotId && variantId && lineItemId) {
        try {
          const packResult = await applyPackOrderToSlot({
            orderId,
            lineItemId,
            variantId,
            customerId: customerId || null,
            storefrontCustomerId: storefrontCustomerId || null,
            packCampaignId,
            packSlotId,
            linePaidUsd,
            paidAt,
          });
          if (packResult.updated) {
            dispatchPackOrderCompletionEffects({
              packCampaignId,
              orderId,
              storefrontCustomerId: storefrontCustomerId || null,
              packResult: packResult,
            });
          }
        } catch (e) {
          console.warn("[order-completion] pack slot update skipped:", e);
        }
      }
    }

    if (!orderTotal || !refCode) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Do not pay commission on explicitly main-store / non-affiliate checkouts from Medusa metadata.
    const attribution = String(metadata.affiliate_attribution || metadata.ref_source || "").toLowerCase();
    if (
      attribution === "main_shop" ||
      metadata.skip_affiliate_commission === true ||
      metadata.affiliate_commission === false
    ) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await createCommissionFromOrder({
      affiliateCode: refCode,
      orderId,
      orderTotal,
      currencyCode,
      metadata: {
        source: "order-webhook",
        attribution_source:
          attribution === "affiliate_shop" || metadata.affiliate_commission_source === "affiliate_shop"
            ? "affiliate_shop"
            : "webhook_legacy",
        payload: body,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /affiliate/webhook/order-completion] error:", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
