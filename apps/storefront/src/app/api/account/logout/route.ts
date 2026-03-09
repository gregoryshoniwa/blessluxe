import { NextResponse } from "next/server";
import { clearSession } from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
