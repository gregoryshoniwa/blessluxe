import { Router } from "express";
import { query, queryOne } from "../db/pool.ts";

export const cataloguesRouter = Router();

// GET /store/catalogues — list all catalogues (optionally filtered by heading)
cataloguesRouter.get("/", async (req, res) => {
  try {
    const headingId = (req.query.heading_id as string) || undefined;
    const headingHandle = (req.query.heading_handle as string) || undefined;

    const params: unknown[] = [];
    const conditions: string[] = ["c.is_active = true"];
    let idx = 1;

    if (headingId) {
      conditions.push(`c.heading_id = $${idx++}`);
      params.push(headingId);
    }
    if (headingHandle) {
      conditions.push(`c.heading_id = (SELECT id FROM shop_heading WHERE handle = $${idx++})`);
      params.push(headingHandle);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await query(
      `SELECT c.id, c.heading_id, c.name, c.handle, c.description, c.thumbnail,
              c.rank, c.is_active, c.metadata, c.created_at, c.updated_at,
              h.handle AS heading_handle, h.name AS heading_name,
              (SELECT count(*) FROM shop_product_catalogue_map m WHERE m.catalogue_id = c.id) AS product_count
       FROM shop_catalogue c
       JOIN shop_heading h ON h.id = c.heading_id
       ${where}
       ORDER BY c.rank, c.name`,
      params
    );

    res.json({
      catalogues: rows.map((c) => ({
        id: c.id,
        heading_id: c.heading_id,
        heading_handle: c.heading_handle,
        heading_name: c.heading_name,
        name: c.name,
        handle: c.handle,
        description: c.description || null,
        thumbnail: c.thumbnail || null,
        rank: Number(c.rank ?? 0),
        is_active: c.is_active !== false,
        metadata: c.metadata || null,
        product_count: Number(c.product_count ?? 0),
        created_at: c.created_at,
        updated_at: c.updated_at,
      })),
      count: rows.length,
    });
  } catch (err) {
    console.error("[catalogues list]", err);
    res.status(500).json({ type: "server_error", message: "Failed to list catalogues" });
  }
});

// GET /store/catalogues/:idOrHandle
cataloguesRouter.get("/:idOrHandle", async (req, res) => {
  try {
    const { idOrHandle } = req.params;
    const row = await queryOne(
      `SELECT c.*, h.handle AS heading_handle, h.name AS heading_name,
              (SELECT count(*) FROM shop_product_catalogue_map m WHERE m.catalogue_id = c.id) AS product_count
       FROM shop_catalogue c
       JOIN shop_heading h ON h.id = c.heading_id
       WHERE (c.id = $1 OR c.handle = $1) AND c.is_active = true LIMIT 1`,
      [idOrHandle]
    );
    if (!row) {
      res.status(404).json({ type: "not_found", message: "Catalogue not found" });
      return;
    }
    res.json({
      catalogue: {
        id: row.id,
        heading_id: row.heading_id,
        heading_handle: row.heading_handle,
        heading_name: row.heading_name,
        name: row.name,
        handle: row.handle,
        description: row.description || null,
        thumbnail: row.thumbnail || null,
        rank: Number(row.rank ?? 0),
        is_active: row.is_active !== false,
        metadata: row.metadata || null,
        product_count: Number(row.product_count ?? 0),
        created_at: row.created_at,
        updated_at: row.updated_at,
      },
    });
  } catch (err) {
    console.error("[catalogue by id/handle]", err);
    res.status(500).json({ type: "server_error", message: "Failed to fetch catalogue" });
  }
});
