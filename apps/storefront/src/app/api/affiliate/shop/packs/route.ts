import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { addAffiliateStorePack, getAffiliateByCode, removeAffiliateStorePack } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.email) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }
    const body = await req.json();
    const code = String(body.code || "").trim();
    const packCampaignId = String(body.pack_campaign_id || "").trim();
    if (!code || !packCampaignId) {
      return NextResponse.json({ error: "code and pack_campaign_id are required." }, { status: 400 });
    }
    const affiliate = await getAffiliateByCode(code);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }
    if (String(affiliate.email).toLowerCase() !== String(customer.email).toLowerCase()) {
      return NextResponse.json({ error: "Only the shop owner can update featured packs." }, { status: 403 });
    }
    await addAffiliateStorePack({ affiliateId: affiliate.id, packCampaignId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to add pack.";
    console.error("[API /affiliate/shop/packs] POST", e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.email) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }
    const code = String(req.nextUrl.searchParams.get("code") || "").trim();
    const packCampaignId = String(req.nextUrl.searchParams.get("pack_campaign_id") || "").trim();
    if (!code || !packCampaignId) {
      return NextResponse.json({ error: "code and pack_campaign_id query params are required." }, { status: 400 });
    }
    const affiliate = await getAffiliateByCode(code);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }
    if (String(affiliate.email).toLowerCase() !== String(customer.email).toLowerCase()) {
      return NextResponse.json({ error: "Only the shop owner can update featured packs." }, { status: 403 });
    }
    await removeAffiliateStorePack(affiliate.id, packCampaignId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[API /affiliate/shop/packs] DELETE", e);
    return NextResponse.json({ error: "Failed to remove pack." }, { status: 500 });
  }
}
