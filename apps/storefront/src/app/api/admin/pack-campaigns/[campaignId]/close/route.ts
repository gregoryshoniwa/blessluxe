import { NextRequest, NextResponse } from "next/server";
import { closePackCampaign } from "@/lib/pack-campaign-actions";
import { requireAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/** Admin closes a pack. Body: { reason?: "cancelled" | "rejected" } */
export async function POST(req: NextRequest, ctx: { params: Promise<{ campaignId: string }> }) {
  try {
    const denyResponse = await requireAdminRequest(req);
    if (denyResponse) return denyResponse;

    const { campaignId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as { reason?: string };
    const reason = body.reason === "rejected" ? "rejected" : "cancelled";

    const out = await closePackCampaign({
      campaignId,
      reason,
      closedBy: "admin",
    });

    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Close failed.";
    console.error("[API admin pack close] POST", e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
