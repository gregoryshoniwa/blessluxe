import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { sendPackCampaignEmails } from "@/lib/pack-notifications";
import { getCampaignById, reservePackSlot } from "@/lib/packs";

export const dynamic = "force-dynamic";

/**
 * Reserve one size on a pack campaign (pay later when pack completes, or before checkout for pay-now).
 * Body: { slot_id: string, mode: "pay_now" | "pay_when_complete" }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  try {
    const customer = await getCurrentCustomer();
    if (!customer?.id) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const { campaignId } = await ctx.params;
    const body = (await req.json()) as { slot_id?: string; mode?: "pay_now" | "pay_when_complete" };
    const slotId = String(body.slot_id || "").trim();
    const mode = body.mode === "pay_when_complete" ? "pay_when_complete" : "pay_now";

    if (!slotId) {
      return NextResponse.json({ error: "slot_id is required." }, { status: 400 });
    }

    const campaign = await getCampaignById(campaignId);
    if (
      !campaign ||
      campaign.status === "cancelled" ||
      campaign.status === "rejected" ||
      campaign.status === "fulfilled"
    ) {
      return NextResponse.json({ error: "Campaign not available." }, { status: 400 });
    }

    await reservePackSlot({
      campaignId,
      slotId,
      customerId: String(customer.id),
      mode,
      reserveHours: 48,
    });

    void sendPackCampaignEmails({
      campaignId,
      kind: "participant_joined",
      detail: "A size was reserved for this pack.",
    }).catch((e) => console.warn("[pack reserve] email:", e));

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Reserve failed.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
