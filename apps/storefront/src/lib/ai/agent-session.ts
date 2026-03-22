/**
 * One stable Postgres thread per logged-in customer so LUXE memory persists across visits.
 * Guests keep the client-generated session id.
 */
export function buildAgentSessionId(customerId: string | undefined, clientSessionId: string): string {
  if (customerId && customerId.trim() !== "") {
    return `customer_${customerId.trim()}`;
  }
  return String(clientSessionId || "").trim() || `guest_${Date.now()}`;
}
