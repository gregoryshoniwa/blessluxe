import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { getAffiliateByCode } from "@/lib/affiliate";
import { assertAffiliateOwnsCampaign } from "@/lib/pack-campaign-actions";
import { updatePackCampaignGiftSettings, type GiftAllocationType } from "@/lib/packs";

export const dynamic = "force-dynamic";

/**
 * Affiliate owner configures early-bird Blits for a pack campaign.
 * Body: { affiliate_code, gift_countdown_ends_at?: string | null, gift_blits_prize?: number | null }
 * Both null clears. When setting a prize, deadline is required (ISO 8601, UTC recommended).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.email) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const { campaignId } = await ctx.params;
    const body = (await req.json()) as {
      affiliate_code?: string;
      gift_countdown_ends_at?: string | null;
      gift_blits_prize?: number | null;
      gift_allocation_type?: GiftAllocationType | null;
      gift_blits_pool?: number | null;
      gift_custom_per_size?: Record<string, number> | null;
    };
    const affiliateCode = String(body.affiliate_code || "").trim();
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

    const endsRaw = body.gift_countdown_ends_at;
    const ends =
      endsRaw != null && String(endsRaw).trim()
        ? new Date(String(endsRaw))
        : null;
    if (ends && Number.isNaN(ends.getTime())) {
      return NextResponse.json({ error: "Invalid gift_countdown_ends_at." }, { status: 400 });
    }

    const prize =
      body.gift_blits_prize != null && Number.isFinite(Number(body.gift_blits_prize))
        ? Number(body.gift_blits_prize)
        : null;

    const pool =
      body.gift_blits_pool != null && Number.isFinite(Number(body.gift_blits_pool))
        ? Number(body.gift_blits_pool)
        : null;

    const campaign = await updatePackCampaignGiftSettings({
      campaignId,
      giftCountdownEndsAt: ends,
      giftBlitsPrize: prize != null && Number.isFinite(prize) ? prize : null,
      giftAllocationType: body.gift_allocation_type ?? undefined,
      giftBlitsPool: pool != null && Number.isFinite(pool) ? pool : null,
      giftCustomPerSize: body.gift_custom_per_size ?? undefined,
    });

    return NextResponse.json({ campaign });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed.";
    const status = msg === "Forbidden." ? 403 : msg === "Campaign not found." ? 404 : 400;
    console.error("[API affiliate pack gift] PATCH", e);
    return NextResponse.json({ error: msg }, { status });
  }
}
