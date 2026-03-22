import { NextRequest, NextResponse } from "next/server";
import { resolveExternalPaymentIdempotent } from "@/lib/checkout-external-payment";

export const dynamic = "force-dynamic";

/**
 * Authorizes or simulates the non-Blits (card / mobile / bank) portion of checkout.
 * When `CHECKOUT_EXTERNAL_PAYMENT_PROVIDER=stripe`, pass `stripePaymentMethodId` from Stripe.js.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const amountUsd = Number(body.amountUsd ?? body.amount_usd);
    const currencyCode = String(body.currencyCode ?? body.currency_code ?? "usd");
    const methodId = body.methodId != null ? String(body.methodId) : undefined;
    const idempotencyKey =
      req.headers.get("Idempotency-Key")?.trim() || String(body.idempotencyKey ?? "").trim() || undefined;
    const stripePaymentMethodId =
      body.stripePaymentMethodId != null ? String(body.stripePaymentMethodId).trim() : undefined;

    if (!Number.isFinite(amountUsd) || amountUsd < 0) {
      return NextResponse.json({ error: "Invalid amountUsd." }, { status: 400 });
    }

    const result = await resolveExternalPaymentIdempotent({
      amountUsd,
      currencyCode,
      methodId,
      idempotencyKey,
      stripePaymentMethodId: stripePaymentMethodId || undefined,
    });

    if (result.outcome === "failure") {
      return NextResponse.json(
        {
          outcome: "failure" as const,
          provider: result.provider,
          mode: result.mode,
          errorMessage: result.errorMessage ?? "Payment declined.",
          fromCache: result.fromCache ?? false,
        },
        { status: 402 }
      );
    }

    return NextResponse.json({
      outcome: "success" as const,
      provider: result.provider,
      mode: result.mode,
      stripePaymentIntentId: result.stripePaymentIntentId,
      fromCache: result.fromCache ?? false,
    });
  } catch (error) {
    console.error("[API /checkout/external-payment] error:", error);
    return NextResponse.json({ error: "Payment failed." }, { status: 500 });
  }
}
