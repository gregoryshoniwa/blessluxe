import { NextRequest, NextResponse } from "next/server";
import { moderateAffiliateSocialPost } from "@/lib/affiliate";
import { requireAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const deny = await requireAdminRequest(req);
    if (deny) return deny;

    const { id } = await params;
    const body = await req.json();
    const status = String(body.status || "").trim() as "approved" | "rejected";
    const notes = String(body.notes || "").trim();

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid moderation status." }, { status: 400 });
    }

    await moderateAffiliateSocialPost({
      postId: id,
      status,
      notes,
      moderatedBy: "admin",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /admin/affiliate/social/posts/[id]/moderate] error:", error);
    return NextResponse.json({ error: "Failed to moderate social post." }, { status: 500 });
  }
}

