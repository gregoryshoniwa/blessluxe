import { NextRequest, NextResponse } from "next/server";
import { toggleAffiliatePostLike } from "@/lib/affiliate";
import { getCurrentCustomer } from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.id) {
      return NextResponse.json({ error: "Login required to like posts." }, { status: 401 });
    }

    const body = await req.json();
    const postId = String(body.postId || "").trim();
    if (!postId) {
      return NextResponse.json({ error: "postId is required." }, { status: 400 });
    }

    const result = await toggleAffiliatePostLike(postId, String(customer.id));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[API /affiliate/social/like] error:", error);
    return NextResponse.json({ error: "Failed to toggle like." }, { status: 500 });
  }
}

