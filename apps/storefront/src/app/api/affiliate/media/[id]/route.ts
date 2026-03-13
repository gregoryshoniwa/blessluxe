import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import {
  deleteAffiliateMediaAsset,
  publishAffiliateMediaAsset,
  queryAffiliateByMediaId,
  unpublishAffiliateMediaAsset,
} from "@/lib/affiliate";

export const dynamic = "force-dynamic";

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
    const media = await queryAffiliateByMediaId(String(id || "").trim());
    if (!media) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }
    if (String(media.affiliate_email).toLowerCase() !== String(customer.email).toLowerCase()) {
      return NextResponse.json({ error: "Only owner can delete media." }, { status: 403 });
    }
    await deleteAffiliateMediaAsset(String(media.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /affiliate/media/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete media." }, { status: 500 });
  }
}

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
    const media = await queryAffiliateByMediaId(String(id || "").trim());
    if (!media) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }
    if (String(media.affiliate_email).toLowerCase() !== String(customer.email).toLowerCase()) {
      return NextResponse.json({ error: "Only owner can update media." }, { status: 403 });
    }
    const body = await req.json();
    const action = String(body.action || "").trim();
    if (action === "publish") {
      const postId = await publishAffiliateMediaAsset(String(media.id), String(media.affiliate_id));
      return NextResponse.json({ ok: true, published: true, postId });
    }
    if (action === "unpublish") {
      await unpublishAffiliateMediaAsset(String(media.id), String(media.affiliate_id));
      return NextResponse.json({ ok: true, published: false });
    }
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    console.error("[API /affiliate/media/[id]] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update media." }, { status: 500 });
  }
}

