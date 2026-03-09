import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentCustomer } from "@/lib/customer-account";

const ADMIN_COOKIE = "blessluxe_admin";

function parseAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getDashboardKey() {
  return (process.env.ADMIN_DASHBOARD_KEY || "").trim();
}

function isAdminCookieValid(value?: string | null) {
  const dashboardKey = getDashboardKey();
  if (!dashboardKey) return false;
  return String(value || "").trim() === dashboardKey;
}

export function isAdminAccessConfigured() {
  return Boolean(getDashboardKey() || parseAdminEmails().length > 0);
}

export async function canAccessAdminPage() {
  const dashboardKey = getDashboardKey();
  if (dashboardKey) {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(ADMIN_COOKIE)?.value;
    return isAdminCookieValid(cookieValue);
  }

  const adminEmails = parseAdminEmails();
  if (adminEmails.length > 0) {
    const customer = await getCurrentCustomer();
    const email = String(customer?.email || "").toLowerCase();
    return Boolean(email && adminEmails.includes(email));
  }

  return false;
}

export async function setAdminCookie() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: ADMIN_COOKIE,
    value: getDashboardKey(),
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearAdminCookie() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: ADMIN_COOKIE,
    value: "",
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
  });
}

export async function requireAdminRequest(req: NextRequest) {
  const dashboardKey = getDashboardKey();
  if (dashboardKey) {
    const headerKey = (req.headers.get("x-admin-key") || "").trim();
    const cookieKey = req.cookies.get(ADMIN_COOKIE)?.value;
    if (isAdminCookieValid(headerKey) || isAdminCookieValid(cookieKey)) return null;
    return NextResponse.json({ error: "Unauthorized admin access." }, { status: 401 });
  }

  const adminEmails = parseAdminEmails();
  if (adminEmails.length > 0) {
    const customer = await getCurrentCustomer();
    const email = String(customer?.email || "").toLowerCase();
    if (email && adminEmails.includes(email)) return null;
    return NextResponse.json({ error: "Forbidden. Admin account required." }, { status: 403 });
  }

  return NextResponse.json(
    {
      error:
        "Admin access is not configured. Set ADMIN_DASHBOARD_KEY or ADMIN_EMAILS in environment.",
    },
    { status: 503 }
  );
}

