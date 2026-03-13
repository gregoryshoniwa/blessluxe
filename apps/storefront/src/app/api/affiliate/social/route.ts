import { NextRequest, NextResponse } from "next/server";
import {
  createAffiliateSocialPost,
  getAffiliateByCode,
  getAffiliateSocialFeed,
} from "@/lib/affiliate";
import { getCurrentCustomer } from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const code = String(req.nextUrl.searchParams.get("code") || "").trim();
    if (!code) {
      return NextResponse.json({ error: "Affiliate code is required." }, { status: 400 });
    }
    const customer = await getCurrentCustomer();
    const feed = await getAffiliateSocialFeed(code, customer?.id ? String(customer.id) : undefined);
    if (!feed) {
      return NextResponse.json({ error: "Affiliate profile not found." }, { status: 404 });
    }
    const canManage =
      !!customer?.email &&
      String(customer.email).toLowerCase() === String(feed.affiliate.email).toLowerCase();
    return NextResponse.json({ ...feed, canManage });
  } catch (error) {
    console.error("[API /affiliate/social] GET error:", error);
    return NextResponse.json({ error: "Failed to load affiliate feed." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.email) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }

    const body = await req.json();
    const code = String(body.code || "").trim();
    const caption = String(body.caption || "").trim();
    const imageUrl = String(body.imageUrl || "").trim();
    const tagsInput = Array.isArray(body.tags) ? body.tags : [];

    if (!code || !caption || !imageUrl) {
      return NextResponse.json(
        { error: "code, caption, and imageUrl are required." },
        { status: 400 }
      );
    }

    const affiliate = await getAffiliateByCode(code);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }

    if (String(customer.email).toLowerCase() !== String(affiliate.email).toLowerCase()) {
      return NextResponse.json({ error: "Only the affiliate owner can post." }, { status: 403 });
    }

    const tags = tagsInput
      .map((tag: Record<string, unknown>) => ({
        productTitle: String(tag?.productTitle || "").trim(),
        productUrl: String(tag?.productUrl || "").trim(),
        productHandle: String(tag?.productHandle || "").trim() || undefined,
      }))
      .filter((tag: { productTitle: string; productUrl: string }) => tag.productTitle && tag.productUrl)
      .slice(0, 8);

    await createAffiliateSocialPost({
      affiliateId: affiliate.id,
      caption,
      imageUrl,
      tags,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /affiliate/social] POST error:", error);
    return NextResponse.json({ error: "Failed to create affiliate post." }, { status: 500 });
  }
}

