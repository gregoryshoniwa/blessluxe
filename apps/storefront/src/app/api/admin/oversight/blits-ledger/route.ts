import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const deny = await requireAdminRequest(req);
    if (deny) return deny;

    const q = (req.nextUrl.searchParams.get("q") || "").trim();
    const limit = Math.min(500, Math.max(20, Number(req.nextUrl.searchParams.get("limit") || 200)));

    const where = q
      ? `WHERE (
          l.kind ILIKE $1 OR ca.email ILIKE $1 OR l.customer_id ILIKE $1
          OR l.metadata::text ILIKE $1
        )`
      : "";
    const params = q ? [`%${q}%`] : [];

    const rows = await query<{
      id: string;
      customer_id: string;
      delta_blits: string;
      balance_after: string;
      kind: string;
      metadata: unknown;
      created_at: string;
      customer_email: string | null;
    }>(
      `SELECT l.id, l.customer_id, l.delta_blits::text, l.balance_after::text, l.kind, l.metadata, l.created_at,
              ca.email AS customer_email
       FROM blits_ledger l
       LEFT JOIN customer_account ca ON ca.id = l.customer_id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT ${limit}`,
      params
    );

    return NextResponse.json({ entries: rows });
  } catch (e) {
    console.error("[admin/oversight/blits-ledger]", e);
    return NextResponse.json({ error: "Failed to load Blits ledger." }, { status: 500 });
  }
}
