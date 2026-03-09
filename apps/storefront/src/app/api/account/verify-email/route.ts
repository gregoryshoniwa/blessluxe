import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const token = String(body.token || "").trim();
  if (!token) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }

  const ok = await verifyEmailToken(token);
  if (!ok) {
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
