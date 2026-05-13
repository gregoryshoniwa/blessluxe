import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";
import { resolveCustomerId } from "./customer-auth.ts";
import { generatePackageCode, generateSubCode } from "../lib/package-codes.ts";

export const storeOrdersRouter = Router();
const newId = (p: string) => `${p}_${uuid().replace(/-/g, "")}`;

/**
 * Build a package + items + initial 'created' event for an order. Pack orders
 * (where line items have an associated pack_slot row) get sub-codes per item
 * so the customer can only claim their own piece.
 */
async function createPackageForOrder(opts: {
  orderId: string;
  orderNumber: string;
  customerId: string | null;
  customerEmail: string | null;
  shippingAddress: Record<string, unknown> | null;
  lineItems: Array<{
    line_id: string;
    variant_id: string;
    product_id: string;
    title: string;
    variant_title: string | null;
    sku: string | null;
    quantity: number;
    unit_price: number;
  }>;
}) {
  // Detect pack participation: the storefront writes pack_slot rows keyed by
  // order_id when a customer pays for a pack seat.
  const packSlots = await query(
    `SELECT id, pack_campaign_id, variant_id, customer_id, size_label
     FROM pack_slot
     WHERE order_id = $1 AND deleted_at IS NULL`,
    [opts.orderNumber]
  );
  const isPack = packSlots.length > 0;
  const packCampaignId = isPack ? String(packSlots[0].pack_campaign_id) : null;

  // Generate a unique package code, retrying on the unlikely chance of collision.
  let packageCode = generatePackageCode();
  for (let i = 0; i < 5; i++) {
    const exists = await queryOne(`SELECT id FROM shop_package WHERE package_code = $1`, [
      packageCode,
    ]);
    if (!exists) break;
    packageCode = generatePackageCode();
  }

  const packageId = newId("pkg");
  await execute(
    `INSERT INTO shop_package
       (id, package_code, order_id, customer_id, customer_email, status,
        is_pack, pack_campaign_id, shipping_address)
     VALUES ($1,$2,$3,$4,$5,'created',$6,$7,$8)`,
    [
      packageId,
      packageCode,
      opts.orderId,
      opts.customerId,
      opts.customerEmail,
      isPack,
      packCampaignId,
      opts.shippingAddress ? JSON.stringify(opts.shippingAddress) : null,
    ]
  );

  // Build items. For pack packages, each line item also stamps the pack_slot
  // it was reserved for and produces a unique sub-code.
  let subIndex = 1;
  for (const li of opts.lineItems) {
    const matchingSlot = isPack
      ? packSlots.find((s) => String(s.variant_id) === li.variant_id)
      : null;
    const subCode = isPack ? generateSubCode(packageCode, subIndex++) : null;

    await execute(
      `INSERT INTO shop_package_item
         (id, package_id, order_line_id, variant_id, product_id, product_title,
          variant_title, sku, quantity, unit_price, pack_slot_id, sub_code, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending')`,
      [
        newId("pkgi"),
        packageId,
        li.line_id,
        li.variant_id,
        li.product_id,
        li.title,
        li.variant_title,
        li.sku,
        li.quantity,
        li.unit_price,
        matchingSlot ? matchingSlot.id : null,
        subCode,
      ]
    );
  }

  // Initial timeline event.
  await execute(
    `INSERT INTO shop_package_event (id, package_id, status, location, notes, created_by)
     VALUES ($1,$2,'created',$3,$4,'system')`,
    [
      newId("pkge"),
      packageId,
      "BLESSLUXE Atelier",
      isPack
        ? `Wholesale pack package · ${opts.lineItems.length} sub-codes generated`
        : `Order package created`,
    ]
  );

  return packageCode;
}

// POST /store/orders — create an order (called by storefront after Stripe success)
// Body: { email, currency_code, items: [{variant_id, quantity, unit_price}], shipping_total, tax_total, discount_total, payment_method, payment_status, status, campaign_id?, shipping_address?, billing_address? }
/**
 * Falls back to matching shop_customer by email when no JWT-resolved id is
 * available. The storefront and shop backend currently use separate auth
 * tokens, so most order creations pass through with a null bearer — without
 * this lookup, customer_id stays NULL on the order and the package, breaking
 * /store/packages/me which filters by customer_id.
 */
async function resolveCustomerIdWithEmailFallback(
  authHeader: string | undefined,
  email: string | null | undefined
): Promise<string | null> {
  const fromToken = await resolveCustomerId(authHeader);
  if (fromToken) return fromToken;
  const e = String(email || "").trim().toLowerCase();
  if (!e) return null;
  const row = await queryOne(`SELECT id FROM shop_customer WHERE LOWER(email) = $1`, [e]);
  return row ? String(row.id) : null;
}

storeOrdersRouter.post("/", async (req, res) => {
  try {
    const b = req.body as {
      email?: string;
      currency_code: string;
      items: Array<{
        variant_id: string;
        quantity: number;
        unit_price: number;
      }>;
      shipping_total?: number;
      tax_total?: number;
      discount_total?: number;
      payment_method?: string;
      payment_status?: string;
      status?: string;
      region_id?: string;
      campaign_id?: string;
      shipping_address?: Record<string, unknown>;
      billing_address?: Record<string, unknown>;
      order_number?: string;
    };
    if (!Array.isArray(b.items) || b.items.length === 0) {
      return res.status(400).json({ error: "items required" });
    }

    // ─── Validate every line UPFRONT before touching the database ───────
    // Previously each item was looked up inside the persist loop and silently
    // skipped if missing — which produced "orders" with zero line items when
    // the storefront sent fabricated variant IDs (zero-variant products).
    type ResolvedLine = {
      line: typeof b.items[number];
      variant: Record<string, unknown>;
    };
    const resolved: ResolvedLine[] = [];
    for (const it of b.items) {
      if (!it.variant_id) {
        return res.status(400).json({ error: "Each item must include variant_id" });
      }
      if (!Number.isFinite(it.quantity) || it.quantity <= 0) {
        return res
          .status(400)
          .json({ error: `Quantity must be > 0 for variant ${it.variant_id}` });
      }
      if (!Number.isFinite(it.unit_price) || it.unit_price <= 0) {
        return res
          .status(400)
          .json({ error: `Unit price must be > 0 for variant ${it.variant_id}` });
      }
      const variant = await queryOne(
        `SELECT v.id, v.title, v.sku, v.product_id, v.cost_price,
                v.manage_inventory, v.inventory_quantity, v.allow_backorder,
                p.title AS product_title, p.thumbnail
           FROM shop_product_variant v
           JOIN shop_product p ON p.id = v.product_id
          WHERE v.id = $1`,
        [it.variant_id]
      );
      if (!variant) {
        return res
          .status(400)
          .json({ error: `Variant ${it.variant_id} no longer exists` });
      }
      if (
        variant.manage_inventory &&
        !variant.allow_backorder &&
        Number(variant.inventory_quantity ?? 0) < Number(it.quantity)
      ) {
        return res.status(409).json({
          error: `Only ${variant.inventory_quantity} in stock for ${variant.product_title} · ${variant.title}`,
          variant_id: it.variant_id,
        });
      }
      resolved.push({ line: it, variant });
    }

    const customerId = await resolveCustomerIdWithEmailFallback(
      req.headers.authorization,
      b.email
    );

    const id = newId("order");
    const orderNumber = b.order_number || `BL-${Date.now().toString(36).toUpperCase()}`;

    let subtotal = 0;
    for (const it of b.items) subtotal += it.unit_price * it.quantity;
    const total =
      subtotal + (b.shipping_total ?? 0) + (b.tax_total ?? 0) - (b.discount_total ?? 0);

    await execute(
      `INSERT INTO shop_order
        (id, order_number, email, customer_id, region_id, currency_code,
         subtotal, total, shipping_total, tax_total, discount_total,
         status, payment_method, payment_status, campaign_id,
         shipping_address, billing_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        id,
        orderNumber,
        b.email || null,
        customerId,
        b.region_id || null,
        b.currency_code.toLowerCase(),
        subtotal,
        total,
        b.shipping_total ?? 0,
        b.tax_total ?? 0,
        b.discount_total ?? 0,
        b.status || "completed",
        b.payment_method || null,
        b.payment_status || "paid",
        b.campaign_id || null,
        b.shipping_address ? JSON.stringify(b.shipping_address) : null,
        b.billing_address ? JSON.stringify(b.billing_address) : null,
      ]
    );

    // Snapshot variant data for each line + decrement inventory + record movement
    const persistedLines: Array<{
      line_id: string;
      variant_id: string;
      product_id: string;
      title: string;
      variant_title: string | null;
      sku: string | null;
      quantity: number;
      unit_price: number;
    }> = [];
    for (const { line: it, variant } of resolved) {
      const lineId = newId("line");
      await execute(
        `INSERT INTO shop_order_line_item
          (id, order_id, variant_id, product_id, title, variant_title, sku, thumbnail,
           quantity, unit_price, unit_cost)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          lineId,
          id,
          it.variant_id,
          variant.product_id,
          variant.product_title,
          variant.title,
          variant.sku || null,
          variant.thumbnail || null,
          it.quantity,
          it.unit_price,
          variant.cost_price ?? null,
        ]
      );
      persistedLines.push({
        line_id: lineId,
        variant_id: it.variant_id,
        product_id: String(variant.product_id),
        title: String(variant.product_title),
        variant_title: variant.title ? String(variant.title) : null,
        sku: variant.sku ? String(variant.sku) : null,
        quantity: it.quantity,
        unit_price: it.unit_price,
      });

      await execute(
        `UPDATE shop_product_variant
         SET inventory_quantity = GREATEST(0, inventory_quantity - $1), updated_at = NOW()
         WHERE id = $2`,
        [it.quantity, it.variant_id]
      );
      await execute(
        `INSERT INTO shop_inventory_movement (id, variant_id, delta, reason, reference)
         VALUES ($1, $2, $3, 'sale', $4)`,
        [newId("mv"), it.variant_id, -it.quantity, orderNumber]
      );
    }

    // Build the trackable package once line items exist.
    let packageCode: string | null = null;
    if (persistedLines.length > 0) {
      try {
        packageCode = await createPackageForOrder({
          orderId: id,
          orderNumber,
          customerId,
          customerEmail: b.email || null,
          shippingAddress: b.shipping_address || null,
          lineItems: persistedLines,
        });
      } catch (e) {
        console.error("[store order] package creation failed", e);
      }
    }

    if (customerId && total > 0) {
      // 1 loyalty point per 10 cents of subtotal (configurable later)
      const points = Math.floor(subtotal / 100);
      if (points > 0) {
        await execute(
          `UPDATE shop_customer SET loyalty_points = loyalty_points + $1, updated_at = NOW() WHERE id = $2`,
          [points, customerId]
        );
      }
    }

    const order = await queryOne(`SELECT * FROM shop_order WHERE id = $1`, [id]);
    res.status(201).json({ order, package_code: packageCode });
  } catch (err) {
    console.error("[store order create]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /store/orders/me — orders for the authenticated customer
storeOrdersRouter.get("/me", async (req, res) => {
  try {
    const customerId = await resolveCustomerId(req.headers.authorization);
    if (!customerId) return res.status(401).json({ error: "Not authenticated" });
    const orders = await query(
      `SELECT * FROM shop_order WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [customerId]
    );
    const items = orders.length
      ? await query(
          `SELECT * FROM shop_order_line_item WHERE order_id = ANY($1)`,
          [orders.map((o) => o.id)]
        )
      : [];
    res.json({
      orders: orders.map((o) => ({
        ...o,
        items: items.filter((it) => it.order_id === o.id),
      })),
    });
  } catch (err) {
    console.error("[store orders me]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /store/orders/:idOrNumber
storeOrdersRouter.get("/:idOrNumber", async (req, res) => {
  try {
    const order = await queryOne(
      `SELECT * FROM shop_order WHERE id = $1 OR order_number = $1`,
      [req.params.idOrNumber]
    );
    if (!order) return res.status(404).json({ error: "Not found" });
    const items = await query(
      `SELECT * FROM shop_order_line_item WHERE order_id = $1`,
      [order.id]
    );
    res.json({ order: { ...order, items } });
  } catch (err) {
    console.error("[store order get]", err);
    res.status(500).json({ error: "Failed" });
  }
});
