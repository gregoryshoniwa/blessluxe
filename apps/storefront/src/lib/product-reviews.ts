import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db";

interface ProductReviewRow {
  id: string;
  product_id: string;
  product_handle: string;
  customer_id: string | null;
  author_name: string | null;
  rating: number;
  title: string;
  content: string;
  verified: boolean;
  verified_purchase: boolean;
  created_at: string;
}
interface ProductReviewSummaryRow {
  total_reviews: number;
  average_rating: string | number | null;
}

type PublicReview = {
  id: string;
  author: string;
  rating: number;
  date: string;
  title: string;
  content: string;
  verified: boolean;
  canEdit?: boolean;
};

let ensurePromise: Promise<void> | null = null;

async function ensureSchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await execute(
        `CREATE TABLE IF NOT EXISTS product_review (
          id text PRIMARY KEY,
          product_id text NOT NULL,
          product_handle text NOT NULL,
          customer_id text NULL REFERENCES customer_account(id) ON DELETE SET NULL,
          author_name text NULL,
          rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
          title text NOT NULL,
          content text NOT NULL,
          verified boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          updated_at timestamptz NOT NULL DEFAULT NOW()
        )`
      );
      await execute(
        `CREATE INDEX IF NOT EXISTS idx_product_review_product_id
         ON product_review(product_id, created_at DESC)`
      );
      await execute(
        `CREATE INDEX IF NOT EXISTS idx_product_review_product_handle
         ON product_review(product_handle, created_at DESC)`
      );
      await execute(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_product_review_customer_product
         ON product_review(product_id, customer_id)
         WHERE customer_id IS NOT NULL`
      );
    })();
  }
  await ensurePromise;
}

function normalizeRatingBreakdown(rows: Array<{ rating: number; count: number }>) {
  const result: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of rows) {
    const key = Number(row.rating) as 1 | 2 | 3 | 4 | 5;
    if ([1, 2, 3, 4, 5].includes(key)) {
      result[key] = Number(row.count || 0);
    }
  }
  return result;
}

function formatReviewDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export async function listProductReviews(productId: string): Promise<PublicReview[]> {
  await ensureSchema();
  const rows = await query<ProductReviewRow>(
    `SELECT r.id,
            r.product_id,
            r.product_handle,
            r.customer_id,
            COALESCE(NULLIF(c.full_name, ''), r.author_name, 'Anonymous') AS author_name,
            r.rating,
            r.title,
            r.content,
            EXISTS (
              SELECT 1
              FROM customer_transaction_item i
              WHERE i.customer_id = r.customer_id
                AND (
                  i.product_id = r.product_id
                  OR (r.product_handle <> '' AND i.product_handle = r.product_handle)
                )
            ) AS verified_purchase,
            r.verified,
            r.created_at
     FROM product_review r
     LEFT JOIN customer_account c ON c.id = r.customer_id
     WHERE r.product_id = $1
     ORDER BY r.created_at DESC
     LIMIT 200`,
    [productId]
  );
  return rows.map((row) => ({
    id: String(row.id),
    author: String(row.author_name || "Anonymous"),
    rating: Number(row.rating || 0),
    date: formatReviewDate(row.created_at),
    title: String(row.title || ""),
    content: String(row.content || ""),
    verified: Boolean(row.verified_purchase),
  }));
}

export async function listProductReviewsForViewer(productId: string, customerId: string | null): Promise<PublicReview[]> {
  await ensureSchema();
  const rows = await query<ProductReviewRow>(
    `SELECT r.id,
            r.product_id,
            r.product_handle,
            r.customer_id,
            COALESCE(NULLIF(c.full_name, ''), r.author_name, 'Anonymous') AS author_name,
            r.rating,
            r.title,
            r.content,
            EXISTS (
              SELECT 1
              FROM customer_transaction_item i
              WHERE i.customer_id = r.customer_id
                AND (
                  i.product_id = r.product_id
                  OR (r.product_handle <> '' AND i.product_handle = r.product_handle)
                )
            ) AS verified_purchase,
            r.verified,
            r.created_at
     FROM product_review r
     LEFT JOIN customer_account c ON c.id = r.customer_id
     WHERE r.product_id = $1
     ORDER BY r.created_at DESC
     LIMIT 200`,
    [productId]
  );
  const viewerId = customerId ? String(customerId) : "";
  return rows.map((row) => ({
    id: String(row.id),
    author: String(row.author_name || "Anonymous"),
    rating: Number(row.rating || 0),
    date: formatReviewDate(row.created_at),
    title: String(row.title || ""),
    content: String(row.content || ""),
    verified: Boolean(row.verified_purchase),
    canEdit: Boolean(viewerId && String(row.customer_id || "") === viewerId),
  }));
}

export async function getProductReviewSummary(input: { productId?: string; productHandle?: string }) {
  await ensureSchema();
  const productId = String(input.productId || "").trim();
  const productHandle = String(input.productHandle || "").trim();
  if (!productId && !productHandle) {
    return {
      averageRating: 0,
      totalReviews: 0,
      ratingBreakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    };
  }

  const aggregate = await queryOne<ProductReviewSummaryRow>(
    `SELECT COUNT(*)::int AS total_reviews,
            ROUND(COALESCE(AVG(rating), 0)::numeric, 1) AS average_rating
     FROM product_review
     WHERE ($1 <> '' AND product_id = $1)
        OR ($2 <> '' AND product_handle = $2)`,
    [productId, productHandle]
  );
  const breakdownRows = await query<{ rating: number; count: number }>(
    `SELECT rating, COUNT(*)::int AS count
     FROM product_review
     WHERE ($1 <> '' AND product_id = $1)
        OR ($2 <> '' AND product_handle = $2)
     GROUP BY rating`,
    [productId, productHandle]
  );

  return {
    averageRating: Number(aggregate?.average_rating || 0),
    totalReviews: Number(aggregate?.total_reviews || 0),
    ratingBreakdown: normalizeRatingBreakdown(breakdownRows),
  };
}

export async function upsertProductReviewByCustomer(input: {
  productId: string;
  productHandle: string;
  customerId: string;
  authorName?: string;
  rating: number;
  title: string;
  content: string;
  verified?: boolean;
}) {
  await ensureSchema();
  const normalizedRating = Math.min(5, Math.max(1, Math.round(input.rating)));
  const normalizedTitle = input.title.trim();
  const normalizedContent = input.content.trim();
  const normalizedVerified = Boolean(input.verified);

  const updatedRows = await execute(
    `UPDATE product_review
     SET product_handle = $1,
         author_name = $2,
         rating = $3,
         title = $4,
         content = $5,
         verified = $6,
         updated_at = NOW()
     WHERE product_id = $7
       AND customer_id = $8`,
    [
      input.productHandle,
      input.authorName || null,
      normalizedRating,
      normalizedTitle,
      normalizedContent,
      normalizedVerified,
      input.productId,
      input.customerId,
    ]
  );

  if (updatedRows > 0) return;

  await execute(
    `INSERT INTO product_review
      (id, product_id, product_handle, customer_id, author_name, rating, title, content, verified, created_at, updated_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
    [
      randomUUID(),
      input.productId,
      input.productHandle,
      input.customerId,
      input.authorName || null,
      normalizedRating,
      normalizedTitle,
      normalizedContent,
      normalizedVerified,
    ]
  );
}

export async function deleteProductReviewByCustomer(reviewId: string, customerId: string) {
  await ensureSchema();
  await execute(
    `DELETE FROM product_review
     WHERE id = $1
       AND customer_id = $2`,
    [reviewId, customerId]
  );
}

export async function hasCustomerPurchasedProduct(input: {
  customerId: string;
  productId: string;
  productHandle?: string;
}) {
  await ensureSchema();
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM customer_transaction_item
     WHERE customer_id = $1
       AND (
         product_id = $2
         OR ($3 <> '' AND product_handle = $3)
       )`,
    [input.customerId, input.productId, String(input.productHandle || "")]
  );
  return Number(row?.count || 0) > 0;
}

