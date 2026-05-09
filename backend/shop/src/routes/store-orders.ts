import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";
import { resolveCustomerId } from "./customer-auth.ts";

export const storeOrdersRouter = Router();
const newId = (p: string) => `${p}_${uuid().replace(/-/g, "")}`;

// POST /store/orders — create an order (called by storefront after Stripe success)
// Body: { email, currency_code, items: [{variant_id, quantity, unit_price}], shipping_total, tax_total, discount_total, payment_method, payment_status, status, campaign_id?, shipping_address?, billing_address? }
storeOrdersRouter.post("/", async (req, res) => {
  try {
    const customerId = await resolveCustomerId(req.headers.authorization);
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
    for (const it of b.items) {
      const variant = await queryOne(
        `SELECT v.id, v.title, v.sku, v.product_id, v.cost_price,
                p.title AS product_title, p.thumbnail
         FROM shop_product_variant v
         JOIN shop_product p ON p.id = v.product_id
         WHERE v.id = $1`,
        [it.variant_id]
      );
      if (!variant) continue;

      await execute(
        `INSERT INTO shop_order_line_item
          (id, order_id, variant_id, product_id, title, variant_title, sku, thumbnail,
           quantity, unit_price, unit_cost)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          newId("line"),
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
    res.status(201).json({ order });
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
