import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentCustomer,
  listInbox,
  listTickets,
  listTransactions,
  mergeCustomerMetadata,
  updateCustomerProfile,
} from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ customer: null }, { status: 200 });

  const [transactions, tickets, inbox] = await Promise.all([
    listTransactions(String(customer.id)),
    listTickets(String(customer.id)),
    listInbox(String(customer.id)),
  ]);

  return NextResponse.json({ customer, transactions, tickets, inbox });
}

export async function PATCH(req: NextRequest) {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json();
  const id = String(customer.id);
  if (body.metadataPatch && typeof body.metadataPatch === "object" && !Array.isArray(body.metadataPatch)) {
    await mergeCustomerMetadata(id, body.metadataPatch as Record<string, unknown>);
  }
  await updateCustomerProfile(id, {
    firstName: body.firstName,
    lastName: body.lastName,
    fullName: body.fullName,
    avatarUrl: body.avatarUrl,
    bio: body.bio,
    address: body.address || null,
    metadata: body.metadata ?? null,
  });

  return NextResponse.json({ ok: true });
}
