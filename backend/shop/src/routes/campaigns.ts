import { Router } from "express";
import { query } from "../db/pool.ts";

export const campaignsRouter = Router();

// GET /store/campaigns — currently active campaigns (banner + countdown)
campaignsRouter.get("/", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT c.id, c.name, c.handle, c.description, c.banner_url, c.banner_text,
              c.banner_cta_label, c.banner_cta_href, c.discount_percent,
              c.starts_at, c.ends_at, c.show_countdown
       FROM shop_campaign c
       WHERE c.is_active = true
         AND c.starts_at <= NOW()
         AND c.ends_at >= NOW()
       ORDER BY c.starts_at DESC`
    );
    res.json({ campaigns: rows });
  } catch (err) {
    console.error("[campaigns list]", err);
    res.status(500).json({ error: "Failed" });
  }
});
