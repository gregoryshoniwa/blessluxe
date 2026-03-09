import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentCustomer,
  listInbox,
  markInboxRead,
} from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function GET() {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const inbox = await listInbox(String(customer.id));
  return NextResponse.json({ inbox });
}

export async function PATCH(req: NextRequest) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = await req.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Message id is required." }, { status: 400 });
  await markInboxRead(String(customer.id), id);
  return NextResponse.json({ ok: true });
}
