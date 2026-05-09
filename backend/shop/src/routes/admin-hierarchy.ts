import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";

export const adminHierarchyRouter = Router();

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// ─── Headings (admin CRUD) ──────────────────────────────────────────────

adminHierarchyRouter.get("/headings", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT h.*,
              (SELECT count(*) FROM shop_catalogue c WHERE c.heading_id = h.id) AS catalogue_count
       FROM shop_heading h ORDER BY h.rank, h.name`
    );
    res.json({ headings: rows });
  } catch (err) {
    console.error("[admin headings list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminHierarchyRouter.get("/headings/:id", async (req, res) => {
  try {
    const heading = await queryOne(`SELECT * FROM shop_heading WHERE id = $1`, [req.params.id]);
    if (!heading) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const catalogues = await query(
      `SELECT * FROM shop_catalogue WHERE heading_id = $1 ORDER BY rank, name`,
      [req.params.id]
    );
    res.json({ heading: { ...heading, catalogues } });
  } catch (err) {
    console.error("[admin heading get]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminHierarchyRouter.post("/headings", async (req, res) => {
  try {
    const { name, handle, description, rank, is_active, is_sale, metadata } = req.body as {
      name: string;
      handle?: string;
      description?: string;
      rank?: number;
      is_active?: boolean;
      is_sale?: boolean;
      metadata?: Record<string, unknown>;
    };
    if (!name) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    const id = `head_${uuid().replace(/-/g, "")}`;
    const finalHandle = handle || slugify(name);
    await execute(
      `INSERT INTO shop_heading (id, name, handle, description, rank, is_active, is_sale, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        name,
        finalHandle,
        description || null,
        rank ?? 0,
        is_active ?? true,
        is_sale ?? false,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
    const heading = await queryOne(`SELECT * FROM shop_heading WHERE id = $1`, [id]);
    res.status(201).json({ heading });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "Handle already in use" });
      return;
    }
    console.error("[admin heading create]", err);
    res.status(500).json({ error: "Failed to create heading" });
  }
});

adminHierarchyRouter.patch("/headings/:id", async (req, res) => {
  try {
    const body = req.body as Partial<{
      name: string;
      handle: string;
      description: string;
      rank: number;
      is_active: boolean;
      is_sale: boolean;
      metadata: Record<string, unknown>;
    }>;
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (body.name !== undefined) { sets.push(`name = $${idx++}`); params.push(body.name); }
    if (body.handle !== undefined) { sets.push(`handle = $${idx++}`); params.push(body.handle); }
    if (body.description !== undefined) { sets.push(`description = $${idx++}`); params.push(body.description); }
    if (body.rank !== undefined) { sets.push(`rank = $${idx++}`); params.push(body.rank); }
    if (body.is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(body.is_active); }
    if (body.is_sale !== undefined) { sets.push(`is_sale = $${idx++}`); params.push(body.is_sale); }
    if (body.metadata !== undefined) { sets.push(`metadata = $${idx++}`); params.push(JSON.stringify(body.metadata)); }
    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      params.push(req.params.id);
      await execute(`UPDATE shop_heading SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    }
    const heading = await queryOne(`SELECT * FROM shop_heading WHERE id = $1`, [req.params.id]);
    if (!heading) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ heading });
  } catch (err) {
    console.error("[admin heading update]", err);
    res.status(500).json({ error: "Failed to update heading" });
  }
});

adminHierarchyRouter.delete("/headings/:id", async (req, res) => {
  try {
    await execute(`DELETE FROM shop_heading WHERE id = $1`, [req.params.id]);
    res.json({ id: req.params.id, deleted: true });
  } catch (err) {
    console.error("[admin heading delete]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminHierarchyRouter.post("/headings/reorder", async (req, res) => {
  try {
    const { order } = req.body as { order: string[] };
    if (!Array.isArray(order)) {
      res.status(400).json({ error: "order array required" });
      return;
    }
    for (let i = 0; i < order.length; i++) {
      await execute(
        `UPDATE shop_heading SET rank = $1, updated_at = NOW() WHERE id = $2`,
        [i, order[i]]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin heading reorder]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Catalogues (admin CRUD) ──────────────────────────────────────────────

adminHierarchyRouter.get("/catalogues", async (req, res) => {
  try {
    const headingId = (req.query.heading_id as string) || undefined;
    const where = headingId ? "WHERE c.heading_id = $1" : "";
    const params = headingId ? [headingId] : [];
    const rows = await query(
      `SELECT c.*, h.name AS heading_name, h.handle AS heading_handle,
              (SELECT count(*) FROM shop_product_catalogue_map m WHERE m.catalogue_id = c.id) AS product_count
       FROM shop_catalogue c
       JOIN shop_heading h ON h.id = c.heading_id
       ${where}
       ORDER BY c.rank, c.name`,
      params
    );
    res.json({ catalogues: rows });
  } catch (err) {
    console.error("[admin catalogues list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminHierarchyRouter.get("/catalogues/:id", async (req, res) => {
  try {
    const catalogue = await queryOne(
      `SELECT c.*, h.name AS heading_name, h.handle AS heading_handle
       FROM shop_catalogue c JOIN shop_heading h ON h.id = c.heading_id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (!catalogue) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const products = await query(
      `SELECT p.id, p.title, p.handle, p.thumbnail, p.status
       FROM shop_product p
       JOIN shop_product_catalogue_map m ON m.product_id = p.id
       WHERE m.catalogue_id = $1
       ORDER BY p.created_at DESC`,
      [req.params.id]
    );
    res.json({ catalogue: { ...catalogue, products } });
  } catch (err) {
    console.error("[admin catalogue get]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminHierarchyRouter.post("/catalogues", async (req, res) => {
  try {
    const { heading_id, name, handle, description, thumbnail, rank, is_active, metadata } =
      req.body as {
        heading_id: string;
        name: string;
        handle?: string;
        description?: string;
        thumbnail?: string;
        rank?: number;
        is_active?: boolean;
        metadata?: Record<string, unknown>;
      };
    if (!name || !heading_id) {
      res.status(400).json({ error: "name and heading_id are required" });
      return;
    }
    const heading = await queryOne(`SELECT id FROM shop_heading WHERE id = $1`, [heading_id]);
    if (!heading) {
      res.status(400).json({ error: "Invalid heading_id" });
      return;
    }
    const id = `cat_${uuid().replace(/-/g, "")}`;
    const finalHandle = handle || slugify(name);
    await execute(
      `INSERT INTO shop_catalogue (id, heading_id, name, handle, description, thumbnail, rank, is_active, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        heading_id,
        name,
        finalHandle,
        description || null,
        thumbnail || null,
        rank ?? 0,
        is_active ?? true,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
    const catalogue = await queryOne(`SELECT * FROM shop_catalogue WHERE id = $1`, [id]);
    res.status(201).json({ catalogue });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "Handle already in use" });
      return;
    }
    console.error("[admin catalogue create]", err);
    res.status(500).json({ error: "Failed to create catalogue" });
  }
});

adminHierarchyRouter.patch("/catalogues/:id", async (req, res) => {
  try {
    const body = req.body as Partial<{
      heading_id: string;
      name: string;
      handle: string;
      description: string;
      thumbnail: string;
      rank: number;
      is_active: boolean;
      metadata: Record<string, unknown>;
    }>;
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (body.heading_id !== undefined) { sets.push(`heading_id = $${idx++}`); params.push(body.heading_id); }
    if (body.name !== undefined) { sets.push(`name = $${idx++}`); params.push(body.name); }
    if (body.handle !== undefined) { sets.push(`handle = $${idx++}`); params.push(body.handle); }
    if (body.description !== undefined) { sets.push(`description = $${idx++}`); params.push(body.description); }
    if (body.thumbnail !== undefined) { sets.push(`thumbnail = $${idx++}`); params.push(body.thumbnail); }
    if (body.rank !== undefined) { sets.push(`rank = $${idx++}`); params.push(body.rank); }
    if (body.is_active !== undefined) { sets.push(`is_active = $${idx++}`); params.push(body.is_active); }
    if (body.metadata !== undefined) { sets.push(`metadata = $${idx++}`); params.push(JSON.stringify(body.metadata)); }
    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      params.push(req.params.id);
      await execute(`UPDATE shop_catalogue SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    }
    const catalogue = await queryOne(`SELECT * FROM shop_catalogue WHERE id = $1`, [req.params.id]);
    if (!catalogue) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ catalogue });
  } catch (err) {
    console.error("[admin catalogue update]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminHierarchyRouter.delete("/catalogues/:id", async (req, res) => {
  try {
    await execute(`DELETE FROM shop_catalogue WHERE id = $1`, [req.params.id]);
    res.json({ id: req.params.id, deleted: true });
  } catch (err) {
    console.error("[admin catalogue delete]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminHierarchyRouter.post("/catalogues/reorder", async (req, res) => {
  try {
    const { order } = req.body as { order: string[] };
    if (!Array.isArray(order)) {
      res.status(400).json({ error: "order array required" });
      return;
    }
    for (let i = 0; i < order.length; i++) {
      await execute(
        `UPDATE shop_catalogue SET rank = $1, updated_at = NOW() WHERE id = $2`,
        [i, order[i]]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin catalogue reorder]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── Product ↔ Catalogue assignments ──────────────────────────────────────

adminHierarchyRouter.post("/catalogues/:id/products", async (req, res) => {
  try {
    const { product_ids } = req.body as { product_ids: string[] };
    if (!Array.isArray(product_ids)) {
      res.status(400).json({ error: "product_ids array required" });
      return;
    }
    for (const productId of product_ids) {
      await execute(
        `INSERT INTO shop_product_catalogue_map (product_id, catalogue_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [productId, req.params.id]
      );
    }
    res.json({ added: product_ids.length });
  } catch (err) {
    console.error("[admin catalogue add products]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminHierarchyRouter.delete("/catalogues/:id/products/:productId", async (req, res) => {
  try {
    await execute(
      `DELETE FROM shop_product_catalogue_map WHERE catalogue_id = $1 AND product_id = $2`,
      [req.params.id, req.params.productId]
    );
    res.json({ deleted: true });
  } catch (err) {
    console.error("[admin catalogue remove product]", err);
    res.status(500).json({ error: "Failed" });
  }
});
