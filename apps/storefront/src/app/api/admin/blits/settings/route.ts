import { NextRequest, NextResponse } from "next/server";
import { ensureAffiliateSchema } from "@/lib/affiliate";
import { getPlatformBlitsSettings, updatePlatformBlitsSettings } from "@/lib/blits";
import { requireAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const denyResponse = await requireAdminRequest(req);
    if (denyResponse) return denyResponse;

    await ensureAffiliateSchema();
    const settings = await getPlatformBlitsSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[API /admin/blits/settings] GET error:", error);
    return NextResponse.json({ error: "Failed to load Blits settings." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const denyResponse = await requireAdminRequest(req);
    if (denyResponse) return denyResponse;

    await ensureAffiliateSchema();
    const body = await req.json();
    const settings = await updatePlatformBlitsSettings({
      usdToBlitsPerDollar: body.usd_to_blits_per_dollar,
      blitsPerUsdCashout: body.blits_per_usd_cashout,
      productDiscountPercentPayingBlits: body.product_discount_percent_paying_blits,
      purchaseTiers: body.purchase_tiers,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[API /admin/blits/settings] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update Blits settings." }, { status: 500 });
  }
}
