import { NextRequest, NextResponse } from "next/server";
import { listAffiliateSocialModerationQueue } from "@/lib/affiliate";
import { requireAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const deny = await requireAdminRequest(req);
    if (deny) return deny;
    const posts = await listAffiliateSocialModerationQueue(200);
    return NextResponse.json({ posts });
  } catch (error) {
    console.error("[API /admin/affiliate/social/posts] error:", error);
    return NextResponse.json({ error: "Failed to fetch social moderation queue." }, { status: 500 });
  }
}

