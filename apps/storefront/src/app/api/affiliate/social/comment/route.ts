import { NextRequest, NextResponse } from "next/server";
import { addAffiliatePostComment } from "@/lib/affiliate";
import { getCurrentCustomer } from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.id) {
      return NextResponse.json({ error: "Login required to comment." }, { status: 401 });
    }

    const body = await req.json();
    const postId = String(body.postId || "").trim();
    const content = String(body.content || "").trim();
    if (!postId || !content) {
      return NextResponse.json({ error: "postId and content are required." }, { status: 400 });
    }
    if (content.length > 600) {
      return NextResponse.json({ error: "Comment is too long." }, { status: 400 });
    }

    await addAffiliatePostComment(postId, String(customer.id), content);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /affiliate/social/comment] error:", error);
    return NextResponse.json({ error: "Failed to post comment." }, { status: 500 });
  }
}

