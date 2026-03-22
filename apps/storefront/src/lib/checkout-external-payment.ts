import { ensureBlitsSchema } from "@/lib/blits";
import { queryOne } from "@/lib/db";
import { getPaymentGatewaySimOutcome, type PaymentGatewaySimOutcome } from "@/lib/payment-gateway-sim";

export type ExternalPaymentProvider = "sim" | "stripe";

export type ExternalPaymentOutcome = "success" | "failure";

export function getCheckoutExternalPaymentProvider(): ExternalPaymentProvider {
  const raw = (process.env.CHECKOUT_EXTERNAL_PAYMENT_PROVIDER ?? "sim").trim().toLowerCase();
  if (raw === "stripe") return "stripe";
  return "sim";
}

/**
 * Simulated card / mobile / bank outcome (env-controlled).
 */
async function runSimulatedPayment(): Promise<ExternalPaymentOutcome> {
  const o = getPaymentGatewaySimOutcome();
  return o === "failure" ? "failure" : "success";
}

/**
 * Stripe PaymentIntent create + confirm (server-side). Requires a PaymentMethod id from Stripe.js / Elements.
 * Uses REST API so no stripe npm package is required.
 */
async function runStripePayment(input: {
  amountUsd: number;
  stripePaymentMethodId: string;
  idempotencyKey?: string;
}): Promise<{ outcome: ExternalPaymentOutcome; stripePaymentIntentId?: string; stripeStatus?: string; errorMessage?: string }> {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) {
    return { outcome: "failure", errorMessage: "STRIPE_SECRET_KEY is not configured." };
  }

  const amountCents = Math.max(1, Math.round(input.amountUsd * 100));
  const params = new URLSearchParams();
  params.set("amount", String(amountCents));
  params.set("currency", "usd");
  params.set("payment_method_types[0]", "card");
  params.set("payment_method", input.stripePaymentMethodId);
  params.set("confirm", "true");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (input.idempotencyKey) {
    headers["Idempotency-Key"] = input.idempotencyKey;
  }

  const res = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers,
    body: params.toString(),
  });

  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    status?: string;
    error?: { message?: string; type?: string };
  };

  if (!res.ok) {
    const msg = json.error?.message ?? `Stripe HTTP ${res.status}`;
    return { outcome: "failure", errorMessage: msg };
  }

  const status = json.status ?? "";
  const paid = status === "succeeded" || status === "processing";
  return {
    outcome: paid ? "success" : "failure",
    stripePaymentIntentId: json.id,
    stripeStatus: status,
    errorMessage: paid ? undefined : `Unexpected status: ${status}`,
  };
}

export type ResolveExternalPaymentInput = {
  amountUsd: number;
  currencyCode?: string;
  methodId?: string;
  /** Dedupes repeated attempts (e.g. double-submit). */
  idempotencyKey?: string;
  /** Required when provider is stripe. */
  stripePaymentMethodId?: string;
};

export type ResolveExternalPaymentResult = {
  outcome: ExternalPaymentOutcome;
  provider: ExternalPaymentProvider;
  mode: "simulated" | "stripe";
  stripePaymentIntentId?: string;
  errorMessage?: string;
};

/**
 * Resolves external (non-Blits) payment: simulation by default, or Stripe when configured.
 */
export async function resolveExternalPayment(input: ResolveExternalPaymentInput): Promise<ResolveExternalPaymentResult> {
  const provider = getCheckoutExternalPaymentProvider();

  if (input.amountUsd < 0.01) {
    return { outcome: "success", provider, mode: provider === "stripe" ? "stripe" : "simulated" };
  }

  if (provider === "stripe") {
    const pm = input.stripePaymentMethodId?.trim();
    if (!pm) {
      return {
        outcome: "failure",
        provider: "stripe",
        mode: "stripe",
        errorMessage:
          "Stripe is enabled but no payment method was sent. Integrate Stripe Elements and pass stripePaymentMethodId.",
      };
    }
    const idem = input.idempotencyKey ? `${input.idempotencyKey}:stripe` : undefined;
    const r = await runStripePayment({
      amountUsd: input.amountUsd,
      stripePaymentMethodId: pm,
      idempotencyKey: idem,
    });
    return {
      outcome: r.outcome,
      provider: "stripe",
      mode: "stripe",
      stripePaymentIntentId: r.stripePaymentIntentId,
      errorMessage: r.errorMessage,
    };
  }

  const outcome = await runSimulatedPayment();
  return { outcome, provider: "sim", mode: "simulated" };
}

/**
 * Idempotent wrapper: same idempotency key returns the same outcome JSON.
 */
export async function resolveExternalPaymentIdempotent(
  input: ResolveExternalPaymentInput
): Promise<ResolveExternalPaymentResult & { fromCache?: boolean }> {
  await ensureBlitsSchema();
  const key = input.idempotencyKey?.trim();
  if (key) {
    const row = await queryOne<{ outcome_json: unknown }>(
      `SELECT outcome_json FROM checkout_external_payment_idempotency WHERE idempotency_key = $1`,
      [key]
    );
    if (row?.outcome_json && typeof row.outcome_json === "object") {
      const cached = row.outcome_json as ResolveExternalPaymentResult;
      return { ...cached, fromCache: true };
    }
  }

  const result = await resolveExternalPayment(input);

  if (!key) {
    return result;
  }

  const payload = JSON.stringify(result);
  const inserted = await queryOne<{ outcome_json: unknown }>(
    `INSERT INTO checkout_external_payment_idempotency (idempotency_key, outcome_json)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING outcome_json`,
    [key, payload]
  );

  if (inserted?.outcome_json && typeof inserted.outcome_json === "object") {
    return { ...(inserted.outcome_json as ResolveExternalPaymentResult), fromCache: false };
  }

  const existing = await queryOne<{ outcome_json: unknown }>(
    `SELECT outcome_json FROM checkout_external_payment_idempotency WHERE idempotency_key = $1`,
    [key]
  );
  if (existing?.outcome_json && typeof existing.outcome_json === "object") {
    return { ...(existing.outcome_json as ResolveExternalPaymentResult), fromCache: true };
  }

  return result;
}
