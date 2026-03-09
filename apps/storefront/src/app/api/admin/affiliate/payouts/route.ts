import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ensureAffiliateSchema } from "@/lib/affiliate";
import { requireAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const denyResponse = await requireAdminRequest(req);
    if (denyResponse) return denyResponse;

    await ensureAffiliateSchema();
    const payouts = await query<Record<string, unknown>>(
      `SELECT p.id, p.affiliate_id, p.amount, p.currency_code, p.method, p.status, p.reference, p.created_at,
              a.code, a.email
       FROM affiliate_payout p
       INNER JOIN affiliate a ON a.id = p.affiliate_id
       ORDER BY p.created_at DESC
       LIMIT 200`
    );
    return NextResponse.json({ payouts });
  } catch (error) {
    console.error("[API /admin/affiliate/payouts] error:", error);
    return NextResponse.json({ error: "Failed to fetch payouts." }, { status: 500 });
  }
}
