import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * Storefront-recorded orders (customer_transaction) with customer email and line items.
 */
export async function GET(req: NextRequest) {
  try {
    const deny = await requireAdminRequest(req);
    if (deny) return deny;

    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const limit = Math.min(500, Math.max(20, Number(req.nextUrl.searchParams.get("limit") || 150)));

    const where = q
      ? `WHERE (
          t.order_number ILIKE $1 OR ca.email ILIKE $1 OR ca.id ILIKE $1
        )`
      : "";
    const params = q ? [`%${q}%`] : [];

    const transactions = await query<{
      id: string;
      customer_id: string;
      order_number: string;
      amount: string;
      currency_code: string;
      status: string;
      invoice_url: string | null;
      created_at: string;
      customer_email: string;
    }>(
      `SELECT t.id, t.customer_id, t.order_number, t.amount, t.currency_code, t.status, t.invoice_url, t.created_at,
              ca.email AS customer_email
       FROM customer_transaction t
       INNER JOIN customer_account ca ON ca.id = t.customer_id
       ${where}
       ORDER BY t.created_at DESC
       LIMIT ${limit}`,
      params
    );

    const ids = transactions.map((t) => t.id);
    let items: Array<{
      id: string;
      transaction_id: string;
      product_id: string;
      product_handle: string | null;
      product_title: string;
      quantity: number;
      unit_price: string;
      created_at: string;
    }> = [];
    if (ids.length > 0) {
      items = await query(
        `SELECT id, transaction_id, product_id, product_handle, product_title, quantity, unit_price, created_at
         FROM customer_transaction_item
         WHERE transaction_id = ANY($1::text[])`,
        [ids]
      );
    }

    const itemsByTx = new Map<string, typeof items>();
    for (const i of items) {
      const list = itemsByTx.get(i.transaction_id) || [];
      list.push(i);
      itemsByTx.set(i.transaction_id, list);
    }

    return NextResponse.json({
      transactions: transactions.map((t) => ({
        ...t,
        line_items: itemsByTx.get(t.id) || [],
      })),
    });
  } catch (e) {
    console.error("[admin/oversight/storefront-transactions]", e);
    return NextResponse.json({ error: "Failed to load storefront transactions." }, { status: 500 });
  }
}
