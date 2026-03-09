import { NextRequest, NextResponse } from "next/server";
import {
  createCustomerAccount,
  createEmailVerification,
  createSession,
} from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();

    if (!email || !password || password.length < 6) {
      return NextResponse.json({ error: "Valid email and password are required." }, { status: 400 });
    }

    const account = await createCustomerAccount({
      email,
      password,
      firstName,
      lastName,
      provider: "credentials",
    });
    await createSession(String(account.id));
    const verifyToken = await createEmailVerification(String(account.id));

    return NextResponse.json({
      ok: true,
      customer: account,
      verifyEmailToken: verifyToken,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Signup failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
