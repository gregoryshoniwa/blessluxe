import { Router } from "express";
import { query, queryOne, execute } from "../db/pool.ts";

export const adminReviewsRouter = Router();

adminReviewsRouter.get("/reviews", async (req, res) => {
  try {
    const status = (req.query.status as string) || undefined;
    const productId = (req.query.product_id as string) || undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (status) { conditions.push(`r.status = $${idx++}`); params.push(status); }
    if (productId) { conditions.push(`r.product_id = $${idx++}`); params.push(productId); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit, offset);

    const rows = await query(
      `SELECT r.*, p.title AS product_title, p.handle AS product_handle, p.thumbnail AS product_thumbnail
       FROM shop_product_review r
       JOIN shop_product p ON p.id = r.product_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    const totalRow = await queryOne(
      `SELECT count(*)::int AS total FROM shop_product_review r ${where}`,
      params.slice(0, params.length - 2)
    );

    res.json({
      reviews: rows,
      count: Number(totalRow?.total || rows.length),
      offset,
      limit,
    });
  } catch (err) {
    console.error("[admin reviews list]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminReviewsRouter.patch("/reviews/:id", async (req, res) => {
  try {
    const body = req.body as Partial<{
      status: "pending" | "approved" | "rejected";
      admin_response: string;
      title: string;
      content: string;
      rating: number;
    }>;

    const previous = await queryOne(
      `SELECT id, status, customer_id, reward_credited
       FROM shop_product_review WHERE id = $1`,
      [req.params.id]
    );

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (body.status !== undefined) { sets.push(`status = $${idx++}`); params.push(body.status); }
    if (body.admin_response !== undefined) { sets.push(`admin_response = $${idx++}`); params.push(body.admin_response); }
    if (body.title !== undefined) { sets.push(`title = $${idx++}`); params.push(body.title); }
    if (body.content !== undefined) { sets.push(`content = $${idx++}`); params.push(body.content); }
    if (body.rating !== undefined) { sets.push(`rating = $${idx++}`); params.push(body.rating); }
    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`);
      params.push(req.params.id);
      await execute(`UPDATE shop_product_review SET ${sets.join(", ")} WHERE id = $${idx}`, params);
    }

    // When a review transitions to "approved" for the first time, credit the
    // customer's loyalty points (Bits) by the configured review reward.
    const becameApproved =
      body.status === "approved" &&
      previous &&
      previous.status !== "approved" &&
      !previous.reward_credited &&
      previous.customer_id;
    if (becameApproved) {
      const setting = await queryOne(
        `SELECT value FROM shop_setting WHERE key = 'review_reward_bits'`
      );
      const reward = Math.max(0, Math.floor(Number(setting?.value || 0)));
      if (reward > 0) {
        await execute(
          `UPDATE shop_customer
              SET loyalty_points = COALESCE(loyalty_points, 0) + $1,
                  updated_at = NOW()
            WHERE id = $2`,
          [reward, previous.customer_id]
        );
        await execute(
          `UPDATE shop_product_review
              SET reward_credited = true, reward_credited_at = NOW()
            WHERE id = $1`,
          [req.params.id]
        );
      }
    }

    const review = await queryOne(`SELECT * FROM shop_product_review WHERE id = $1`, [req.params.id]);
    res.json({ review });
  } catch (err) {
    console.error("[admin review update]", err);
    res.status(500).json({ error: "Failed" });
  }
});

adminReviewsRouter.delete("/reviews/:id", async (req, res) => {
  try {
    await execute(`DELETE FROM shop_product_review WHERE id = $1`, [req.params.id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error("[admin review delete]", err);
    res.status(500).json({ error: "Failed" });
  }
});
