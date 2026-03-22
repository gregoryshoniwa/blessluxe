/**
 * Until a real customer payment gateway is integrated, checkout treats the
 * external card / mobile / bank flow as if the gateway returned success or
 * failure based on env (see getPaymentGatewaySimOutcome).
 */

export type PaymentGatewaySimOutcome = "success" | "failure";

/**
 * Resolves simulated gateway result. Server-only env preferred so the outcome
 * cannot be spoofed from the client; `NEXT_PUBLIC_` is supported for local DX.
 */
export function getPaymentGatewaySimOutcome(): PaymentGatewaySimOutcome {
  const raw = (
    process.env.PAYMENT_GATEWAY_SIMULATE ??
    process.env.NEXT_PUBLIC_PAYMENT_GATEWAY_SIMULATE ??
    "success"
  )
    .trim()
    .toLowerCase();
  if (raw === "failure" || raw === "fail" || raw === "0" || raw === "false" || raw === "declined") {
    return "failure";
  }
  return "success";
}
