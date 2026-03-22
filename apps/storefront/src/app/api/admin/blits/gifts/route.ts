import { NextRequest, NextResponse } from "next/server";
import { ensureAffiliateSchema } from "@/lib/affiliate";
import { listBlitsGiftEventsAdmin } from "@/lib/blits";
import { requireAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const deny = await requireAdminRequest(req);
    if (deny) return deny;

    await ensureAffiliateSchema();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") || "200")));
    const gifts = await listBlitsGiftEventsAdmin(limit);
    return NextResponse.json({ gifts });
  } catch (error) {
    console.error("[API /admin/blits/gifts] GET error:", error);
    return NextResponse.json({ error: "Failed to load gift activity." }, { status: 500 });
  }
}
