import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";
import { ensureAffiliateSchema } from "@/lib/affiliate";
import { ensureBlitsSchema } from "@/lib/blits";
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
    await ensureBlitsSchema();

    const { id } = await params;
    const body = await req.json();
    const status = String(body.status || "").trim();
    const adminNotes = body.admin_notes != null ? String(body.admin_notes) : null;

    if (!["open", "resolved", "dismissed"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    await execute(
      `UPDATE affiliate_dispute SET status = $1, admin_notes = COALESCE($2, admin_notes), updated_at = NOW() WHERE id = $3`,
      [status, adminNotes, id]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /admin/affiliate/disputes/[id]] error:", error);
    return NextResponse.json({ error: "Failed to update dispute." }, { status: 500 });
  }
}
