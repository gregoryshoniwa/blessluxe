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
    const affiliates = await query<Record<string, unknown>>(
      `SELECT a.id, a.code, a.first_name, a.last_name, a.email, a.commission_rate, a.status,
              a.total_earnings, a.paid_out,
              COALESCE(a.page_enabled, true) AS page_enabled,
              a.created_at,
              COALESCE(a.total_earnings, 0) - COALESCE(a.paid_out, 0) - COALESCE((
                SELECT SUM(p.amount) FROM affiliate_payout p
                WHERE p.affiliate_id = a.id AND p.status IN ('pending', 'processing')
              ), 0) AS available_commission
       FROM affiliate a
       ORDER BY a.created_at DESC`
    );

    return NextResponse.json({ affiliates });
  } catch (error) {
    console.error("[API /admin/affiliate/affiliates] error:", error);
    return NextResponse.json({ error: "Failed to fetch affiliates." }, { status: 500 });
  }
}
