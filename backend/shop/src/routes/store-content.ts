import { Router } from "express";
import { query } from "../db/pool.ts";

export const storeContentRouter = Router();

// FAQs that customers can view. Inactive items are hidden.
storeContentRouter.get("/faqs", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT id, question, answer, category, sort_order
       FROM shop_faq
       WHERE is_active = true
       ORDER BY COALESCE(category, ''), sort_order ASC, created_at ASC`
    );
    res.json({ faqs: rows });
  } catch (err) {
    console.error("[store faqs]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// Active announcements for a given position (hero | top_bar), honouring date window.
storeContentRouter.get("/announcements", async (req, res) => {
  try {
    const position = String(req.query.position || "hero");
    const rows = await query(
      `SELECT id, position, media_type, media_url, poster_url,
              heading, subheading, cta_label, cta_href, text_align, sort_order
       FROM shop_announcement
       WHERE position = $1
         AND is_active = true
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (ends_at IS NULL OR ends_at >= NOW())
       ORDER BY sort_order ASC, created_at ASC`,
      [position]
    );
    res.json({ announcements: rows });
  } catch (err) {
    console.error("[store announcements]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// Active currencies + which is root. Used by the storefront price formatter.
storeContentRouter.get("/currencies", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT code, name, symbol, rate_to_root, is_root, sort_order
       FROM shop_currency
       WHERE is_active = true
       ORDER BY is_root DESC, sort_order ASC, code ASC`
    );
    const root = rows.find((r) => r.is_root) || rows[0] || null;
    res.json({ currencies: rows, root: root?.code || null });
  } catch (err) {
    console.error("[store currencies]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// Allow-list bulk fetch for the storefront middleware (cached on its side).
storeContentRouter.get("/countries/allowed", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT code FROM shop_country WHERE is_allowed = true ORDER BY code`
    );
    res.json({ allowed: rows.map((r) => String(r.code).toUpperCase()) });
  } catch (err) {
    console.error("[store allowed countries]", err);
    res.json({ allowed: [] });
  }
});

// Country-gate: does the given country have access to the storefront?
// Caller passes ?country=XX (typically Cloudflare's CF-IPCountry header).
// Fails open in three cases so we never lock everyone out by mistake:
//   - no country signal at all (localhost / non-CF deploy)
//   - no countries marked allowed in admin yet
//   - any database error
storeContentRouter.get("/access", async (req, res) => {
  try {
    const code = String(req.query.country || "").toUpperCase().slice(0, 2);
    if (!code) {
      return res.json({ allowed: true, country: null, reason: "no-signal" });
    }
    const totalRow = await query(
      `SELECT count(*)::int AS c FROM shop_country WHERE is_allowed = true`
    );
    const allowedTotal = totalRow[0]?.c ?? 0;
    if (allowedTotal === 0) {
      // Admin hasn't configured an allow-list yet — open by default.
      return res.json({ allowed: true, country: code, reason: "no-allowlist" });
    }
    const row = await query(
      `SELECT count(*)::int AS c FROM shop_country WHERE code = $1 AND is_allowed = true`,
      [code]
    );
    const allowed = (row[0]?.c ?? 0) > 0;
    res.json({ allowed, country: code });
  } catch (err) {
    console.error("[store access]", err);
    res.json({ allowed: true, country: null, reason: "error" });
  }
});

// Public settings the storefront may need (e.g. how many bits a review earns).
storeContentRouter.get("/settings/public", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT key, value FROM shop_setting WHERE key IN ('review_reward_bits', 'announcement_rotation_seconds')`
    );
    const out: Record<string, string | null> = {};
    for (const r of rows) out[String(r.key)] = (r.value as string) ?? null;
    res.json({ settings: out });
  } catch (err) {
    console.error("[store settings public]", err);
    res.status(500).json({ error: "Failed" });
  }
});
