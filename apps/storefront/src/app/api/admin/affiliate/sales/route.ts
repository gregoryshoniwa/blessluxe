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
    const affiliateId = req.nextUrl.searchParams.get("affiliate_id");
    const where = affiliateId ? "WHERE s.affiliate_id = $1" : "";
    const params = affiliateId ? [affiliateId] : [];

    const sales = await query<Record<string, unknown>>(
      `SELECT s.id, s.affiliate_id, a.code, a.email, s.order_id, s.order_total, s.commission_amount, s.currency_code, s.status, s.metadata, s.created_at
       FROM affiliate_sale s
       INNER JOIN affiliate a ON a.id = s.affiliate_id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT 200`,
      params
    );

    return NextResponse.json({ sales });
  } catch (error) {
    console.error("[API /admin/affiliate/sales] error:", error);
    return NextResponse.json({ error: "Failed to fetch affiliate sales." }, { status: 500 });
  }
}
