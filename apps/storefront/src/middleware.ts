import { NextRequest, NextResponse } from "next/server";
import {
  AFFILIATE_COMMISSION_COOKIE,
  AFFILIATE_REF_COOKIE,
  COMMISSION_COOKIE_MAX_AGE_SECONDS,
  shouldClearAffiliateCommissionCookie,
} from "@/lib/affiliate-attribution";

// In-process cache of the allowed-country set. The set is refreshed lazily so
// middleware stays fast — admin changes propagate within `CACHE_TTL_MS`.
let CACHED_ALLOWED: Set<string> | null = null;
let CACHED_AT = 0;
const CACHE_TTL_MS = 60_000;
// Module-private inflight promise to coalesce concurrent refreshes.
let inflight: Promise<Set<string> | null> | null = null;

async function getAllowedCountries(): Promise<Set<string> | null> {
  const fresh = Date.now() - CACHED_AT < CACHE_TTL_MS;
  if (CACHED_ALLOWED && fresh) return CACHED_ALLOWED;
  if (inflight) return inflight;
  const base =
    process.env.SHOP_BACKEND_INTERNAL_URL?.trim() ||
    (process.env.NEXT_PUBLIC_COMMERCE_BACKEND || "http://localhost:9001").replace(
      /^http:\/\/localhost(:|$)/i,
      "http://127.0.0.1$1"
    );
  inflight = (async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(
        `${base.replace(/\/+$/, "")}/store/countries/allowed`,
        { signal: ctrl.signal, cache: "no-store" }
      );
      clearTimeout(t);
      if (!res.ok) return null;
      const json = (await res.json()) as { allowed?: string[] };
      const set = new Set((json.allowed || []).map((c) => c.toUpperCase()));
      CACHED_ALLOWED = set;
      CACHED_AT = Date.now();
      return set;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function shouldGate(pathname: string): boolean {
  // Don't block the /blocked page itself, API routes, or Next.js internals.
  return !(
    pathname === "/blocked" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/uploads") ||
    pathname === "/favicon.ico"
  );
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;
  const ref = request.nextUrl.searchParams.get("ref");

  // ── Country gate ────────────────────────────────────────────────────────
  if (shouldGate(pathname)) {
    const country = (
      request.headers.get("cf-ipcountry") ||
      request.headers.get("x-vercel-ip-country") ||
      process.env.STORE_COUNTRY_OVERRIDE ||
      ""
    )
      .toUpperCase()
      .slice(0, 2);

    if (country) {
      const allowed = await getAllowedCountries();
      // Fail open: no list available or empty list = open. Only block when we
      // know the list exists AND the country isn't in it.
      if (allowed && allowed.size > 0 && !allowed.has(country)) {
        const url = request.nextUrl.clone();
        url.pathname = "/blocked";
        url.search = `?from=${encodeURIComponent(country)}`;
        return NextResponse.rewrite(url);
      }
    }
  }

  if (ref && /^[a-zA-Z0-9_-]{3,40}$/.test(ref)) {
    response.cookies.set({
      name: AFFILIATE_REF_COOKIE,
      value: ref,
      path: "/",
      httpOnly: false,
      sameSite: "lax",
    });
  }

  // Commission eligibility: only while browsing an affiliate shop (cookie is set on first hit, cleared on main shop).
  const affiliateShopMatch = pathname.match(/^\/affiliate\/shop\/([a-zA-Z0-9_-]{3,40})/);
  if (affiliateShopMatch) {
    response.cookies.set({
      name: AFFILIATE_COMMISSION_COOKIE,
      value: affiliateShopMatch[1],
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: COMMISSION_COOKIE_MAX_AGE_SECONDS,
    });
  } else if (shouldClearAffiliateCommissionCookie(pathname)) {
    response.cookies.delete(AFFILIATE_COMMISSION_COOKIE);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
