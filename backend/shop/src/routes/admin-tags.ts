import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";

export const adminTagsRouter = Router();

// List all tags (with usage counts)
adminTagsRouter.get("/tags", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT t.id, t.value,
              (SELECT count(*) FROM shop_product_tag_map m WHERE m.tag_id = t.id)::int AS product_count
       FROM shop_product_tag t
       ORDER BY t.value`
    );
    res.json({ tags: rows });
  } catch (err) {
    console.error("[admin tags list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// Create a new tag
adminTagsRouter.post("/tags", async (req, res) => {
  try {
    const { value } = req.body as { value: string };
    if (!value) return res.status(400).json({ error: "value required" });
    const normalized = value.trim().toLowerCase();
    const existing = await queryOne(`SELECT id FROM shop_product_tag WHERE value = $1`, [normalized]);
    if (existing) return res.json({ tag: { id: existing.id, value: normalized } });
    const id = `tag_${uuid().replace(/-/g, "")}`;
    await execute(`INSERT INTO shop_product_tag (id, value) VALUES ($1, $2)`, [id, normalized]);
    res.status(201).json({ tag: { id, value: normalized } });
  } catch (err) {
    console.error("[admin tag create]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// Tags assigned to a product
adminTagsRouter.get("/products/:id/tags", async (req, res) => {
  try {
    const rows = await query(
      `SELECT t.id, t.value
       FROM shop_product_tag_map m
       JOIN shop_product_tag t ON t.id = m.tag_id
       WHERE m.product_id = $1
       ORDER BY t.value`,
      [req.params.id]
    );
    res.json({ tags: rows });
  } catch (err) {
    console.error("[admin product tags]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// Replace product's tag set with the given list of values (creating tags as needed)
adminTagsRouter.put("/products/:id/tags", async (req, res) => {
  try {
    const { values } = req.body as { values: string[] };
    if (!Array.isArray(values)) return res.status(400).json({ error: "values array required" });

    await execute(`DELETE FROM shop_product_tag_map WHERE product_id = $1`, [req.params.id]);
    for (const raw of values) {
      const v = String(raw || "").trim().toLowerCase();
      if (!v) continue;
      let existing = await queryOne(`SELECT id FROM shop_product_tag WHERE value = $1`, [v]);
      if (!existing) {
        const tagId = `tag_${uuid().replace(/-/g, "")}`;
        await execute(`INSERT INTO shop_product_tag (id, value) VALUES ($1, $2)`, [tagId, v]);
        existing = { id: tagId };
      }
      await execute(
        `INSERT INTO shop_product_tag_map (product_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.params.id, existing.id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin set product tags]", err);
    res.status(500).json({ error: "Failed" });
  }
});
