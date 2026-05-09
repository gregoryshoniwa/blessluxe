import { Router } from "express";
import { v4 as uuid } from "uuid";
import { queryOne, execute } from "../db/pool.ts";
import { resolveCustomerId } from "./customer-auth.ts";

export const storeAffiliatesRouter = Router();
const newId = (p: string) => `${p}_${uuid().replace(/-/g, "")}`;

// POST /store/affiliates/apply — public application form
storeAffiliatesRouter.post("/apply", async (req, res) => {
  try {
    const customerId = await resolveCustomerId(req.headers.authorization);
    const { email, first_name, last_name, code, notes } = req.body as {
      email: string;
      first_name?: string;
      last_name?: string;
      code?: string;
      notes?: string;
    };
    if (!email) return res.status(400).json({ error: "email required" });

    const existing = await queryOne(
      `SELECT id FROM shop_affiliate WHERE email = $1`,
      [email.toLowerCase()]
    );
    if (existing) {
      return res.status(409).json({ error: "Application already exists for this email" });
    }
    const id = newId("aff");
    const seed = first_name || email;
    const finalCode = (
      code ||
      `${seed.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 6)}-${uuid()
        .slice(0, 4)
        .toUpperCase()}`
    ).toUpperCase();

    await execute(
      `INSERT INTO shop_affiliate
         (id, code, first_name, last_name, email, status, metadata)
       VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
      [
        id,
        finalCode,
        first_name || null,
        last_name || null,
        email.toLowerCase(),
        notes || customerId
          ? JSON.stringify({ notes: notes || null, customer_id: customerId })
          : null,
      ]
    );
    const affiliate = await queryOne(`SELECT * FROM shop_affiliate WHERE id = $1`, [id]);
    res.status(201).json({ affiliate });
  } catch (err) {
    console.error("[store affiliate apply]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /store/affiliates/by-code/:code — used by storefront to render banners
storeAffiliatesRouter.get("/by-code/:code", async (req, res) => {
  try {
    const row = await queryOne(
      `SELECT id, code, first_name, last_name, status FROM shop_affiliate WHERE code = $1 AND status = 'active'`,
      [req.params.code.toUpperCase()]
    );
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ affiliate: row });
  } catch (err) {
    console.error("[store affiliate by code]", err);
    res.status(500).json({ error: "Failed" });
  }
});
