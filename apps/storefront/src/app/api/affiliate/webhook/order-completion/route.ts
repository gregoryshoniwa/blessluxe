import { NextRequest, NextResponse } from "next/server";
import { createCommissionFromOrder } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const metadata = (body.metadata || {}) as Record<string, unknown>;
    const orderId = String(body.id || body.order_id || "").trim();
    const orderTotal = Number(
      body.total || body.total_amount || metadata.total || metadata.order_total || 0
    );
    const currencyCode = String(body.currency_code || metadata.currency_code || "usd");
    const refCode = String(
      metadata.affiliate_code || metadata.ref || body.ref || body.affiliate_code || ""
    ).trim();

    if (!orderId || !orderTotal || !refCode) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    // Do not pay commission on explicitly main-store / non-affiliate checkouts from Medusa metadata.
    const attribution = String(metadata.affiliate_attribution || metadata.ref_source || "").toLowerCase();
    if (
      attribution === "main_shop" ||
      metadata.skip_affiliate_commission === true ||
      metadata.affiliate_commission === false
    ) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    await createCommissionFromOrder({
      affiliateCode: refCode,
      orderId,
      orderTotal,
      currencyCode,
      metadata: {
        source: "order-webhook",
        attribution_source:
          attribution === "affiliate_shop" || metadata.affiliate_commission_source === "affiliate_shop"
            ? "affiliate_shop"
            : "webhook_legacy",
        payload: body,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /affiliate/webhook/order-completion] error:", error);
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
