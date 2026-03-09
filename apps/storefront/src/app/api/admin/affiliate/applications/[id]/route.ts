import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";
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

    if (!["active", "inactive", "pending"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    await execute(`UPDATE affiliate SET status = $1, updated_at = NOW() WHERE id = $2`, [
      status,
      id,
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /admin/affiliate/applications/[id]] error:", error);
    return NextResponse.json({ error: "Failed to update affiliate status." }, { status: 500 });
  }
}
