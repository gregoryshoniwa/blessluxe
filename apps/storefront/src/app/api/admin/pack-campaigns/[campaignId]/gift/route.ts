import { NextRequest, NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/admin-auth";
import { updatePackCampaignGiftSettings, type GiftAllocationType } from "@/lib/packs";

export const dynamic = "force-dynamic";

/**
 * Admin configures early-bird Blits for any pack campaign.
 * Body: { gift_countdown_ends_at?: string | null, gift_blits_prize?: number | null }
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  try {
    const denyResponse = await requireAdminRequest(req);
    if (denyResponse) return denyResponse;

    const { campaignId } = await ctx.params;
    const body = (await req.json()) as {
      gift_countdown_ends_at?: string | null;
      gift_blits_prize?: number | null;
      gift_allocation_type?: GiftAllocationType | null;
      gift_blits_pool?: number | null;
      gift_custom_per_size?: Record<string, number> | null;
    };

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
    console.error("[API admin pack gift] PATCH", e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
