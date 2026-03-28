import { NextRequest, NextResponse } from "next/server";
import { ensureAffiliateSchema } from "@/lib/affiliate";
import { getPackLoyaltySettings, updatePackLoyaltySettings } from "@/lib/pack-loyalty";
import { requireAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const denyResponse = await requireAdminRequest(req);
    if (denyResponse) return denyResponse;

    await ensureAffiliateSchema();
    const settings = await getPackLoyaltySettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[API /admin/pack-loyalty/settings] GET error:", error);
    return NextResponse.json({ error: "Failed to load pack loyalty settings." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denyResponse = await requireAdminRequest(req);
    if (denyResponse) return denyResponse;

    await ensureAffiliateSchema();
    const body = await req.json();
    const settings = await updatePackLoyaltySettings({
      startingLoyaltyPoints: body.starting_loyalty_points,
      maxLoyaltyPoints: body.max_loyalty_points,
      leavePenaltyPoints: body.leave_penalty_points,
      completionBonusPoints: body.completion_bonus_points,
      blitsPerLoyaltyPoint: body.blits_per_loyalty_point,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[API /admin/pack-loyalty/settings] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update pack loyalty settings." }, { status: 500 });
  }
}
