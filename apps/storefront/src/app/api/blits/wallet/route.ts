import { NextResponse } from "next/server";
import { getCurrentCustomer } from "@/lib/customer-account";
import { ensureBlitsSchema, getCustomerWalletLedger } from "@/lib/blits";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureBlitsSchema();
    const customer = await getCurrentCustomer();
    const customerId = customer?.id != null ? String(customer.id) : "";
    if (!customerId) {
      return NextResponse.json({ error: "Login required." }, { status: 401 });
    }
    const row = await queryOne<{ balance_blits: string }>(
      `SELECT balance_blits FROM customer_blits_wallet WHERE customer_id = $1`,
      [customerId]
    );
    const balance = row ? Number(row.balance_blits) : 0;
    const ledger = await getCustomerWalletLedger(customerId, 40);
    return NextResponse.json({ balance, ledger });
  } catch (error) {
    console.error("[API /blits/wallet] GET error:", error);
    return NextResponse.json({ error: "Failed to load wallet." }, { status: 500 });
  }
}
