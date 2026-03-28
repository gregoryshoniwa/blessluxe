import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { getAffiliateByCode } from "@/lib/affiliate";
import { assertAffiliateOwnsCampaign, closePackCampaign } from "@/lib/pack-campaign-actions";

export const dynamic = "force-dynamic";

/**
 * Affiliate host closes a pack (cancel or reject). Body: { affiliate_code, reason?: "cancelled" | "rejected" }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.email) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const { campaignId } = await ctx.params;
    const body = (await req.json()) as { affiliate_code?: string; reason?: string };
    const affiliateCode = String(body.affiliate_code || "").trim();
    const reason = body.reason === "rejected" ? "rejected" : "cancelled";

    if (!affiliateCode) {
      return NextResponse.json({ error: "affiliate_code is required." }, { status: 400 });
    }

    const affiliate = await getAffiliateByCode(affiliateCode);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found." }, { status: 404 });
    }
    if (String(affiliate.email || "").toLowerCase() !== String(customer.email || "").toLowerCase()) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await assertAffiliateOwnsCampaign(affiliate.id, campaignId);

    const out = await closePackCampaign({
      campaignId,
      reason,
      closedBy: "affiliate",
    });

    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Close failed.";
    const status = msg === "Forbidden." ? 403 : msg === "Campaign not found." ? 404 : 400;
    console.error("[API affiliate pack close] POST", e);
    return NextResponse.json({ error: msg }, { status });
  }
}
