import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { fetchStoreProductThumbAndHandle } from "@/lib/medusa";
import { enrichPackSlotsWithOccupantLabels } from "@/lib/pack-slot-display";
import { getOrCreateCustomerLoyaltyPoints, getPackLoyaltySettings } from "@/lib/pack-loyalty";
import {
  getCampaignByPublicCode,
  getPackDefinitionById,
  listEventsForCampaign,
  listSlotsForCampaign,
  settlePackPoolGiftsIfDue,
  slotOwnedByStorefront,
} from "@/lib/packs";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const campaign = await getCampaignByPublicCode(decodeURIComponent(code));
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    const [definition, rawSlots, events] = await Promise.all([
      getPackDefinitionById(campaign.pack_definition_id),
      listSlotsForCampaign(campaign.id),
      listEventsForCampaign(campaign.id, 40),
    ]);

    void settlePackPoolGiftsIfDue(campaign.id).catch(() => undefined);

    let product_thumbnail_url: string | null = null;
    let product_handle: string | null = null;
    if (definition?.product_id) {
      const media = await fetchStoreProductThumbAndHandle(definition.product_id);
      product_thumbnail_url = media.thumb;
      product_handle = media.handle;
    }

    const slots = await enrichPackSlotsWithOccupantLabels(rawSlots);

    const customer = await getCurrentCustomer();
    const cid = customer?.id;
    const my_slot_ids: string[] = [];
    let my_slot_id: string | null = null;
    let loyalty_points: number | null = null;
    let loyalty_settings: {
      max_loyalty_points: number;
      blits_per_loyalty_point: number;
    } | null = null;

    if (typeof cid === "string" && cid) {
      const [pts, settings] = await Promise.all([
        getOrCreateCustomerLoyaltyPoints(cid),
        getPackLoyaltySettings(),
      ]);
      loyalty_points = pts;
      if (settings) {
        loyalty_settings = {
          max_loyalty_points: Number(settings.max_loyalty_points),
          blits_per_loyalty_point: Number(settings.blits_per_loyalty_point),
        };
      }
      for (const s of slots) {
        if (
          slotOwnedByStorefront(s, cid) &&
          (s.status === "reserved" || s.status === "paid")
        ) {
          my_slot_ids.push(s.id);
        }
      }
      my_slot_id = my_slot_ids[0] ?? null;
    }

    return NextResponse.json({
      campaign,
      definition,
      slots,
      events,
      my_slot_id,
      my_slot_ids,
      loyalty_points,
      loyalty_settings,
      product_thumbnail_url,
      product_handle,
    });
  } catch (e) {
    console.error("[API /pack-campaigns/by-code] GET", e);
    return NextResponse.json({ error: "Failed to load campaign." }, { status: 500 });
  }
}
