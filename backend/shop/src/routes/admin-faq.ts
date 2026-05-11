import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";

export const adminFaqRouter = Router();
const newId = () => `faq_${uuid().replace(/-/g, "")}`;

adminFaqRouter.get("/faqs", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT * FROM shop_faq ORDER BY sort_order ASC, created_at ASC`
    );
    res.json({ faqs: rows });
  } catch (err) {
    console.error("[admin faq list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminFaqRouter.post("/faqs", async (req, res) => {
  try {
    const b = req.body as {
      question: string;
      answer: string;
      category?: string;
      sort_order?: number;
      is_active?: boolean;
    };
    if (!b.question?.trim() || !b.answer?.trim()) {
      return res.status(400).json({ error: "question and answer required" });
    }
    const id = newId();
    await execute(
      `INSERT INTO shop_faq (id, question, answer, category, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        id,
        b.question.trim(),
        b.answer.trim(),
        b.category?.trim() || null,
        Number.isFinite(b.sort_order) ? b.sort_order : 0,
        b.is_active !== false,
      ]
    );
    const row = await queryOne(`SELECT * FROM shop_faq WHERE id = $1`, [id]);
    res.status(201).json({ faq: row });
  } catch (err) {
    console.error("[admin faq create]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminFaqRouter.patch("/faqs/:id", async (req, res) => {
  try {
    const b = req.body as Partial<{
      question: string;
      answer: string;
      category: string | null;
      sort_order: number;
      is_active: boolean;
    }>;
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    const set = (col: string, val: unknown) => {
      sets.push(`${col} = $${i++}`);
      params.push(val);
    };
    if (b.question !== undefined) set("question", String(b.question).trim());
    if (b.answer !== undefined) set("answer", String(b.answer).trim());
    if (b.category !== undefined) set("category", b.category ? String(b.category).trim() : null);
    if (b.sort_order !== undefined) set("sort_order", Number(b.sort_order));
    if (b.is_active !== undefined) set("is_active", Boolean(b.is_active));
    if (sets.length > 0) {
      sets.push("updated_at = NOW()");
      params.push(req.params.id);
      await execute(`UPDATE shop_faq SET ${sets.join(", ")} WHERE id = $${i}`, params);
    }
    const row = await queryOne(`SELECT * FROM shop_faq WHERE id = $1`, [req.params.id]);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ faq: row });
  } catch (err) {
    console.error("[admin faq update]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminFaqRouter.delete("/faqs/:id", async (req, res) => {
  try {
    await execute(`DELETE FROM shop_faq WHERE id = $1`, [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error("[admin faq delete]", err);
    res.status(500).json({ error: "Failed" });
  }
});
