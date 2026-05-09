import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";

export const adminPackagesRouter = Router();
const newId = (p: string) => `${p}_${uuid().replace(/-/g, "")}`;

const STATUS_FLOW = [
  "created",
  "label_printed",
  "picked",
  "packed",
  "shipped",
  "in_transit",
  "out_for_delivery",
  "delivered",
] as const;

const TERMINAL_STATUSES = ["delivered", "returned", "cancelled", "lost"] as const;

// ─── List ────────────────────────────────────────────────────────────────
adminPackagesRouter.get("/packages", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const status = (req.query.status as string) || undefined;
    const carrier = (req.query.carrier as string) || undefined;
    const isPack = req.query.is_pack as string | undefined;
    const q = (req.query.q as string) || undefined;

    const conds: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (status) { conds.push(`p.status = $${i++}`); params.push(status); }
    if (carrier) { conds.push(`p.carrier = $${i++}`); params.push(carrier); }
    if (isPack === "true") conds.push("p.is_pack = true");
    if (isPack === "false") conds.push("p.is_pack = false");
    if (q) {
      conds.push(
        `(p.package_code ILIKE $${i} OR p.customer_email ILIKE $${i} OR o.order_number ILIKE $${i})`
      );
      params.push(`%${q}%`);
      i++;
    }
    const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

    const totalRow = await queryOne(
      `SELECT count(*)::int AS total FROM shop_package p JOIN shop_order o ON o.id = p.order_id ${where}`,
      params
    );
    params.push(limit, offset);

    const rows = await query(
      `SELECT p.id, p.package_code, p.status, p.carrier, p.carrier_tracking_number,
              p.current_location, p.estimated_delivery_at, p.shipped_at, p.delivered_at,
              p.is_pack, p.created_at, p.customer_email,
              o.order_number, o.total, o.currency_code,
              c.first_name AS customer_first_name, c.last_name AS customer_last_name,
              (SELECT count(*)::int FROM shop_package_item pi WHERE pi.package_id = p.id) AS item_count
       FROM shop_package p
       JOIN shop_order o ON o.id = p.order_id
       LEFT JOIN shop_customer c ON c.id = p.customer_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      params
    );

    res.json({
      packages: rows,
      count: Number(totalRow?.total ?? rows.length),
      offset,
      limit,
    });
  } catch (err) {
    console.error("[admin packages list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Detail ──────────────────────────────────────────────────────────────
adminPackagesRouter.get("/packages/:idOrCode", async (req, res) => {
  try {
    const key = String(req.params.idOrCode || "").trim();
    const pkg = await queryOne(
      `SELECT p.*, o.order_number, o.total, o.currency_code,
              c.id AS cust_id, c.first_name AS cust_first, c.last_name AS cust_last,
              c.email AS cust_email, c.phone AS cust_phone, c.loyalty_tier
       FROM shop_package p
       JOIN shop_order o ON o.id = p.order_id
       LEFT JOIN shop_customer c ON c.id = p.customer_id
       WHERE p.id = $1 OR p.package_code = $1
       LIMIT 1`,
      [key]
    );
    if (!pkg) return res.status(404).json({ error: "Not found" });

    const [items, events] = await Promise.all([
      query(
        `SELECT pi.*, ps.customer_id AS slot_customer_id, sc.email AS slot_customer_email
         FROM shop_package_item pi
         LEFT JOIN pack_slot ps ON ps.id = pi.pack_slot_id
         LEFT JOIN shop_customer sc ON sc.id = ps.customer_id
         WHERE pi.package_id = $1
         ORDER BY pi.created_at`,
        [pkg.id]
      ),
      query(
        `SELECT e.id, e.status, e.location, e.notes, e.created_at, e.created_by,
                u.email AS created_by_email
         FROM shop_package_event e
         LEFT JOIN shop_user u ON u.id = e.created_by
         WHERE e.package_id = $1
         ORDER BY e.created_at`,
        [pkg.id]
      ),
    ]);

    res.json({ package: { ...pkg, items, events } });
  } catch (err) {
    console.error("[admin package detail]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Update top-level fields (carrier, tracking number, address) ──────
adminPackagesRouter.patch("/packages/:id", async (req, res) => {
  try {
    const body = req.body as Partial<{
      carrier: string;
      carrier_tracking_number: string;
      current_location: string;
      estimated_delivery_at: string;
      shipping_address: Record<string, unknown>;
      notes: string;
    }>;
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    const set = (col: string, val: unknown) => { sets.push(`${col} = $${i++}`); params.push(val); };
    if (body.carrier !== undefined) set("carrier", body.carrier);
    if (body.carrier_tracking_number !== undefined) set("carrier_tracking_number", body.carrier_tracking_number);
    if (body.current_location !== undefined) set("current_location", body.current_location);
    if (body.estimated_delivery_at !== undefined) set("estimated_delivery_at", body.estimated_delivery_at);
    if (body.shipping_address !== undefined) set("shipping_address", JSON.stringify(body.shipping_address));
    if (body.notes !== undefined) set("notes", body.notes);
    if (sets.length > 0) {
      sets.push("updated_at = NOW()");
      params.push(req.params.id);
      await execute(`UPDATE shop_package SET ${sets.join(", ")} WHERE id = $${i}`, params);
    }
    const row = await queryOne(`SELECT * FROM shop_package WHERE id = $1`, [req.params.id]);
    res.json({ package: row });
  } catch (err) {
    console.error("[admin package update]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Add a tracking event (and bump status accordingly) ───────────────
adminPackagesRouter.post("/packages/:id/events", async (req, res) => {
  try {
    const { status, location, notes } = req.body as {
      status: string;
      location?: string;
      notes?: string;
    };
    if (!status) return res.status(400).json({ error: "status required" });

    // Identify the admin user from the bearer (best-effort).
    const auth = req.headers.authorization || "";
    const adminId = auth ? auth.slice(0, 24) : "system"; // not perfect but useful for audit

    await execute(
      `INSERT INTO shop_package_event (id, package_id, status, location, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [newId("pkge"), req.params.id, status, location || null, notes || null, adminId]
    );

    // Mirror the status onto the package row, with timestamps where relevant.
    const sets: string[] = ["status = $1", "updated_at = NOW()"];
    const params: unknown[] = [status];
    if (location) { sets.push(`current_location = $${params.length + 1}`); params.push(location); }
    if (status === "shipped") sets.push("shipped_at = COALESCE(shipped_at, NOW())");
    if (status === "delivered") sets.push("delivered_at = COALESCE(delivered_at, NOW())");
    params.push(req.params.id);
    await execute(
      `UPDATE shop_package SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params
    );

    const row = await queryOne(`SELECT * FROM shop_package WHERE id = $1`, [req.params.id]);
    res.status(201).json({ package: row });
  } catch (err) {
    console.error("[admin package event]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Verify a sub-code at collection. Returns the slot owner so admin can
// confirm the customer in front of them is the rightful collector. ──────
adminPackagesRouter.get("/packages/lookup/sub/:subCode", async (req, res) => {
  try {
    const subCode = String(req.params.subCode || "").trim();
    const row = await queryOne(
      `SELECT pi.id, pi.package_id, pi.product_title, pi.variant_title, pi.sku,
              pi.status, pi.claimed_at, pi.claimed_by,
              ps.customer_id AS slot_customer_id, ps.size_label,
              c.first_name, c.last_name, c.email, c.phone, c.loyalty_tier,
              p.package_code, p.is_pack, p.status AS package_status
       FROM shop_package_item pi
       LEFT JOIN pack_slot ps ON ps.id = pi.pack_slot_id
       LEFT JOIN shop_customer c ON c.id = ps.customer_id
       JOIN shop_package p ON p.id = pi.package_id
       WHERE pi.sub_code = $1
       LIMIT 1`,
      [subCode]
    );
    if (!row) return res.status(404).json({ error: "Sub-code not found" });
    res.json({ item: row });
  } catch (err) {
    console.error("[admin sub-code lookup]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Mark a sub-code claimed (admin override at collection point) ─────
adminPackagesRouter.post("/packages/items/:itemId/claim", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const adminId = auth ? auth.slice(0, 24) : "system";

    const item = await queryOne(
      `SELECT id, package_id, status FROM shop_package_item WHERE id = $1`,
      [req.params.itemId]
    );
    if (!item) return res.status(404).json({ error: "Not found" });
    if (item.status === "claimed") return res.status(409).json({ error: "Already claimed" });

    await execute(
      `UPDATE shop_package_item
         SET status = 'claimed', claimed_at = NOW(), claimed_by = $1, updated_at = NOW()
       WHERE id = $2`,
      [adminId, req.params.itemId]
    );
    await execute(
      `INSERT INTO shop_package_event (id, package_id, status, location, notes, created_by)
       VALUES ($1, $2, 'claimed', 'Collection point', $3, $4)`,
      [
        newId("pkge"),
        item.package_id,
        `Sub-code claimed in admin override`,
        adminId,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin claim sub]", err);
    res.status(500).json({ error: "Failed" });
  }
});

export { STATUS_FLOW, TERMINAL_STATUSES };
