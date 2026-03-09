import { NextResponse } from "next/server";
import { getCurrentCustomer, listTransactions } from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const transactions = await listTransactions(String(customer.id));
  return NextResponse.json({ transactions });
}
