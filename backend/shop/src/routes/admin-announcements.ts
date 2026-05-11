import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";

export const adminAnnouncementsRouter = Router();
const newId = () => `ann_${uuid().replace(/-/g, "")}`;

const POSITIONS = new Set(["hero", "top_bar"]);
const MEDIA_TYPES = new Set(["image", "video", "gif"]);

adminAnnouncementsRouter.get("/announcements", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM shop_announcement ORDER BY position, sort_order ASC, created_at ASC`
    );
    res.json({ announcements: rows });
  } catch (err) {
    console.error("[admin announcements list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminAnnouncementsRouter.post("/announcements", async (req, res) => {
  try {
    const b = req.body as {
      position?: string;
      media_type?: string;
      media_url: string;
      poster_url?: string;
      heading?: string;
      subheading?: string;
      cta_label?: string;
      cta_href?: string;
      text_align?: string;
      sort_order?: number;
      is_active?: boolean;
      starts_at?: string | null;
      ends_at?: string | null;
    };
    if (!b.media_url?.trim()) {
      return res.status(400).json({ error: "media_url required" });
    }
    const position = POSITIONS.has(String(b.position || "")) ? String(b.position) : "hero";
    const mediaType = MEDIA_TYPES.has(String(b.media_type || "")) ? String(b.media_type) : "image";
    const id = newId();
    await execute(
      `INSERT INTO shop_announcement
        (id, position, media_type, media_url, poster_url, heading, subheading,
         cta_label, cta_href, text_align, sort_order, is_active, starts_at, ends_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        id,
        position,
        mediaType,
        b.media_url.trim(),
        b.poster_url?.trim() || null,
        b.heading?.trim() || null,
        b.subheading?.trim() || null,
        b.cta_label?.trim() || null,
        b.cta_href?.trim() || null,
        b.text_align?.trim() || "left",
        Number.isFinite(b.sort_order) ? b.sort_order : 0,
        b.is_active !== false,
        b.starts_at || null,
        b.ends_at || null,
      ]
    );
    const row = await queryOne(`SELECT * FROM shop_announcement WHERE id = $1`, [id]);
    res.status(201).json({ announcement: row });
  } catch (err) {
    console.error("[admin announcement create]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminAnnouncementsRouter.patch("/announcements/:id", async (req, res) => {
  try {
    const b = req.body as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    const setStr = (col: string, val: unknown) => {
      sets.push(`${col} = $${i++}`);
      params.push(val);
    };
    if (b.position !== undefined) {
      const p = String(b.position);
      if (!POSITIONS.has(p)) return res.status(400).json({ error: "bad position" });
      setStr("position", p);
    }
    if (b.media_type !== undefined) {
      const m = String(b.media_type);
      if (!MEDIA_TYPES.has(m)) return res.status(400).json({ error: "bad media_type" });
      setStr("media_type", m);
    }
    if (b.media_url !== undefined) setStr("media_url", String(b.media_url));
    if (b.poster_url !== undefined) setStr("poster_url", b.poster_url ? String(b.poster_url) : null);
    if (b.heading !== undefined) setStr("heading", b.heading ? String(b.heading) : null);
    if (b.subheading !== undefined) setStr("subheading", b.subheading ? String(b.subheading) : null);
    if (b.cta_label !== undefined) setStr("cta_label", b.cta_label ? String(b.cta_label) : null);
    if (b.cta_href !== undefined) setStr("cta_href", b.cta_href ? String(b.cta_href) : null);
    if (b.text_align !== undefined) setStr("text_align", String(b.text_align || "left"));
    if (b.sort_order !== undefined) setStr("sort_order", Number(b.sort_order));
    if (b.is_active !== undefined) setStr("is_active", Boolean(b.is_active));
    if (b.starts_at !== undefined) setStr("starts_at", b.starts_at || null);
    if (b.ends_at !== undefined) setStr("ends_at", b.ends_at || null);
    if (sets.length > 0) {
      sets.push("updated_at = NOW()");
      params.push(req.params.id);
      await execute(`UPDATE shop_announcement SET ${sets.join(", ")} WHERE id = $${i}`, params);
    }
    const row = await queryOne(`SELECT * FROM shop_announcement WHERE id = $1`, [req.params.id]);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ announcement: row });
  } catch (err) {
    console.error("[admin announcement update]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminAnnouncementsRouter.delete("/announcements/:id", async (req, res) => {
  try {
    await execute(`DELETE FROM shop_announcement WHERE id = $1`, [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error("[admin announcement delete]", err);
    res.status(500).json({ error: "Failed" });
  }
});
