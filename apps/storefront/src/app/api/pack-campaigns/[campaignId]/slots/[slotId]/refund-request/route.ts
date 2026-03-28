import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { sendPackCampaignEmails } from "@/lib/pack-notifications";
import { requestPackSlotRefund } from "@/lib/packs";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ campaignId: string; slotId: string }> }
) {
  try {
    const customer = await getCurrentCustomer();
    const customerId = customer?.id;
    if (typeof customerId !== "string" || !customerId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const { campaignId, slotId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { note?: string };
    const note = typeof body.note === "string" ? body.note : "";

    const result = await requestPackSlotRefund({
      campaignId,
      slotId,
      storefrontCustomerId: customerId,
      note: note.trim() || undefined,
    });

    if (!result.ok) {
      const map: Record<string, number> = {
        forbidden: 403,
        not_found: 404,
        campaign_closed: 400,
        invalid_status: 400,
        already_requested: 409,
      };
      return NextResponse.json(
        { error: result.reason },
        { status: map[result.reason] ?? 400 }
      );
    }

    void sendPackCampaignEmails({
      campaignId,
      kind: "refund_requested",
      detail: note.trim() || "A participant requested a refund before processing.",
    }).catch((e) => console.warn("[pack refund-request] email:", e));

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[API pack refund-request] POST", e);
    return NextResponse.json({ error: "Request failed." }, { status: 500 });
  }
}
