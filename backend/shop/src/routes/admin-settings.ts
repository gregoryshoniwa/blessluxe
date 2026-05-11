import { Router } from "express";
import { query, queryOne, execute } from "../db/pool.ts";

export const adminSettingsRouter = Router();

const ALLOWED_KEYS = new Set([
  "review_reward_bits",
  "announcement_rotation_seconds",
]);

// Read all (or only allowed keys)
adminSettingsRouter.get("/settings", async (_req, res) => {
  try {
    const rows = await query(`SELECT key, value, updated_at FROM shop_setting`);
    const out: Record<string, string | null> = {};
    for (const r of rows) out[String(r.key)] = (r.value as string) ?? null;
    res.json({ settings: out });
  } catch (err) {
    console.error("[admin settings list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// Upsert a single setting
adminSettingsRouter.put("/settings/:key", async (req, res) => {
  try {
    const key = String(req.params.key || "").trim();
    if (!ALLOWED_KEYS.has(key)) {
      return res.status(400).json({ error: `Unknown setting key: ${key}` });
    }
    const value = req.body?.value == null ? null : String(req.body.value);
    await execute(
      `INSERT INTO shop_setting (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value]
    );
    const row = await queryOne(`SELECT key, value, updated_at FROM shop_setting WHERE key = $1`, [
      key,
    ]);
    res.json({ setting: row });
  } catch (err) {
    console.error("[admin settings put]", err);
    res.status(500).json({ error: "Failed" });
  }
});
