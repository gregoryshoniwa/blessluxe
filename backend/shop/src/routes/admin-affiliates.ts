import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";

export const adminAffiliatesRouter = Router();

adminAffiliatesRouter.get("/affiliates", async (req, res) => {
  try {
    const status = (req.query.status as string) || undefined;
    const q = (req.query.q as string) || undefined;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (q) {
      conditions.push(`(email ILIKE $${idx} OR code ILIKE $${idx} OR first_name ILIKE $${idx} OR last_name ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await query(
      `SELECT * FROM shop_affiliate ${where} ORDER BY created_at DESC`,
      params
    );
    res.json({ affiliates: rows });
  } catch (err) {
    console.error("[admin affiliates list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminAffiliatesRouter.get("/affiliates/:id", async (req, res) => {
  try {
    const affiliate = await queryOne(`SELECT * FROM shop_affiliate WHERE id = $1`, [req.params.id]);
    if (!affiliate) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [sales, payouts] = await Promise.all([
      query(
        `SELECT * FROM shop_affiliate_sale WHERE affiliate_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.params.id]
      ),
      query(
        `SELECT * FROM shop_affiliate_payout WHERE affiliate_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.params.id]
      ),
    ]);
    res.json({ affiliate: { ...affiliate, sales, payouts } });
  } catch (err) {
    console.error("[admin affiliate get]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminAffiliatesRouter.post("/affiliates", async (req, res) => {
  try {
    const body = req.body as {
      email: string;
      first_name?: string;
      last_name?: string;
      code?: string;
      commission_rate?: number;
      status?: string;
    };
    if (!body.email) {
      res.status(400).json({ error: "email is required" });
      return;
    }
    const id = `aff_${uuid().replace(/-/g, "")}`;
    const code = (
      body.code ||
      `${(body.first_name || body.email)
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase()
        .slice(0, 6)}-${uuid().slice(0, 4).toUpperCase()}`
    ).toUpperCase();
    await execute(
      `INSERT INTO shop_affiliate (id, code, first_name, last_name, email, commission_rate, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        code,
        body.first_name || null,
        body.last_name || null,
        body.email,
        body.commission_rate ?? 10,
        body.status || "pending",
      ]
    );
    const affiliate = await queryOne(`SELECT * FROM shop_affiliate WHERE id = $1`, [id]);
    res.status(201).json({ affiliate });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "Email or code already in use" });
      return;
    }
    console.error("[admin affiliate create]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminAffiliatesRouter.patch("/affiliates/:id", async (req, res) => {
  try {
    const body = req.body as Partial<{
      first_name: string;
      last_name: string;
      email: string;
      code: string;
      commission_rate: number;
      status: string;
    }>;
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const set = (col: string, val: unknown) => {
      sets.push(`${col} = $${idx++}`);
      params.push(val);
    };
    if (body.first_name !== undefined) set("first_name", body.first_name);
    if (body.last_name !== undefined) set("last_name", body.last_name);
    if (body.email !== undefined) set("email", body.email);
    if (body.code !== undefined) set("code", body.code);
    if (body.commission_rate !== undefined) set("commission_rate", body.commission_rate);
    if (body.status !== undefined) set("status", body.status);
    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      params.push(req.params.id);
      await execute(`UPDATE shop_affiliate SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    }
    const affiliate = await queryOne(`SELECT * FROM shop_affiliate WHERE id = $1`, [req.params.id]);
    res.json({ affiliate });
  } catch (err) {
    console.error("[admin affiliate update]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminAffiliatesRouter.delete("/affiliates/:id", async (req, res) => {
  try {
    await execute(`DELETE FROM shop_affiliate WHERE id = $1`, [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error("[admin affiliate delete]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// Payouts
adminAffiliatesRouter.post("/affiliates/:id/payouts", async (req, res) => {
  try {
    const body = req.body as {
      amount: number;
      currency_code?: string;
      method?: string;
      reference?: string;
      notes?: string;
    };
    if (!body.amount || body.amount <= 0) {
      res.status(400).json({ error: "amount must be positive" });
      return;
    }
    const id = `payout_${uuid().replace(/-/g, "")}`;
    await execute(
      `INSERT INTO shop_affiliate_payout (id, affiliate_id, amount, currency_code, method, status, reference, notes)
       VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)`,
      [
        id,
        req.params.id,
        body.amount,
        body.currency_code || "usd",
        body.method || "bank_transfer",
        body.reference || null,
        body.notes || null,
      ]
    );
    const payout = await queryOne(`SELECT * FROM shop_affiliate_payout WHERE id = $1`, [id]);
    res.status(201).json({ payout });
  } catch (err) {
    console.error("[admin affiliate payout create]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminAffiliatesRouter.patch("/payouts/:id", async (req, res) => {
  try {
    const body = req.body as Partial<{ status: string; reference: string; notes: string }>;
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (body.status !== undefined) { sets.push(`status = $${idx++}`); params.push(body.status); }
    if (body.reference !== undefined) { sets.push(`reference = $${idx++}`); params.push(body.reference); }
    if (body.notes !== undefined) { sets.push(`notes = $${idx++}`); params.push(body.notes); }
    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      params.push(req.params.id);
      await execute(`UPDATE shop_affiliate_payout SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    }

    if (body.status === "completed") {
      const payout = await queryOne(`SELECT * FROM shop_affiliate_payout WHERE id = $1`, [
        req.params.id,
      ]);
      if (payout) {
        await execute(
          `UPDATE shop_affiliate SET paid_out = paid_out + $1, updated_at = NOW() WHERE id = $2`,
          [Number(payout.amount), payout.affiliate_id]
        );
      }
    }
    const payout = await queryOne(`SELECT * FROM shop_affiliate_payout WHERE id = $1`, [req.params.id]);
    res.json({ payout });
  } catch (err) {
    console.error("[admin payout update]", err);
    res.status(500).json({ error: "Failed" });
  }
});
