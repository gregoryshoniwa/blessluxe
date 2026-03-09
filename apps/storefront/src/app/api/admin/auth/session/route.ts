import { NextRequest, NextResponse } from "next/server";
import {
  canAccessAdminPage,
  clearAdminCookie,
  isAdminAccessConfigured,
  setAdminCookie,
} from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isAdminAccessConfigured()) {
    return NextResponse.json(
      { error: "Admin access is not configured in environment." },
      { status: 503 }
    );
  }

  const dashboardKey = (process.env.ADMIN_DASHBOARD_KEY || "").trim();
  if (!dashboardKey) {
    const allowed = await canAccessAdminPage();
    if (!allowed) {
      return NextResponse.json(
        { error: "Login with an allowed admin account to continue." },
        { status: 403 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  const body = await req.json();
  const key = String(body.key || "").trim();
  if (!key || key !== dashboardKey) {
    return NextResponse.json({ error: "Invalid admin key." }, { status: 401 });
  }

  await setAdminCookie();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearAdminCookie();
  return NextResponse.json({ ok: true });
}

