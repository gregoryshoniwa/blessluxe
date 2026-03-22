import { NextResponse } from "next/server";
import { getPaymentGatewaySimOutcome } from "@/lib/payment-gateway-sim";

/**
 * Legacy: returns the simulated outcome only (no amount). Prefer POST `/api/checkout/external-payment`.
 */
export async function GET() {
  const outcome = getPaymentGatewaySimOutcome();
  return NextResponse.json({
    outcome,
    simulated: true as const,
  });
}
