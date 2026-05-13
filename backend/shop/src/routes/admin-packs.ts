import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";

const newId = (p: string) => `${p}_${uuid().replace(/-/g, "")}`;

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
      `SELECT d.id, d.title, d.handle, d.description, d.status, d.product_id,
              d.pack_kind, d.metadata, d.created_at, d.updated_at,
              p.title AS product_title, p.thumbnail AS product_thumbnail,
              (SELECT count(*)::int FROM pack_campaign c
               WHERE c.pack_definition_id = d.id AND c.deleted_at IS NULL) AS campaign_count,
              (SELECT count(*)::int FROM pack_definition_product dp
               WHERE dp.pack_definition_id = d.id) AS product_count,
              (SELECT json_agg(json_build_object(
                  'id', p2.id,
                  'title', p2.title,
                  'handle', p2.handle,
                  'thumbnail', p2.thumbnail
                ) ORDER BY dp.position, dp.created_at)
                 FROM pack_definition_product dp
                 JOIN shop_product p2 ON p2.id = dp.product_id
                WHERE dp.pack_definition_id = d.id
              ) AS products
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
    const { status, title, description } = req.body as Partial<{
      status: string;
      title: string;
      description: string;
    }>;
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (status !== undefined) {
      if (!["draft", "published"].includes(status)) {
        return res.status(400).json({ error: "status must be draft or published" });
      }
      sets.push(`status = $${i++}`);
      params.push(status);
    }
    if (title !== undefined) {
      sets.push(`title = $${i++}`);
      params.push(String(title).trim());
    }
    if (description !== undefined) {
      sets.push(`description = $${i++}`);
      params.push(description ? String(description).trim() : null);
    }
    if (sets.length > 0) {
      sets.push("updated_at = NOW()");
      params.push(req.params.id);
      await execute(
        `UPDATE pack_definition SET ${sets.join(", ")} WHERE id = $${i}`,
        params
      );
    }
    const row = await queryOne(`SELECT * FROM pack_definition WHERE id = $1`, [req.params.id]);
    res.json({ definition: row });
  } catch (err) {
    console.error("[admin pack def update]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Create a new pack definition (admin only) ──────────────────────────
adminPacksRouter.post("/packs/definitions", async (req, res) => {
  try {
    const b = req.body as {
      // Legacy single-product field, still honoured.
      product_id?: string;
      // New multi-product field — wins when present.
      product_ids?: string[];
      pack_kind?: "single" | "merge";
      title: string;
      handle?: string;
      description?: string;
      status?: "draft" | "published";
    };
    if (!b.title?.trim()) return res.status(400).json({ error: "title required" });

    const kind = b.pack_kind === "merge" ? "merge" : "single";
    const ids = Array.from(
      new Set(
        (b.product_ids && b.product_ids.length > 0
          ? b.product_ids
          : b.product_id
            ? [b.product_id]
            : []
        )
          .map((s) => String(s || "").trim())
          .filter(Boolean)
      )
    );
    if (ids.length === 0) {
      return res.status(400).json({ error: "Select at least one product" });
    }
    if (kind === "single" && ids.length > 1) {
      return res
        .status(400)
        .json({ error: "Single packs must use exactly one product" });
    }

    // Confirm every product exists AND has at least one variant.
    const products = await query(
      `SELECT p.id, p.handle, p.title,
              (SELECT count(*)::int FROM shop_product_variant v WHERE v.product_id = p.id) AS variant_count
         FROM shop_product p
        WHERE p.id = ANY($1)`,
      [ids]
    );
    if (products.length !== ids.length) {
      return res.status(400).json({ error: "One or more products not found" });
    }
    const noVariants = products.filter((p) => Number(p.variant_count) === 0);
    if (noVariants.length > 0) {
      return res.status(400).json({
        error: `These products have no variants yet: ${noVariants
          .map((p) => p.title)
          .join(", ")}`,
      });
    }

    const slug = (b.handle?.trim() || `${String(products[0].handle)}-pack`)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const id = newId("packdef");
    const status = b.status === "published" ? "published" : "draft";

    // Single packs also populate the legacy product_id column for backward
    // compat with consumers that haven't migrated to the join table yet.
    const legacyProductId = kind === "single" ? ids[0] : null;

    await execute(
      `INSERT INTO pack_definition
        (id, product_id, pack_kind, title, handle, description, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        legacyProductId,
        kind,
        b.title.trim(),
        slug,
        b.description?.trim() || null,
        status,
      ]
    );
    for (let i = 0; i < ids.length; i++) {
      await execute(
        `INSERT INTO pack_definition_product (id, pack_definition_id, product_id, position)
         VALUES ($1, $2, $3, $4)`,
        [newId("pdp"), id, ids[i], i]
      );
    }
    const row = await queryOne(`SELECT * FROM pack_definition WHERE id = $1`, [id]);
    res.status(201).json({ definition: row });
  } catch (err: unknown) {
    console.error("[admin pack def create]", err);
    const message =
      err instanceof Error ? err.message : "Failed to create pack definition";
    res.status(500).json({ error: message });
  }
});

// ─── Soft-delete a definition (also cancels its open campaigns) ─────────
adminPacksRouter.delete("/packs/definitions/:id", async (req, res) => {
  try {
    await execute(
      `UPDATE pack_definition SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    await execute(
      `UPDATE pack_campaign SET status = 'cancelled', updated_at = NOW()
        WHERE pack_definition_id = $1 AND status IN ('open', 'filling')`,
      [req.params.id]
    );
    res.json({ deleted: true });
  } catch (err) {
    console.error("[admin pack def delete]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Launch an admin-hosted campaign immediately ────────────────────────
// Builds one slot per variant of the underlying product. Customers join by
// claiming a slot via the existing pack-campaign join flow.
adminPacksRouter.post("/packs/definitions/:id/launch", async (req, res) => {
  try {
    const b = req.body as { expires_at?: string; title?: string };
    const def = await queryOne(
      `SELECT * FROM pack_definition WHERE id = $1 AND deleted_at IS NULL`,
      [req.params.id]
    );
    if (!def) return res.status(404).json({ error: "Definition not found" });
    if (def.status !== "published") {
      return res.status(400).json({ error: "Publish the definition before launching" });
    }
    // Pull every variant of every product linked to this definition. For
    // single packs the join table has one row; merge packs may have many.
    // Falls back to the legacy product_id column if no rows exist yet.
    // Variants ∪ pack products. For the size label, only the option-value
    // that belongs to the "Size" option counts — match it via po.title
    // (case-insensitive). The actual label lives on pov.value, NOT vov which
    // is just the join table.
    const variants = await query(
      `SELECT v.id, v.title, p.title AS product_title, v.product_id,
              MAX(pov.value) AS size_value
         FROM shop_product_variant v
         JOIN shop_product p ON p.id = v.product_id
         LEFT JOIN shop_variant_option_value vov ON vov.variant_id = v.id
         LEFT JOIN shop_product_option_value pov ON pov.id = vov.option_value_id
         LEFT JOIN shop_product_option po
           ON po.id = pov.option_id AND LOWER(po.title) IN ('size', 'sizes')
        WHERE v.product_id IN (
          SELECT product_id FROM pack_definition_product WHERE pack_definition_id = $1
          UNION
          SELECT $2::text WHERE $2::text IS NOT NULL
        )
        GROUP BY v.id, p.title
        ORDER BY p.title, v.title`,
      [def.id, def.product_id]
    );
    if (variants.length === 0) {
      return res.status(400).json({ error: "Pack products have no variants" });
    }
    const campaignId = newId("packcamp");
    const publicCode = `BLP-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;
    await execute(
      `INSERT INTO pack_campaign
        (id, pack_definition_id, host_kind, public_code, status, expires_at, title)
       VALUES ($1,$2,'admin',$3,'open',$4,$5)`,
      [
        campaignId,
        def.id,
        publicCode,
        b.expires_at || null,
        b.title?.trim() || `${def.title} drop`,
      ]
    );
    // One slot per variant, size_label preferred from the size option value.
    for (const v of variants) {
      await execute(
        `INSERT INTO pack_slot (id, pack_campaign_id, variant_id, size_label, status)
         VALUES ($1,$2,$3,$4,'available')`,
        [
          newId("packslot"),
          campaignId,
          v.id,
          String(v.size_value || v.title || "One size"),
        ]
      );
    }
    const row = await queryOne(`SELECT * FROM pack_campaign WHERE id = $1`, [campaignId]);
    res.status(201).json({ campaign: row, public_code: publicCode });
  } catch (err) {
    console.error("[admin pack campaign launch]", err);
    const message =
      err instanceof Error ? err.message : "Failed to launch campaign";
    res.status(500).json({ error: message });
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
