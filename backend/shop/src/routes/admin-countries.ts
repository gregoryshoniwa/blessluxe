import { Router } from "express";
import { query, execute } from "../db/pool.ts";

export const adminCountriesRouter = Router();

adminCountriesRouter.get("/countries", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT code, name, is_allowed, sort_order, updated_at
       FROM shop_country ORDER BY name ASC`
    );
    const allowedCount = rows.filter((r) => r.is_allowed).length;
    res.json({ countries: rows, allowed_count: allowedCount, total: rows.length });
  } catch (err) {
    console.error("[admin countries list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// Bulk update — body: { allowed: ["ZW", "ZA", …] }. All others become not allowed.
adminCountriesRouter.put("/countries", async (req, res) => {
  try {
    const allowed = Array.isArray(req.body?.allowed)
      ? (req.body.allowed as unknown[]).map((c) => String(c).toUpperCase())
      : [];
    await execute(`UPDATE shop_country SET is_allowed = false, updated_at = NOW()`);
    if (allowed.length > 0) {
      // Use a parameterised IN(...) — Postgres tolerates up to several thousand params.
      const placeholders = allowed.map((_, i) => `$${i + 1}`).join(", ");
      await execute(
        `UPDATE shop_country SET is_allowed = true, updated_at = NOW()
          WHERE code IN (${placeholders})`,
        allowed
      );
    }
    const rows = await query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE is_allowed)::int AS allowed
       FROM shop_country`
    );
    res.json({ allowed_count: rows[0]?.allowed ?? 0, total: rows[0]?.total ?? 0 });
  } catch (err) {
    console.error("[admin countries bulk]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// Toggle a single country.
adminCountriesRouter.patch("/countries/:code", async (req, res) => {
  try {
    const code = String(req.params.code || "").toUpperCase();
    const is_allowed = Boolean(req.body?.is_allowed);
    await execute(
      `UPDATE shop_country SET is_allowed = $1, updated_at = NOW() WHERE code = $2`,
      [is_allowed, code]
    );
    res.json({ code, is_allowed });
  } catch (err) {
    console.error("[admin country toggle]", err);
    res.status(500).json({ error: "Failed" });
  }
});
