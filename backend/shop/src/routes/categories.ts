import { Router } from "express";
import { query } from "../db/pool.ts";

export const categoriesRouter = Router();

categoriesRouter.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const rows = await query(
      `SELECT id, name, handle, description, parent_category_id, rank, created_at, updated_at
       FROM shop_product_category ORDER BY rank, name LIMIT $1`,
      [limit]
    );
    const categories = rows.map((r) => ({
      id: r.id,
      name: r.name,
      handle: r.handle,
      description: r.description || null,
      parent_category_id: r.parent_category_id || null,
      rank: r.rank,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
    res.json({
      product_categories: categories,
      count: categories.length,
      offset: 0,
      limit,
    });
  } catch (err) {
    console.error("[categories]", err);
    res.status(500).json({ type: "server_error", message: "Failed to list categories" });
  }
});
