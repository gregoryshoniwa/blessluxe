import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";

export const adminCustomersRouter = Router();

const TIERS = ["bronze", "silver", "gold", "platinum"] as const;

adminCustomersRouter.get("/customers", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const q = (req.query.q as string) || undefined;
    const tier = (req.query.tier as string) || undefined;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (q) {
      conditions.push(
        `(email ILIKE $${idx} OR first_name ILIKE $${idx} OR last_name ILIKE $${idx})`
      );
      params.push(`%${q}%`);
      idx++;
    }
    if (tier) { conditions.push(`loyalty_tier = $${idx++}`); params.push(tier); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit, offset);
    const rows = await query(
      `SELECT id, email, first_name, last_name, phone, loyalty_points, loyalty_tier,
              referral_code, referred_by, marketing_consent, created_at, updated_at
       FROM shop_customer ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );
    const totalRow = await queryOne(
      `SELECT count(*)::int AS total FROM shop_customer ${where}`,
      params.slice(0, params.length - 2)
    );
    res.json({ customers: rows, count: Number(totalRow?.total || rows.length), offset, limit });
  } catch (err) {
    console.error("[admin customers list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminCustomersRouter.get("/customers/:id", async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT id, email, first_name, last_name, phone, date_of_birth, gender,
              marketing_consent, loyalty_points, loyalty_tier, referral_code, referred_by,
              style_preferences, size_profile, metadata, created_at, updated_at
       FROM shop_customer WHERE id = $1`,
      [req.params.id]
    );
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ customer: row });
  } catch (err) {
    console.error("[admin customer get]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminCustomersRouter.post("/customers", async (req, res) => {
  try {
    const body = req.body as {
      email: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      loyalty_points?: number;
      loyalty_tier?: string;
      marketing_consent?: boolean;
    };
    if (!body.email) {
      res.status(400).json({ error: "email is required" });
      return;
    }
    const id = `cust_${uuid().replace(/-/g, "")}`;
    const referralCode = `${(body.first_name || body.email)
      .replace(/[^a-z0-9]/gi, "")
      .toUpperCase()
      .slice(0, 6)}-${uuid().slice(0, 4).toUpperCase()}`;
    await execute(
      `INSERT INTO shop_customer (id, email, first_name, last_name, phone,
                                  loyalty_points, loyalty_tier, marketing_consent, referral_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        body.email,
        body.first_name || null,
        body.last_name || null,
        body.phone || null,
        body.loyalty_points ?? 0,
        body.loyalty_tier && TIERS.includes(body.loyalty_tier as (typeof TIERS)[number])
          ? body.loyalty_tier
          : "bronze",
        body.marketing_consent ?? false,
        referralCode,
      ]
    );
    const customer = await queryOne(`SELECT * FROM shop_customer WHERE id = $1`, [id]);
    res.status(201).json({ customer });
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "Email already in use" });
      return;
    }
    console.error("[admin customer create]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminCustomersRouter.patch("/customers/:id", async (req, res) => {
  try {
    const body = req.body as Partial<{
      email: string;
      first_name: string;
      last_name: string;
      phone: string;
      loyalty_points: number;
      loyalty_tier: string;
      marketing_consent: boolean;
      style_preferences: Record<string, unknown>;
      size_profile: Record<string, unknown>;
      metadata: Record<string, unknown>;
    }>;
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const setField = (col: string, val: unknown) => {
      sets.push(`${col} = $${idx++}`);
      params.push(val);
    };
    if (body.email !== undefined) setField("email", body.email);
    if (body.first_name !== undefined) setField("first_name", body.first_name);
    if (body.last_name !== undefined) setField("last_name", body.last_name);
    if (body.phone !== undefined) setField("phone", body.phone);
    if (body.loyalty_points !== undefined) setField("loyalty_points", body.loyalty_points);
    if (body.loyalty_tier !== undefined) setField("loyalty_tier", body.loyalty_tier);
    if (body.marketing_consent !== undefined) setField("marketing_consent", body.marketing_consent);
    if (body.style_preferences !== undefined) setField("style_preferences", JSON.stringify(body.style_preferences));
    if (body.size_profile !== undefined) setField("size_profile", JSON.stringify(body.size_profile));
    if (body.metadata !== undefined) setField("metadata", JSON.stringify(body.metadata));
    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      params.push(req.params.id);
      await execute(`UPDATE shop_customer SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    }
    const customer = await queryOne(`SELECT * FROM shop_customer WHERE id = $1`, [req.params.id]);
    if (!customer) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ customer });
  } catch (err) {
    console.error("[admin customer update]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminCustomersRouter.post("/customers/:id/loyalty", async (req, res) => {
  try {
    const { delta, reason } = req.body as { delta: number; reason?: string };
    if (typeof delta !== "number") {
      res.status(400).json({ error: "delta must be a number" });
      return;
    }
    await execute(
      `UPDATE shop_customer SET loyalty_points = GREATEST(0, loyalty_points + $1), updated_at = NOW() WHERE id = $2`,
      [delta, req.params.id]
    );
    const customer = await queryOne(`SELECT * FROM shop_customer WHERE id = $1`, [req.params.id]);
    res.json({ customer, applied: { delta, reason: reason || null } });
  } catch (err) {
    console.error("[admin customer loyalty]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminCustomersRouter.delete("/customers/:id", async (req, res) => {
  try {
    await execute(`DELETE FROM shop_customer WHERE id = $1`, [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error("[admin customer delete]", err);
    res.status(500).json({ error: "Failed" });
  }
});
