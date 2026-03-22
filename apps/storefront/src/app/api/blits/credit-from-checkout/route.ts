import { NextRequest, NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { adjustCustomerBlits, computeBlitsForUsdPurchase, getPlatformBlitsSettings } from "@/lib/blits";

export const dynamic = "force-dynamic";

type Line = { amountUsd: number };

/**
 * Credits Blits after the customer completes checkout with card/mobile/bank (not Pay with Blits).
 * One entry per wallet top-up line; amounts must match paid USD for those lines.
 */
export async function POST(req: NextRequest) {
  try {
    const customer = await getCurrentCustomer();
    const customerId = customer?.id != null ? String(customer.id) : "";
    if (!customerId) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }

    const body = await req.json();
    const raw = body.lines as Line[] | undefined;
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ error: "No top-up lines." }, { status: 400 });
    }

    const settings = await getPlatformBlitsSettings();
    if (!settings) {
      return NextResponse.json({ error: "Blits not configured." }, { status: 500 });
    }

    let totalBlits = BigInt(0);
    const lineDetails: Array<{ amount_usd: number; blits: number }> = [];

    for (const line of raw) {
      const amountUsd = Number(line?.amountUsd);
      if (!Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > 100_000) {
        return NextResponse.json({ error: "Invalid amountUsd in lines." }, { status: 400 });
      }
      const blits = computeBlitsForUsdPurchase(amountUsd, settings);
      if (blits <= 0) {
        return NextResponse.json({ error: "No Blits for one or more amounts." }, { status: 400 });
      }
      totalBlits += BigInt(blits);
      lineDetails.push({ amount_usd: amountUsd, blits });
    }

    const { balanceAfter } = await adjustCustomerBlits(customerId, totalBlits, "purchase_checkout", {
      lines: lineDetails,
    });

    return NextResponse.json({
      ok: true,
      blitsCredited: Number(totalBlits),
      balanceAfter: balanceAfter.toString(),
    });
  } catch (error) {
    console.error("[API /blits/credit-from-checkout] error:", error);
    return NextResponse.json({ error: "Could not credit Blits." }, { status: 500 });
  }
}
