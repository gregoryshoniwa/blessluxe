import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import {
  getOrCreateCustomerLoyaltyPoints,
  getPackLoyaltySettings,
  redeemLoyaltyPointsToBlits,
} from "@/lib/pack-loyalty";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const customer = await getCurrentCustomer();
    const customerId = customer?.id;
    if (typeof customerId !== "string" || !customerId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const [points, settings] = await Promise.all([
      getOrCreateCustomerLoyaltyPoints(customerId),
      getPackLoyaltySettings(),
    ]);

    return NextResponse.json({
      loyalty_points: points,
      settings: settings
        ? {
            max_loyalty_points: Number(settings.max_loyalty_points),
            blits_per_loyalty_point: Number(settings.blits_per_loyalty_point),
            starting_loyalty_points: Number(settings.starting_loyalty_points),
            leave_penalty_points: Number(settings.leave_penalty_points),
            completion_bonus_points: Number(settings.completion_bonus_points),
          }
        : null,
    });
  } catch (e) {
    console.error("[API /account/pack-loyalty] GET", e);
    return NextResponse.json({ error: "Failed to load loyalty." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    const customerId = customer?.id;
    if (typeof customerId !== "string" || !customerId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    const body = (await req.json()) as { points?: number };
    const points = Math.floor(Number(body.points ?? 0));
    if (!Number.isFinite(points) || points <= 0) {
      return NextResponse.json({ error: "Enter a valid points amount." }, { status: 400 });
    }

    try {
      const out = await redeemLoyaltyPointsToBlits(customerId, points);
      return NextResponse.json({
        ok: true,
        loyalty_points: out.loyaltyAfter,
        blits_credited: out.blitsCredited.toString(),
        blits_balance_after: out.balanceAfter.toString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Redeem failed.";
      if (msg === "INSUFFICIENT_LOYALTY_POINTS") {
        return NextResponse.json({ error: "Not enough loyalty points." }, { status: 400 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  } catch (e) {
    console.error("[API /account/pack-loyalty] POST", e);
    return NextResponse.json({ error: "Redeem failed." }, { status: 500 });
  }
}
