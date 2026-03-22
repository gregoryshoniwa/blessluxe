import { NextRequest, NextResponse } from "next/server";
import {
  AFFILIATE_COMMISSION_COOKIE,
  AFFILIATE_REF_COOKIE,
  COMMISSION_COOKIE_MAX_AGE_SECONDS,
  shouldClearAffiliateCommissionCookie,
} from "@/lib/affiliate-attribution";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;
  const ref = request.nextUrl.searchParams.get("ref");

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
