import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Creates a Stripe PaymentIntent for Elements + confirmPayment (incl. 3DS return flow).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY is not configured." }, { status: 500 });
  }

  try {
    const body = await req.json();
    const amountUsd = Number(body.amountUsd ?? body.amount_usd);
    const idempotencyKey = String(body.idempotencyKey ?? "").trim() || undefined;
    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, string>)
        : undefined;

    if (!Number.isFinite(amountUsd) || amountUsd < 0.01) {
      return NextResponse.json({ error: "amountUsd must be at least 0.01." }, { status: 400 });
    }

    const amountCents = Math.max(1, Math.round(amountUsd * 100));
    const params = new URLSearchParams();
    params.set("amount", String(amountCents));
    params.set("currency", "usd");
    params.set("automatic_payment_methods[enabled]", "true");

    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        if (v != null && String(v).length > 0) {
          params.set(`metadata[${k}]`, String(v).slice(0, 500));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey.slice(0, 255);
    }

    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers,
      body: params.toString(),
    });

    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      client_secret?: string;
      error?: { message?: string };
    };

    if (!res.ok) {
      const msg = json.error?.message ?? `Stripe error (${res.status})`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    if (!json.client_secret || !json.id) {
      return NextResponse.json({ error: "Invalid Stripe response." }, { status: 502 });
    }

    return NextResponse.json({
      clientSecret: json.client_secret,
      paymentIntentId: json.id,
    });
  } catch (e) {
    console.error("[API /checkout/create-payment-intent]", e);
    return NextResponse.json({ error: "Could not create payment." }, { status: 500 });
  }
}
