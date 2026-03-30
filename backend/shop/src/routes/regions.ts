import { Router } from "express";
import { query } from "../db/pool.ts";

export const regionsRouter = Router();

regionsRouter.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const rows = await query(
      `SELECT id, name, currency_code, countries, created_at, updated_at
       FROM shop_region ORDER BY created_at LIMIT $1`,
      [limit]
    );
    const regions = rows.map((r) => ({
      id: r.id,
      name: r.name,
      currency_code: r.currency_code,
      countries: (r.countries as string[]).map((c) => ({
        iso_2: c,
        display_name: c.toUpperCase(),
      })),
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
    res.json({ regions, count: regions.length, offset: 0, limit });
  } catch (err) {
    console.error("[regions]", err);
    res.status(500).json({ type: "server_error", message: "Failed to list regions" });
  }
});
