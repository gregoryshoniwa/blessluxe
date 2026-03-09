import { NextRequest, NextResponse } from "next/server";
import {
  createTicket,
  getCurrentCustomer,
  listTickets,
} from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const tickets = await listTickets(String(customer.id));
  return NextResponse.json({ tickets });
}

export async function POST(req: NextRequest) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await req.json();
  const subject = String(body.subject || "").trim();
  const message = String(body.message || "").trim();
  if (!subject || !message) {
    return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  }
  await createTicket(String(customer.id), subject, message);
  return NextResponse.json({ ok: true });
}
