import { NextRequest, NextResponse } from "next/server";
import { createCommissionFromOrder } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId = String(body.orderId || "").trim();
    const orderTotal = Number(body.orderTotal || 0);
    const currencyCode = String(body.currencyCode || "usd").toLowerCase();
    const cookieRef = req.cookies.get("affiliate_ref")?.value;
    const refCode = String(body.refCode || cookieRef || "").trim();

    if (!orderId || !orderTotal || !refCode) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await createCommissionFromOrder({
      affiliateCode: refCode,
      orderId,
      orderTotal,
      currencyCode,
      metadata: {
        source: "storefront-checkout",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /affiliate/order-complete] error:", error);
    return NextResponse.json({ error: "Failed to track affiliate commission." }, { status: 500 });
  }
}
