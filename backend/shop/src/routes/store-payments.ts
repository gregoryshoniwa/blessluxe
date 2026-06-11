import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";
import { resolveCustomerId } from "./customer-auth.ts";
import {
  initiateTransaction,
  loadConfig,
  classifyStatus,
  pollStatus,
  parseFormBody,
  verifyHash,
} from "../lib/paynow.ts";

export const storePaymentsRouter = Router();

const newId = (p: string) => `${p}_${uuid().replace(/-/g, "")}`;

function shortRef(): string {
  return `BL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

interface InitiateBody {
  email?: string;
  currency_code?: string;
  items: Array<{
    variant_id: string;
    quantity: number;
    unit_price: number;
    pack_slot_id?: string;
    pack_campaign_id?: string;
    metadata?: Record<string, unknown>;
  }>;
  shipping_total?: number;
  tax_total?: number;
  discount_total?: number;
  shipping_address?: Record<string, unknown>;
  billing_address?: Record<string, unknown>;
  region_id?: string;
  auth_phone?: string;
  auth_name?: string;
}

// ─── Initiate: cart → Paynow → browser redirect ─────────────────────────
storePaymentsRouter.post("/paynow/initiate", async (req, res) => {
  try {
    const body = req.body as InitiateBody;
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ error: "items required" });
    }
    if (!body.email && !req.headers.authorization) {
      return res.status(400).json({ error: "email required for guest checkout" });
    }
    const customerId = await resolveCustomerId(req.headers.authorization);
    let email = String(body.email || "").trim();
    if (!email && customerId) {
      const cust = await queryOne(`SELECT email FROM shop_customer WHERE id = $1`, [
        customerId,
      ]);
      email = String(cust?.email || "").trim();
    }
    if (!email) return res.status(400).json({ error: "email required" });

    // Compute the total in minor units the same way /store/orders does.
    let subtotal = 0;
    for (const it of body.items) subtotal += it.unit_price * it.quantity;
    const total =
      subtotal +
      (body.shipping_total ?? 0) +
      (body.tax_total ?? 0) -
      (body.discount_total ?? 0);
    if (total <= 0) return res.status(400).json({ error: "Total must be > 0" });

    const reference = shortRef();
    const config = loadConfig();
    const init = await initiateTransaction(config, {
      reference,
      amount: total / 100, // Paynow expects major units
      additionalInfo: "BLESSLUXE order",
      authEmail: email,
      authPhone: body.auth_phone,
      authName: body.auth_name,
    });
    if (!init.ok) {
      return res.status(502).json({ error: init.error });
    }

    const id = newId("payses");
    await execute(
      `INSERT INTO shop_payment_session
        (id, reference, provider, status, poll_url, amount, currency_code,
         email, customer_id, cart_snapshot, raw_init_response)
       VALUES ($1,$2,'paynow','pending',$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        reference,
        init.pollUrl,
        total,
        (body.currency_code || "usd").toLowerCase(),
        email,
        customerId,
        JSON.stringify({
          items: body.items,
          shipping_total: body.shipping_total ?? 0,
          tax_total: body.tax_total ?? 0,
          discount_total: body.discount_total ?? 0,
          subtotal,
          total,
          shipping_address: body.shipping_address || null,
          billing_address: body.billing_address || null,
          region_id: body.region_id || null,
        }),
        init.raw,
      ]
    );
    res.json({
      browser_url: init.browserUrl,
      poll_url: init.pollUrl,
      reference,
      session_id: id,
    });
  } catch (err) {
    console.error("[paynow initiate]", err);
    const message = err instanceof Error ? err.message : "Initiate failed";
    res.status(500).json({ error: message });
  }
});

// ─── IPN: Paynow → us (status updates) ──────────────────────────────────
// Paynow POSTs form-encoded; express.urlencoded() is registered on /store,
// so req.body has parsed fields. The hash MUST be verified before trusting
// any field.
storePaymentsRouter.post("/paynow/ipn", async (req, res) => {
  try {
    const config = loadConfig();
    // The body comes through Express's URL-encoded parser; keys are already
    // decoded. Reconstruct the lowercase-key map our verifier expects.
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.body as Record<string, unknown>)) {
      fields[k.toLowerCase()] = String(v ?? "");
    }
    if (!verifyHash(fields, config.integrationKey)) {
      // Reject silently — Paynow ignores body so a 400 is enough to log.
      console.warn("[paynow ipn] hash mismatch", {
        reference: fields.reference,
      });
      return res.status(400).json({ error: "hash mismatch" });
    }
    await applyStatusUpdate(fields);
    res.send("OK");
  } catch (err) {
    console.error("[paynow ipn]", err);
    res.status(500).send("error");
  }
});

// ─── Return URL: customer-facing redirect back from Paynow ──────────────
// We never trust the URL params for state; we look up our session, poll for
// the latest status, and redirect to the storefront with a result hint.
storePaymentsRouter.get("/paynow/return", async (req, res) => {
  try {
    const reference = String(req.query.reference || "").trim();
    const storefrontBase = (process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.STOREFRONT_URL ||
      process.env.NEXTAUTH_URL ||
      "")
      .trim()
      .replace(/\/+$/, "");
    const fallback = storefrontBase || "/";
    if (!reference) return res.redirect(`${fallback}/cart`);

    const session = await queryOne(
      `SELECT * FROM shop_payment_session WHERE reference = $1`,
      [reference]
    );
    if (!session) return res.redirect(`${fallback}/cart`);

    // Poll once for a fresh status (Paynow's IPN can lag by seconds).
    if (session.status === "pending" && session.poll_url) {
      try {
        const config = loadConfig();
        const p = await pollStatus(String(session.poll_url), config.integrationKey);
        if (p.ok) await applyStatusUpdate(p.data);
      } catch {
        /* ignore — IPN will still fire */
      }
    }
    const fresh = await queryOne(
      `SELECT status, order_id FROM shop_payment_session WHERE reference = $1`,
      [reference]
    );
    if (fresh?.status === "paid" && fresh.order_id) {
      const order = await queryOne(
        `SELECT order_number FROM shop_order WHERE id = $1`,
        [fresh.order_id]
      );
      return res.redirect(
        `${fallback}/checkout/confirmation?order=${encodeURIComponent(String(order?.order_number || reference))}`
      );
    }
    return res.redirect(`${fallback}/checkout/paynow/return?reference=${encodeURIComponent(reference)}`);
  } catch (err) {
    console.error("[paynow return]", err);
    res.redirect("/");
  }
});

// ─── Manual status check by reference ───────────────────────────────────
storePaymentsRouter.get("/paynow/status/:reference", async (req, res) => {
  try {
    const session = await queryOne(
      `SELECT id, reference, status, provider_status, amount, currency_code, order_id, created_at, updated_at
         FROM shop_payment_session WHERE reference = $1`,
      [req.params.reference]
    );
    if (!session) return res.status(404).json({ error: "Not found" });
    res.json({ session });
  } catch (err) {
    console.error("[paynow status]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── shared: apply a Paynow status payload to the session + maybe create order
async function applyStatusUpdate(fields: Record<string, string>): Promise<void> {
  const reference = fields.reference;
  if (!reference) return;
  const status = fields.status || "";
  const classified = classifyStatus(status);
  const session = await queryOne(
    `SELECT * FROM shop_payment_session WHERE reference = $1`,
    [reference]
  );
  if (!session) {
    console.warn("[paynow] no session for reference", reference);
    return;
  }
  // Idempotent — once paid, stay paid.
  if (session.status === "paid" && classified !== "paid") return;

  await execute(
    `UPDATE shop_payment_session
        SET status = $1,
            provider_status = $2,
            provider_reference = COALESCE($3, provider_reference),
            poll_url = COALESCE($4, poll_url),
            raw_ipn_payload = $5,
            updated_at = NOW()
      WHERE reference = $6`,
    [
      classified,
      status,
      fields.paynowreference || null,
      fields.pollurl || null,
      JSON.stringify(fields),
      reference,
    ]
  );

  if (classified !== "paid" || session.order_id) return;

  // Materialise the order. Reuse the same insert path /store/orders takes by
  // POSTing internally — but we already have the cart_snapshot; call the
  // helper inline.
  await createOrderFromSession(reference);
}

async function createOrderFromSession(reference: string): Promise<void> {
  const session = await queryOne(
    `SELECT * FROM shop_payment_session WHERE reference = $1`,
    [reference]
  );
  if (!session || session.order_id) return;

  const snap = (session.cart_snapshot as Record<string, unknown>) || {};
  const items = (snap.items as Array<{
    variant_id: string;
    quantity: number;
    unit_price: number;
    pack_slot_id?: string;
    metadata?: Record<string, unknown>;
  }>) || [];
  if (items.length === 0) return;

  const orderId = newId("order");
  const orderNumber = String(reference);
  const subtotal = Number(snap.subtotal || 0);
  const total = Number(snap.total || session.amount);

  await execute(
    `INSERT INTO shop_order
      (id, order_number, email, customer_id, region_id, currency_code,
       subtotal, total, shipping_total, tax_total, discount_total,
       status, payment_method, payment_status, shipping_address, billing_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'completed','paynow','paid',$12,$13)`,
    [
      orderId,
      orderNumber,
      session.email,
      session.customer_id,
      (snap.region_id as string) || null,
      String(session.currency_code).toLowerCase(),
      subtotal,
      total,
      Number(snap.shipping_total || 0),
      Number(snap.tax_total || 0),
      Number(snap.discount_total || 0),
      snap.shipping_address ? JSON.stringify(snap.shipping_address) : null,
      snap.billing_address ? JSON.stringify(snap.billing_address) : null,
    ]
  );

  for (const it of items) {
    const variant = await queryOne(
      `SELECT v.id, v.title, v.sku, v.product_id, v.cost_price,
              p.title AS product_title, p.thumbnail
         FROM shop_product_variant v
         JOIN shop_product p ON p.id = v.product_id
        WHERE v.id = $1`,
      [it.variant_id]
    );
    if (!variant) continue;
    const lineId = newId("line");
    await execute(
      `INSERT INTO shop_order_line_item
        (id, order_id, variant_id, product_id, title, variant_title, sku, thumbnail,
         quantity, unit_price, unit_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        lineId,
        orderId,
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
    // Decrement inventory + record movement (mirrors /store/orders).
    await execute(
      `UPDATE shop_product_variant
          SET inventory_quantity = GREATEST(0, inventory_quantity - $1), updated_at = NOW()
        WHERE id = $2`,
      [it.quantity, it.variant_id]
    );
    // Pack-slot completion link (same as /store/orders).
    const slotId =
      it.pack_slot_id ||
      ((it.metadata as Record<string, unknown> | undefined)?.pack_slot_id as
        | string
        | undefined);
    if (slotId) {
      await execute(
        `UPDATE pack_slot
            SET status = 'paid', order_id = $1, line_item_id = $2,
                reserved_until = NULL, updated_at = NOW()
          WHERE id = $3
            AND deleted_at IS NULL
            AND status IN ('reserved','available')`,
        [orderId, lineId, slotId]
      );
    }
  }

  await execute(
    `UPDATE shop_payment_session SET order_id = $1, updated_at = NOW() WHERE id = $2`,
    [orderId, session.id]
  );
}

// Keep helpers exported for tests / other call sites.
export { applyStatusUpdate };
