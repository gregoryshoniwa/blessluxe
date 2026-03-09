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
      `SELECT id, code, first_name, last_name, email, commission_rate, status, total_earnings, paid_out, created_at
       FROM affiliate
       ORDER BY created_at DESC`
    );

    return NextResponse.json({ affiliates });
  } catch (error) {
    console.error("[API /admin/affiliate/affiliates] error:", error);
    return NextResponse.json({ error: "Failed to fetch affiliates." }, { status: 500 });
  }
}
