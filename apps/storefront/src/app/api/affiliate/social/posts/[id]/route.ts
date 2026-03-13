import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import {
  deleteAffiliateSocialPost,
  getAffiliateSocialPostById,
  updateAffiliateSocialPost,
} from "@/lib/affiliate";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.email) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }

    const { id } = await params;
    const post = await getAffiliateSocialPostById(String(id || "").trim());
    if (!post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }
    if (String(post.affiliate_email).toLowerCase() !== String(customer.email).toLowerCase()) {
      return NextResponse.json({ error: "Only owner can update this post." }, { status: 403 });
    }

    const body = await req.json();
    const caption = String(body.caption || "").trim();
    const imageUrl = String(body.imageUrl || "").trim();
    const tagsInput = Array.isArray(body.tags) ? body.tags : [];
    if (!caption || !imageUrl) {
      return NextResponse.json({ error: "caption and imageUrl are required." }, { status: 400 });
    }
    const tags = tagsInput
      .map((tag: Record<string, unknown>) => ({
        productTitle: String(tag?.productTitle || "").trim(),
        productUrl: String(tag?.productUrl || "").trim(),
        productHandle: String(tag?.productHandle || "").trim() || undefined,
      }))
      .filter((tag: { productTitle: string; productUrl: string }) => tag.productTitle && tag.productUrl)
      .slice(0, 8);

    await updateAffiliateSocialPost({
      postId: String(post.id),
      caption,
      imageUrl,
      tags,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /affiliate/social/posts/[id]] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update post." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.email) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }
    const { id } = await params;
    const post = await getAffiliateSocialPostById(String(id || "").trim());
    if (!post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }
    if (String(post.affiliate_email).toLowerCase() !== String(customer.email).toLowerCase()) {
      return NextResponse.json({ error: "Only owner can delete this post." }, { status: 403 });
    }
    await deleteAffiliateSocialPost(String(post.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /affiliate/social/posts/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete post." }, { status: 500 });
  }
}

