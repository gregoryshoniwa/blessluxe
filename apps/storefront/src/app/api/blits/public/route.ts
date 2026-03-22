import { NextResponse } from "next/server";
import { ensureAffiliateSchema } from "@/lib/affiliate";
import { ensureBlitsSchema, getPlatformBlitsSettings } from "@/lib/blits";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public read for storefront: Blits conversion + purchase tiers + discount; active gift types. */
export async function GET() {
  try {
    await ensureAffiliateSchema();
    await ensureBlitsSchema();

    const settings = await getPlatformBlitsSettings();
    const giftTypes = await query<Record<string, unknown>>(
      `SELECT id, name, description, emoji, cost_blits, sort_order
       FROM blits_gift_type
       WHERE active = true
       ORDER BY sort_order ASC, created_at ASC`
    );

    return NextResponse.json({
      settings: settings
        ? {
            usd_to_blits_per_dollar: Number(settings.usd_to_blits_per_dollar),
            blits_per_usd_cashout: Number(settings.blits_per_usd_cashout),
            product_discount_percent_paying_blits: Number(settings.product_discount_percent_paying_blits),
            purchase_tiers: settings.purchase_tiers,
          }
        : null,
      giftTypes,
    });
  } catch (error) {
    console.error("[API /blits/public] error:", error);
    return NextResponse.json({ error: "Failed to load Blits config." }, { status: 500 });
  }
}
