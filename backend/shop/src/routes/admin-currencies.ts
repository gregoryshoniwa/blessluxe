import { Router } from "express";
import { query, queryOne, execute } from "../db/pool.ts";

export const adminCurrenciesRouter = Router();

adminCurrenciesRouter.get("/currencies", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT code, name, symbol, rate_to_root, is_root, is_active, sort_order, updated_at
       FROM shop_currency ORDER BY is_root DESC, sort_order ASC, code ASC`
    );
    res.json({ currencies: rows });
  } catch (err) {
    console.error("[admin currencies list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// Upsert (create new or update existing). Setting is_root flips all others off.
adminCurrenciesRouter.put("/currencies/:code", async (req, res) => {
  try {
    const code = String(req.params.code || "").toLowerCase().trim();
    if (!/^[a-z]{3}$/.test(code)) {
      return res.status(400).json({ error: "code must be 3 lowercase letters" });
    }
    const b = req.body as {
      name?: string;
      symbol?: string;
      rate_to_root?: number;
      is_root?: boolean;
      is_active?: boolean;
      sort_order?: number;
    };

    // Race-safe single-root: if setting this row as root, demote any other root.
    if (b.is_root === true) {
      await execute(
        `UPDATE shop_currency SET is_root = false, updated_at = NOW()
          WHERE is_root = true AND code <> $1`,
        [code]
      );
    }

    const existing = await queryOne(`SELECT code FROM shop_currency WHERE code = $1`, [code]);
    if (existing) {
      const sets: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      const set = (col: string, val: unknown) => { sets.push(`${col} = $${i++}`); params.push(val); };
      if (b.name !== undefined) set("name", String(b.name).trim());
      if (b.symbol !== undefined) set("symbol", b.symbol ? String(b.symbol) : null);
      if (b.rate_to_root !== undefined) set("rate_to_root", Number(b.rate_to_root));
      if (b.is_root !== undefined) set("is_root", Boolean(b.is_root));
      if (b.is_active !== undefined) set("is_active", Boolean(b.is_active));
      if (b.sort_order !== undefined) set("sort_order", Number(b.sort_order));
      if (sets.length > 0) {
        sets.push("updated_at = NOW()");
        params.push(code);
        await execute(`UPDATE shop_currency SET ${sets.join(", ")} WHERE code = $${i}`, params);
      }
    } else {
      await execute(
        `INSERT INTO shop_currency (code, name, symbol, rate_to_root, is_root, is_active, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          code,
          String(b.name || code.toUpperCase()).trim(),
          b.symbol ? String(b.symbol) : null,
          Number(b.rate_to_root ?? 1),
          Boolean(b.is_root),
          b.is_active === undefined ? true : Boolean(b.is_active),
          Number(b.sort_order ?? 99),
        ]
      );
    }

    const row = await queryOne(`SELECT * FROM shop_currency WHERE code = $1`, [code]);
    res.json({ currency: row });
  } catch (err) {
    console.error("[admin currency upsert]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminCurrenciesRouter.delete("/currencies/:code", async (req, res) => {
  try {
    const code = String(req.params.code || "").toLowerCase().trim();
    const row = await queryOne(`SELECT is_root FROM shop_currency WHERE code = $1`, [code]);
    if (row?.is_root) {
      return res.status(400).json({ error: "Cannot delete the root currency. Set another as root first." });
    }
    await execute(`DELETE FROM shop_currency WHERE code = $1`, [code]);
    res.json({ deleted: true });
  } catch (err) {
    console.error("[admin currency delete]", err);
    res.status(500).json({ error: "Failed" });
  }
});
