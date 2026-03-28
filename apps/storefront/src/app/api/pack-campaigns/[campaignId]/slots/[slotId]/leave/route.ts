import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { applyLeavePackPenalty } from "@/lib/pack-loyalty";
import { sendPackCampaignEmails } from "@/lib/pack-notifications";
import { leavePackSlot } from "@/lib/packs";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ campaignId: string; slotId: string }> }
) {
  try {
    const customer = await getCurrentCustomer();
    const customerId = customer?.id;
    if (typeof customerId !== "string" || !customerId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const { campaignId, slotId } = await ctx.params;
    const left = await leavePackSlot({
      campaignId,
      slotId,
      storefrontCustomerId: customerId,
    });

    if (!left.ok) {
      const status =
        left.reason === "forbidden" ? 403 : left.reason === "not_found" ? 404 : 400;
      return NextResponse.json({ error: left.reason }, { status });
    }

    try {
      await applyLeavePackPenalty(customerId, campaignId, slotId);
    } catch (e) {
      console.warn("[pack leave] loyalty penalty skipped:", e);
    }

    void sendPackCampaignEmails({
      campaignId,
      kind: "participant_left",
      detail:
        left.previousStatus === "paid"
          ? "A paid participant has left the pack (their size is marked withdrawn)."
          : "A reserved slot was released.",
    }).catch((e) => console.warn("[pack leave] email:", e));

    return NextResponse.json({ ok: true, previousStatus: left.previousStatus });
  } catch (e) {
    console.error("[API pack leave] POST", e);
    return NextResponse.json({ error: "Could not leave pack." }, { status: 500 });
  }
}
