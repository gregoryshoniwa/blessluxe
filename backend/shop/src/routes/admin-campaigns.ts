import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";

export const adminCampaignsRouter = Router();
const newId = (p: string) => `${p}_${uuid().replace(/-/g, "")}`;

adminCampaignsRouter.get("/campaigns", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT c.*,
              (SELECT count(*) FROM shop_campaign_product m WHERE m.campaign_id = c.id)::int AS product_count
       FROM shop_campaign c
       ORDER BY c.starts_at DESC`
    );
    res.json({ campaigns: rows });
  } catch (err) {
    console.error("[admin campaigns list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminCampaignsRouter.get("/campaigns/:id", async (req, res) => {
  try {
    const campaign = await queryOne(`SELECT * FROM shop_campaign WHERE id = $1`, [req.params.id]);
    if (!campaign) return res.status(404).json({ error: "Not found" });
    const products = await query(
      `SELECT p.id, p.title, p.handle, p.thumbnail
       FROM shop_campaign_product m
       JOIN shop_product p ON p.id = m.product_id
       WHERE m.campaign_id = $1
       ORDER BY p.title`,
      [req.params.id]
    );
    res.json({ campaign: { ...campaign, products } });
  } catch (err) {
    console.error("[admin campaign get]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminCampaignsRouter.post("/campaigns", async (req, res) => {
  try {
    const b = req.body as {
      name: string;
      handle?: string;
      description?: string;
      banner_url?: string;
      banner_text?: string;
      banner_cta_label?: string;
      banner_cta_href?: string;
      discount_percent?: number;
      starts_at: string;
      ends_at: string;
      is_active?: boolean;
      show_countdown?: boolean;
      product_ids?: string[];
    };
    if (!b.name || !b.starts_at || !b.ends_at) {
      return res.status(400).json({ error: "name, starts_at, ends_at required" });
    }
    const id = newId("camp");
    const handle =
      (b.handle || b.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") + (b.handle ? "" : "");
    await execute(
      `INSERT INTO shop_campaign
        (id, name, handle, description, banner_url, banner_text, banner_cta_label, banner_cta_href,
         discount_percent, starts_at, ends_at, is_active, show_countdown)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id, b.name, handle, b.description || null, b.banner_url || null, b.banner_text || null,
        b.banner_cta_label || null, b.banner_cta_href || null, b.discount_percent ?? null,
        b.starts_at, b.ends_at, b.is_active ?? true, b.show_countdown ?? true,
      ]
    );
    if (b.product_ids?.length) {
      for (const pid of b.product_ids) {
        await execute(
          `INSERT INTO shop_campaign_product (campaign_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, pid]
        );
      }
    }
    const campaign = await queryOne(`SELECT * FROM shop_campaign WHERE id = $1`, [id]);
    res.status(201).json({ campaign });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") {
      return res.status(409).json({ error: "Handle already in use" });
    }
    console.error("[admin campaign create]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminCampaignsRouter.patch("/campaigns/:id", async (req, res) => {
  try {
    const body = req.body as Partial<{
      name: string;
      handle: string;
      description: string;
      banner_url: string;
      banner_text: string;
      banner_cta_label: string;
      banner_cta_href: string;
      discount_percent: number;
      starts_at: string;
      ends_at: string;
      is_active: boolean;
      show_countdown: boolean;
      product_ids: string[];
    }>;
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    const set = (col: string, val: unknown) => {
      sets.push(`${col} = $${i++}`);
      params.push(val);
    };
    if (body.name !== undefined) set("name", body.name);
    if (body.handle !== undefined) set("handle", body.handle);
    if (body.description !== undefined) set("description", body.description);
    if (body.banner_url !== undefined) set("banner_url", body.banner_url);
    if (body.banner_text !== undefined) set("banner_text", body.banner_text);
    if (body.banner_cta_label !== undefined) set("banner_cta_label", body.banner_cta_label);
    if (body.banner_cta_href !== undefined) set("banner_cta_href", body.banner_cta_href);
    if (body.discount_percent !== undefined) set("discount_percent", body.discount_percent);
    if (body.starts_at !== undefined) set("starts_at", body.starts_at);
    if (body.ends_at !== undefined) set("ends_at", body.ends_at);
    if (body.is_active !== undefined) set("is_active", body.is_active);
    if (body.show_countdown !== undefined) set("show_countdown", body.show_countdown);
    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      params.push(req.params.id);
      await execute(`UPDATE shop_campaign SET ${sets.join(", ")} WHERE id = $${i}`, params);
    }
    if (Array.isArray(body.product_ids)) {
      await execute(`DELETE FROM shop_campaign_product WHERE campaign_id = $1`, [req.params.id]);
      for (const pid of body.product_ids) {
        await execute(
          `INSERT INTO shop_campaign_product (campaign_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [req.params.id, pid]
        );
      }
    }
    const campaign = await queryOne(`SELECT * FROM shop_campaign WHERE id = $1`, [req.params.id]);
    res.json({ campaign });
  } catch (err) {
    console.error("[admin campaign update]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminCampaignsRouter.delete("/campaigns/:id", async (req, res) => {
  try {
    await execute(`DELETE FROM shop_campaign WHERE id = $1`, [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error("[admin campaign delete]", err);
    res.status(500).json({ error: "Failed" });
  }
});
