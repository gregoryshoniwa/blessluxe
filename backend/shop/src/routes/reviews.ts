import { Router } from "express";
import { v4 as uuid } from "uuid";
import { query, queryOne, execute } from "../db/pool.ts";

export const reviewsRouter = Router();

// GET /store/reviews?product_id=...
reviewsRouter.get("/", async (req, res) => {
  try {
    const productId = (req.query.product_id as string) || undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const conditions: string[] = ["status = 'approved'"];
    const params: unknown[] = [];
    let idx = 1;
    if (productId) {
      conditions.push(`product_id = $${idx++}`);
      params.push(productId);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    params.push(limit, offset);
    const rows = await query(
      `SELECT id, product_id, customer_id, customer_name, title, content, rating,
              is_verified_purchase, admin_response, helpful_count, images, created_at
       FROM shop_product_review ${where}
       ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    const countRow = await queryOne(
      `SELECT count(*)::int AS total FROM shop_product_review ${where}`,
      params.slice(0, params.length - 2)
    );

    const ratingAggRow = productId
      ? await queryOne(
          `SELECT avg(rating)::numeric(3,2) AS avg_rating, count(*)::int AS total
           FROM shop_product_review WHERE product_id = $1 AND status = 'approved'`,
          [productId]
        )
      : null;

    res.json({
      reviews: rows,
      count: Number(countRow?.total || rows.length),
      offset,
      limit,
      summary: ratingAggRow
        ? {
            average_rating: Number(ratingAggRow.avg_rating || 0),
            total_reviews: Number(ratingAggRow.total || 0),
          }
        : undefined,
    });
  } catch (err) {
    console.error("[reviews list]", err);
    res.status(500).json({ type: "server_error", message: "Failed to list reviews" });
  }
});

// POST /store/reviews — customer submits a review (defaults to pending moderation)
reviewsRouter.post("/", async (req, res) => {
  try {
    const body = req.body as {
      product_id: string;
      customer_id?: string;
      customer_email?: string;
      customer_name?: string;
      order_id?: string;
      title: string;
      content: string;
      rating: number;
      images?: string[];
    };
    if (!body.product_id || !body.title || !body.content || !body.rating) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    const rating = Math.max(1, Math.min(5, Math.round(Number(body.rating))));
    const id = `rev_${uuid().replace(/-/g, "")}`;
    await execute(
      `INSERT INTO shop_product_review
        (id, product_id, customer_id, customer_email, customer_name, order_id, title, content, rating, images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        body.product_id,
        body.customer_id || null,
        body.customer_email || null,
        body.customer_name || null,
        body.order_id || null,
        body.title,
        body.content,
        rating,
        body.images ? JSON.stringify(body.images) : null,
      ]
    );
    const review = await queryOne(`SELECT * FROM shop_product_review WHERE id = $1`, [id]);
    res.status(201).json({ review });
  } catch (err) {
    console.error("[review create]", err);
    res.status(500).json({ error: "Failed to create review" });
  }
});

// POST /store/reviews/:id/helpful — customer marks a review as helpful
reviewsRouter.post("/:id/helpful", async (req, res) => {
  try {
    await execute(
      `UPDATE shop_product_review SET helpful_count = helpful_count + 1 WHERE id = $1`,
      [req.params.id]
    );
    const row = await queryOne(`SELECT helpful_count FROM shop_product_review WHERE id = $1`, [
      req.params.id,
    ]);
    res.json({ helpful_count: row?.helpful_count ?? 0 });
  } catch (err) {
    console.error("[review helpful]", err);
    res.status(500).json({ error: "Failed" });
  }
});
