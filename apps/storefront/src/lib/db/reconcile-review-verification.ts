import { pool } from "./index";

async function reconcileReviewVerification() {
  console.log("[reviews] Starting verification reconciliation...");

  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS customer_transaction_item (
        id text PRIMARY KEY,
        transaction_id text NOT NULL REFERENCES customer_transaction(id) ON DELETE CASCADE,
        customer_id text NOT NULL REFERENCES customer_account(id) ON DELETE CASCADE,
        product_id text NOT NULL,
        product_handle text NULL,
        product_title text NOT NULL,
        quantity integer NOT NULL DEFAULT 1,
        unit_price numeric NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT NOW()
      )`
    );

    const before = await pool.query<{ verified_true: number; total: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE verified = true)::int AS verified_true,
         COUNT(*)::int AS total
       FROM product_review`
    );

    const updateResult = await pool.query(
      `UPDATE product_review r
       SET verified = CASE
         WHEN r.customer_id IS NULL THEN false
         ELSE EXISTS (
           SELECT 1
           FROM customer_transaction_item i
           WHERE i.customer_id = r.customer_id
             AND (
               i.product_id = r.product_id
               OR (COALESCE(r.product_handle, '') <> '' AND i.product_handle = r.product_handle)
             )
         )
       END,
       updated_at = NOW()`
    );

    const after = await pool.query<{ verified_true: number; total: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE verified = true)::int AS verified_true,
         COUNT(*)::int AS total
       FROM product_review`
    );

    const beforeStats = before.rows[0] || { verified_true: 0, total: 0 };
    const afterStats = after.rows[0] || { verified_true: 0, total: 0 };

    console.log("[reviews] Reconciliation complete.");
    console.log(`[reviews] Rows checked: ${afterStats.total}`);
    console.log(`[reviews] Rows updated: ${updateResult.rowCount ?? 0}`);
    console.log(
      `[reviews] Verified true changed: ${beforeStats.verified_true} -> ${afterStats.verified_true}`
    );
  } catch (error) {
    console.error("[reviews] Reconciliation failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void reconcileReviewVerification();

