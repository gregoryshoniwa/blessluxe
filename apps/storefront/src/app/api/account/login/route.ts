import { NextRequest, NextResponse } from "next/server";
import {
  authenticateCustomer,
  createCustomerAccount,
  createSession,
  getCustomerByEmail,
} from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const mode = String(body.mode || "credentials");

    if (!email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    if (mode === "google") {
      // Simple-first Google quick sign-in simulation: create/find account by email.
      const existing = await getCustomerByEmail(email);
      const account =
        existing ||
        (await createCustomerAccount({
          email,
          firstName: "",
          lastName: "",
          provider: "google",
        }));
      await createSession(String(account.id));
      return NextResponse.json({ ok: true, customer: account });
    }

    const account = await authenticateCustomer(email, password);
    if (!account) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    await createSession(String(account.id));

    return NextResponse.json({ ok: true, customer: account });
  } catch {
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
