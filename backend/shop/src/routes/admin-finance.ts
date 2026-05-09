import { Router } from "express";
import { query, queryOne } from "../db/pool.ts";

export const adminFinanceRouter = Router();

const FINANCE_DEFAULTS = { rangeDays: 30 };

// GET /admin/finance/summary — top-line totals + period-over-period
adminFinanceRouter.get("/finance/summary", async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days || FINANCE_DEFAULTS.rangeDays), 1), 365);
    const currency = (req.query.currency as string) || undefined;

    const since = new Date();
    since.setDate(since.getDate() - days);
    const previousSince = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);

    const where = (start: Date, end?: Date) => {
      const conditions: string[] = ["status NOT IN ('cancelled', 'refunded')"];
      const params: unknown[] = [start];
      conditions.push(`created_at >= $1`);
      if (end) {
        conditions.push(`created_at < $2`);
        params.push(end);
      }
      if (currency) {
        conditions.push(`currency_code = $${params.length + 1}`);
        params.push(currency);
      }
      return { sql: conditions.join(" AND "), params };
    };

    const current = where(since);
    const previous = where(previousSince, since);

    const [now, prev, byCurrency, lifetime] = await Promise.all([
      queryOne(
        `SELECT count(*)::int AS orders,
                COALESCE(SUM(total), 0)::bigint AS revenue,
                COALESCE(SUM(subtotal), 0)::bigint AS subtotal,
                COALESCE(SUM(discount_total), 0)::bigint AS discounts,
                COALESCE(SUM(shipping_total), 0)::bigint AS shipping,
                COALESCE(SUM(tax_total), 0)::bigint AS tax
         FROM shop_order WHERE ${current.sql}`,
        current.params
      ),
      queryOne(
        `SELECT count(*)::int AS orders, COALESCE(SUM(total),0)::bigint AS revenue
         FROM shop_order WHERE ${previous.sql}`,
        previous.params
      ),
      query(
        `SELECT currency_code, count(*)::int AS orders, COALESCE(SUM(total),0)::bigint AS revenue
         FROM shop_order WHERE ${current.sql}
         GROUP BY currency_code ORDER BY revenue DESC`,
        current.params
      ),
      queryOne(
        `SELECT count(*)::int AS orders, COALESCE(SUM(total),0)::bigint AS revenue
         FROM shop_order WHERE status NOT IN ('cancelled','refunded')`
      ),
    ]);

    // Calculate cost basis (estimated profit = revenue - cost)
    const costRow = await queryOne(
      `SELECT COALESCE(SUM(li.quantity * COALESCE(li.unit_cost, 0)), 0)::bigint AS cost
       FROM shop_order_line_item li
       JOIN shop_order o ON o.id = li.order_id
       WHERE ${current.sql.replace(/created_at/g, "o.created_at").replace(/status/g, "o.status").replace(/currency_code/g, "o.currency_code")}`,
      current.params
    );

    res.json({
      window: { days, since, until: new Date() },
      current: {
        orders: Number(now?.orders ?? 0),
        revenue: Number(now?.revenue ?? 0),
        subtotal: Number(now?.subtotal ?? 0),
        discounts: Number(now?.discounts ?? 0),
        shipping: Number(now?.shipping ?? 0),
        tax: Number(now?.tax ?? 0),
        cost: Number(costRow?.cost ?? 0),
        gross_profit: Number(now?.revenue ?? 0) - Number(costRow?.cost ?? 0),
      },
      previous: {
        orders: Number(prev?.orders ?? 0),
        revenue: Number(prev?.revenue ?? 0),
      },
      lifetime: {
        orders: Number(lifetime?.orders ?? 0),
        revenue: Number(lifetime?.revenue ?? 0),
      },
      currency_breakdown: byCurrency.map((r) => ({
        currency_code: r.currency_code,
        orders: Number(r.orders),
        revenue: Number(r.revenue),
      })),
    });
  } catch (err) {
    console.error("[finance summary]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /admin/finance/timeseries?days=30&interval=day — orders + revenue over time
adminFinanceRouter.get("/finance/timeseries", async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days || 30), 1), 365);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await query(
      `SELECT date_trunc('day', created_at)::date AS bucket,
              count(*)::int AS orders,
              COALESCE(SUM(total),0)::bigint AS revenue
       FROM shop_order
       WHERE status NOT IN ('cancelled','refunded') AND created_at >= $1
       GROUP BY bucket ORDER BY bucket`,
      [since]
    );
    res.json({
      points: rows.map((r) => ({
        date: String(r.bucket).slice(0, 10),
        orders: Number(r.orders),
        revenue: Number(r.revenue),
      })),
    });
  } catch (err) {
    console.error("[finance timeseries]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /admin/finance/top-products?days=30&limit=10
adminFinanceRouter.get("/finance/top-products", async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days || 30), 1), 365);
    const limit = Math.min(Math.max(Number(req.query.limit || 10), 1), 50);
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await query(
      `SELECT li.product_id,
              li.title,
              li.thumbnail,
              SUM(li.quantity)::int AS units,
              COALESCE(SUM(li.quantity * li.unit_price), 0)::bigint AS revenue
       FROM shop_order_line_item li
       JOIN shop_order o ON o.id = li.order_id
       WHERE o.created_at >= $1 AND o.status NOT IN ('cancelled','refunded')
       GROUP BY li.product_id, li.title, li.thumbnail
       ORDER BY revenue DESC
       LIMIT $2`,
      [since, limit]
    );
    res.json({
      products: rows.map((r) => ({
        product_id: r.product_id,
        title: r.title,
        thumbnail: r.thumbnail,
        units: Number(r.units),
        revenue: Number(r.revenue),
      })),
    });
  } catch (err) {
    console.error("[finance top-products]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /admin/finance/recent-orders
adminFinanceRouter.get("/finance/recent-orders", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
    const rows = await query(
      `SELECT o.id, o.order_number, o.email, o.total, o.subtotal, o.shipping_total,
              o.currency_code, o.status, o.payment_status, o.created_at,
              c.first_name AS customer_first_name, c.last_name AS customer_last_name
       FROM shop_order o
       LEFT JOIN shop_customer c ON c.id = o.customer_id
       ORDER BY o.created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ orders: rows });
  } catch (err) {
    console.error("[finance recent-orders]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /admin/inventory/aging — variants grouped by stock age
adminFinanceRouter.get("/inventory/aging", async (_req, res) => {
  try {
    const rows = await query(
      `SELECT v.id, v.title, v.sku, v.inventory_quantity, v.received_at,
              p.id AS product_id, p.title AS product_title, p.thumbnail,
              CASE
                WHEN v.received_at IS NULL THEN 'unknown'
                WHEN v.received_at >= NOW() - INTERVAL '7 days' THEN 'fresh'
                WHEN v.received_at >= NOW() - INTERVAL '30 days' THEN 'recent'
                WHEN v.received_at >= NOW() - INTERVAL '90 days' THEN 'aging'
                ELSE 'stale'
              END AS bucket,
              EXTRACT(DAY FROM (NOW() - v.received_at))::int AS age_days
       FROM shop_product_variant v
       JOIN shop_product p ON p.id = v.product_id
       WHERE v.manage_inventory = true
       ORDER BY v.received_at DESC NULLS LAST`
    );
    res.json({ variants: rows });
  } catch (err) {
    console.error("[inventory aging]", err);
    res.status(500).json({ error: "Failed" });
  }
});

// GET /admin/inventory/velocity?days=30 — units sold per variant
adminFinanceRouter.get("/inventory/velocity", async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days || 30), 1), 365);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const rows = await query(
      `SELECT li.variant_id, li.product_id, li.title, li.sku,
              SUM(li.quantity)::int AS units_sold
       FROM shop_order_line_item li
       JOIN shop_order o ON o.id = li.order_id
       WHERE o.created_at >= $1 AND o.status NOT IN ('cancelled','refunded')
       GROUP BY li.variant_id, li.product_id, li.title, li.sku
       ORDER BY units_sold DESC`,
      [since]
    );
    res.json({ window_days: days, variants: rows });
  } catch (err) {
    console.error("[inventory velocity]", err);
    res.status(500).json({ error: "Failed" });
  }
});
