import { NextRequest, NextResponse } from "next/server";
import { createComment, getCurrentCustomer } from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const customer = await getCurrentCustomer();
  if (!customer) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const content = String(body.content || "").trim();
  if (!content) {
    return NextResponse.json({ error: "Comment is required." }, { status: 400 });
  }
  await createComment(String(customer.id), id, content);
  return NextResponse.json({ ok: true });
}
