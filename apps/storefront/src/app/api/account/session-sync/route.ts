import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import {
  createSession,
  findOrCreateGoogleCustomer,
} from "@/lib/customer-account";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ error: "No OAuth session available." }, { status: 401 });
  }

  const displayName = session?.user?.name || "";
  const account = await findOrCreateGoogleCustomer({
    email,
    firstName: displayName.split(" ")[0] || "",
    lastName: displayName.split(" ").slice(1).join(" ") || "",
  });

  await createSession(String(account.id));
  return NextResponse.json({ ok: true });
}

