import { Router } from "express";
import { query, queryOne, execute } from "../db/pool.ts";

/**
 * Admin pack tracking. Packs live in the storefront's pack_* tables (not in
 * shop_*) because the storefront owns the participation/loyalty logic. The
 * admin reads them directly via this router; writes are limited to status
 * updates so the merchandising team can pause / resume campaigns.
 */
export const adminPacksRouter = Router();

const ACTIVE = "deleted_at IS NULL";

// ─── Stats top-line ──────────────────────────────────────────────────────
adminPacksRouter.get("/packs/stats", async (_req, res) => {
  try {
    const [defs, campaigns, slots] = await Promise.all([
      queryOne(`SELECT count(*)::int AS c FROM pack_definition WHERE ${ACTIVE}`),
      query(
        `SELECT status, count(*)::int AS c
         FROM pack_campaign WHERE ${ACTIVE}
         GROUP BY status`
      ),
      query(
        `SELECT status, count(*)::int AS c
         FROM pack_slot WHERE ${ACTIVE}
         GROUP BY status`
      ),
    ]);
    const byKey = (rows: Record<string, unknown>[]) =>
      Object.fromEntries(rows.map((r) => [String(r.status), Number(r.c)]));
    res.json({
      definitions: Number(defs?.c ?? 0),
      campaigns_by_status: byKey(campaigns),
      slots_by_status: byKey(slots),
    });
  } catch (err) {
    console.error("[admin packs stats]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Definitions ─────────────────────────────────────────────────────────
adminPacksRouter.get("/packs/definitions", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const status = (req.query.status as string) || undefined;
    const q = (req.query.q as string) || undefined;

    const conds: string[] = [`d.deleted_at IS NULL`];
    const params: unknown[] = [];
    let i = 1;
    if (status) { conds.push(`d.status = $${i++}`); params.push(status); }
    if (q) {
      conds.push(`(d.title ILIKE $${i} OR d.handle ILIKE $${i})`);
      params.push(`%${q}%`);
      i++;
    }
    const where = `WHERE ${conds.join(" AND ")}`;
    const totalRow = await queryOne(
      `SELECT count(*)::int AS total FROM pack_definition d ${where}`,
      params
    );
    params.push(limit, offset);

    const rows = await query(
      `SELECT d.id, d.title, d.handle, d.description, d.status, d.product_id, d.metadata,
              d.created_at, d.updated_at,
              p.title AS product_title, p.thumbnail AS product_thumbnail,
              (SELECT count(*)::int FROM pack_campaign c
               WHERE c.pack_definition_id = d.id AND c.deleted_at IS NULL) AS campaign_count
       FROM pack_definition d
       LEFT JOIN shop_product p ON p.id = d.product_id
       ${where}
       ORDER BY d.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      params
    );
    res.json({
      definitions: rows,
      count: Number(totalRow?.total ?? rows.length),
      offset,
      limit,
    });
  } catch (err) {
    console.error("[admin pack defs]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminPacksRouter.patch("/packs/definitions/:id", async (req, res) => {
  try {
    const { status } = req.body as { status?: string };
    if (!status || !["draft", "published"].includes(status)) {
      return res.status(400).json({ error: "status must be draft or published" });
    }
    await execute(
      `UPDATE pack_definition SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, req.params.id]
    );
    const row = await queryOne(`SELECT * FROM pack_definition WHERE id = $1`, [req.params.id]);
    res.json({ definition: row });
  } catch (err) {
    console.error("[admin pack def update]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Campaigns ───────────────────────────────────────────────────────────
adminPacksRouter.get("/packs/campaigns", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const status = (req.query.status as string) || undefined;
    const definitionId = (req.query.definition_id as string) || undefined;

    const conds: string[] = [`c.deleted_at IS NULL`];
    const params: unknown[] = [];
    let i = 1;
    if (status) { conds.push(`c.status = $${i++}`); params.push(status); }
    if (definitionId) { conds.push(`c.pack_definition_id = $${i++}`); params.push(definitionId); }
    const where = `WHERE ${conds.join(" AND ")}`;

    const totalRow = await queryOne(
      `SELECT count(*)::int AS total FROM pack_campaign c ${where}`,
      params
    );
    params.push(limit, offset);

    const rows = await query(
      `SELECT c.id, c.public_code, c.status, c.expires_at, c.created_at,
              c.gift_blits_prize, c.gift_blits_pool, c.gift_allocation_type,
              c.gift_countdown_ends_at,
              d.title AS definition_title, d.handle AS definition_handle,
              p.title AS product_title, p.thumbnail AS product_thumbnail,
              a.code AS affiliate_code, a.email AS affiliate_email,
              (SELECT count(*)::int FROM pack_slot s
               WHERE s.pack_campaign_id = c.id AND s.deleted_at IS NULL) AS total_slots,
              (SELECT count(*)::int FROM pack_slot s
               WHERE s.pack_campaign_id = c.id AND s.deleted_at IS NULL
                 AND s.status IN ('paid','fulfilled')) AS paid_slots
       FROM pack_campaign c
       JOIN pack_definition d ON d.id = c.pack_definition_id
       LEFT JOIN shop_product p ON p.id = d.product_id
       LEFT JOIN shop_affiliate a ON a.id = c.affiliate_id
       ${where}
       ORDER BY c.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      params
    );
    res.json({
      campaigns: rows,
      count: Number(totalRow?.total ?? rows.length),
      offset,
      limit,
    });
  } catch (err) {
    console.error("[admin pack campaigns]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminPacksRouter.patch("/packs/campaigns/:id", async (req, res) => {
  try {
    const { status } = req.body as { status?: string };
    const allowed = ["open", "filling", "ready_to_process", "processing", "fulfilled", "cancelled"];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${allowed.join(", ")}` });
    }
    await execute(
      `UPDATE pack_campaign SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, req.params.id]
    );
    const row = await queryOne(`SELECT * FROM pack_campaign WHERE id = $1`, [req.params.id]);
    res.json({ campaign: row });
  } catch (err) {
    console.error("[admin pack campaign update]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Slots ───────────────────────────────────────────────────────────────
adminPacksRouter.get("/packs/slots", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const campaignId = (req.query.campaign_id as string) || undefined;
    const status = (req.query.status as string) || undefined;

    const conds: string[] = [`s.deleted_at IS NULL`];
    const params: unknown[] = [];
    let i = 1;
    if (campaignId) { conds.push(`s.pack_campaign_id = $${i++}`); params.push(campaignId); }
    if (status) { conds.push(`s.status = $${i++}`); params.push(status); }
    const where = `WHERE ${conds.join(" AND ")}`;

    const totalRow = await queryOne(
      `SELECT count(*)::int AS total FROM pack_slot s ${where}`,
      params
    );
    params.push(limit, offset);

    const rows = await query(
      `SELECT s.id, s.pack_campaign_id, s.variant_id, s.size_label, s.status,
              s.customer_id, s.order_id, s.commitment, s.collection_code,
              s.created_at, s.reserved_until,
              v.sku, v.title AS variant_title,
              c.public_code AS campaign_code,
              ca.email AS customer_email, ca.full_name AS customer_name
       FROM pack_slot s
       LEFT JOIN shop_product_variant v ON v.id = s.variant_id
       LEFT JOIN pack_campaign c ON c.id = s.pack_campaign_id
       LEFT JOIN customer_account ca ON ca.id = s.customer_id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      params
    );
    res.json({
      slots: rows,
      count: Number(totalRow?.total ?? rows.length),
      offset,
      limit,
    });
  } catch (err) {
    console.error("[admin pack slots]", err);
    res.status(500).json({ error: "Failed" });
  }
});
