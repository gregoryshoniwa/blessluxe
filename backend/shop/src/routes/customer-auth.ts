import { Router } from "express";
import { v4 as uuid } from "uuid";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { queryOne, execute } from "../db/pool.ts";

export const customerAuthRouter = Router();
const newId = (p: string) => `${p}_${uuid().replace(/-/g, "")}`;
const JWT_SECRET = process.env.JWT_SECRET || "blessluxe-shop-secret-change-me";
const SESSION_TTL_DAYS = 30;

const sanitizeCustomer = (c: Record<string, unknown>) => ({
  id: c.id,
  email: c.email,
  first_name: c.first_name,
  last_name: c.last_name,
  phone: c.phone,
  loyalty_points: c.loyalty_points,
  loyalty_tier: c.loyalty_tier,
  referral_code: c.referral_code,
  marketing_consent: c.marketing_consent,
  avatar_url: c.avatar_url,
  email_verified_at: c.email_verified_at,
  created_at: c.created_at,
});

const generateReferralCode = (seed: string) =>
  `${seed.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 6) || "BLESS"}-${uuid()
    .slice(0, 4)
    .toUpperCase()}`;

// ─── POST /auth/customer/signup ─────────────────────────────
customerAuthRouter.post("/signup", async (req, res) => {
  try {
    const { email, password, first_name, last_name, phone, marketing_consent } = req.body as {
      email: string;
      password: string;
      first_name?: string;
      last_name?: string;
      phone?: string;
      marketing_consent?: boolean;
    };
    if (!email || !password) return res.status(400).json({ error: "email and password required" });
    if (password.length < 6) return res.status(400).json({ error: "password too short" });

    const existing = await queryOne(`SELECT id FROM shop_customer WHERE email = $1`, [
      email.toLowerCase(),
    ]);
    if (existing) return res.status(409).json({ error: "email already in use" });

    const id = newId("cust");
    const hashed = await bcrypt.hash(password, 12);
    const referralCode = generateReferralCode(first_name || email);
    await execute(
      `INSERT INTO shop_customer (id, email, password, first_name, last_name, phone, marketing_consent, referral_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        email.toLowerCase(),
        hashed,
        first_name || null,
        last_name || null,
        phone || null,
        marketing_consent ?? false,
        referralCode,
      ]
    );
    const customer = await queryOne(`SELECT * FROM shop_customer WHERE id = $1`, [id]);
    const { token } = await issueSession(id);
    res.status(201).json({ token, customer: sanitizeCustomer(customer!) });
  } catch (err) {
    console.error("[customer signup]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── POST /auth/customer/login ─────────────────────────────
customerAuthRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const customer = await queryOne(
      `SELECT * FROM shop_customer WHERE email = $1`,
      [email.toLowerCase()]
    );
    if (!customer || !customer.password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const ok = await bcrypt.compare(password, String(customer.password));
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    await execute(`UPDATE shop_customer SET last_login_at = NOW() WHERE id = $1`, [customer.id]);
    const { token } = await issueSession(String(customer.id));
    res.json({ token, customer: sanitizeCustomer(customer) });
  } catch (err) {
    console.error("[customer login]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── POST /auth/customer/oauth ─────────────────────────────
// Find-or-create by oauth_provider + oauth_subject, returns a session token.
customerAuthRouter.post("/oauth", async (req, res) => {
  try {
    const { provider, subject, email, first_name, last_name, avatar_url } = req.body as {
      provider: string;
      subject: string;
      email: string;
      first_name?: string;
      last_name?: string;
      avatar_url?: string;
    };
    if (!provider || !subject || !email) {
      return res.status(400).json({ error: "provider, subject, email required" });
    }

    let customer = await queryOne(
      `SELECT * FROM shop_customer WHERE oauth_provider = $1 AND oauth_subject = $2`,
      [provider, subject]
    );
    if (!customer) {
      customer = await queryOne(`SELECT * FROM shop_customer WHERE email = $1`, [
        email.toLowerCase(),
      ]);
    }
    if (!customer) {
      const id = newId("cust");
      const referralCode = generateReferralCode(first_name || email);
      await execute(
        `INSERT INTO shop_customer
          (id, email, first_name, last_name, oauth_provider, oauth_subject, avatar_url, referral_code, email_verified_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
        [
          id,
          email.toLowerCase(),
          first_name || null,
          last_name || null,
          provider,
          subject,
          avatar_url || null,
          referralCode,
        ]
      );
      customer = await queryOne(`SELECT * FROM shop_customer WHERE id = $1`, [id]);
    } else {
      await execute(
        `UPDATE shop_customer
         SET oauth_provider = $1, oauth_subject = $2, avatar_url = COALESCE($3, avatar_url),
             last_login_at = NOW(), email_verified_at = COALESCE(email_verified_at, NOW())
         WHERE id = $4`,
        [provider, subject, avatar_url || null, customer.id]
      );
    }

    const { token } = await issueSession(String(customer.id));
    res.json({ token, customer: sanitizeCustomer(customer) });
  } catch (err) {
    console.error("[customer oauth]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── GET /auth/customer/me ─────────────────────────────
customerAuthRouter.get("/me", async (req, res) => {
  try {
    const customerId = await resolveCustomerId(req.headers.authorization);
    if (!customerId) return res.status(401).json({ error: "Not authenticated" });
    const customer = await queryOne(`SELECT * FROM shop_customer WHERE id = $1`, [customerId]);
    if (!customer) return res.status(401).json({ error: "Not authenticated" });
    res.json({ customer: sanitizeCustomer(customer) });
  } catch (err) {
    console.error("[customer me]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── GET /auth/customer/affiliate ─────────────────────────────
// Returns the authenticated customer's own shop_affiliate record (if any),
// keyed off the customer's email. The storefront uses this so the affiliate
// status shown on the customer account page matches what the admin sees.
customerAuthRouter.get("/affiliate", async (req, res) => {
  try {
    const customerId = await resolveCustomerId(req.headers.authorization);
    if (!customerId) return res.status(401).json({ error: "Not authenticated" });
    const customer = await queryOne(`SELECT email FROM shop_customer WHERE id = $1`, [customerId]);
    if (!customer?.email) return res.json({ affiliate: null });
    const affiliate = await queryOne(
      `SELECT id, code, first_name, last_name, email, commission_rate, status,
              total_earnings, paid_out, created_at, updated_at
       FROM shop_affiliate
       WHERE lower(email) = lower($1)
       LIMIT 1`,
      [String(customer.email)]
    );
    if (!affiliate) return res.json({ affiliate: null });
    res.json({
      affiliate: {
        id: affiliate.id,
        code: affiliate.code,
        first_name: affiliate.first_name,
        last_name: affiliate.last_name,
        email: affiliate.email,
        commission_rate: Number(affiliate.commission_rate),
        status: affiliate.status,
        total_earnings: Number(affiliate.total_earnings),
        paid_out: Number(affiliate.paid_out),
        created_at: affiliate.created_at,
        updated_at: affiliate.updated_at,
      },
    });
  } catch (err) {
    console.error("[customer affiliate]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ─── POST /auth/customer/logout ─────────────────────────────
customerAuthRouter.post("/logout", async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (token) {
      await execute(`DELETE FROM shop_customer_session WHERE token = $1`, [token]);
    }
    res.json({ ok: true });
  } catch {
    res.json({ ok: true });
  }
});

async function issueSession(customerId: string) {
  const sessionId = newId("sess");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const token = jwt.sign(
    { kind: "customer", sub: customerId, sid: sessionId },
    JWT_SECRET,
    { expiresIn: `${SESSION_TTL_DAYS}d` }
  );
  await execute(
    `INSERT INTO shop_customer_session (id, customer_id, token, expires_at) VALUES ($1, $2, $3, $4)`,
    [sessionId, customerId, token, expiresAt]
  );
  return { token };
}

async function resolveCustomerId(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      kind?: string;
      sub?: string;
      sid?: string;
    };
    if (decoded.kind !== "customer" || !decoded.sub) return null;
    const session = await queryOne(
      `SELECT customer_id FROM shop_customer_session WHERE token = $1 AND expires_at > NOW()`,
      [token]
    );
    return session ? String(session.customer_id) : decoded.sub;
  } catch {
    return null;
  }
}

export { resolveCustomerId };
