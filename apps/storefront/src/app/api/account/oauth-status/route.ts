import { NextResponse } from "next/server";
import { isGoogleOAuthConfigured } from "@/lib/auth-options";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ google: isGoogleOAuthConfigured() });
}

