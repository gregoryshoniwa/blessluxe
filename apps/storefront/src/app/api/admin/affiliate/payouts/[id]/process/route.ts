import { NextRequest, NextResponse } from "next/server";
import { execute, queryOne } from "@/lib/db";
import { ensureAffiliateSchema } from "@/lib/affiliate";
import { requireAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const denyResponse = await requireAdminRequest(req);
    if (denyResponse) return denyResponse;

    await ensureAffiliateSchema();
    const { id } = await params;
    const body = await req.json();
    const status = String(body.status || "").trim();
    const reference = String(body.reference || "").trim() || null;

    if (!["processing", "completed", "failed"].includes(status)) {
      return NextResponse.json({ error: "Invalid payout status." }, { status: 400 });
    }

    const payout = await queryOne<{ affiliate_id: string; amount: string }>(
      `SELECT affiliate_id, amount FROM affiliate_payout WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!payout) {
      return NextResponse.json({ error: "Payout not found." }, { status: 404 });
    }

    await execute(
      `UPDATE affiliate_payout
       SET status = $1, reference = $2, updated_at = NOW()
       WHERE id = $3`,
      [status, reference, id]
    );

    if (status === "completed") {
      await execute(
        `UPDATE affiliate
         SET paid_out = COALESCE(paid_out, 0) + $1, updated_at = NOW()
         WHERE id = $2`,
        [Number(payout.amount || 0), payout.affiliate_id]
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /admin/affiliate/payouts/[id]/process] error:", error);
    return NextResponse.json({ error: "Failed to process payout." }, { status: 500 });
  }
}
