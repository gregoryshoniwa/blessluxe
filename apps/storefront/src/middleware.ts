import { NextRequest, NextResponse } from "next/server";

const AFFILIATE_COOKIE = "affiliate_ref";

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const ref = request.nextUrl.searchParams.get("ref");

  if (ref && /^[a-zA-Z0-9_-]{3,40}$/.test(ref)) {
    response.cookies.set({
      name: AFFILIATE_COOKIE,
      value: ref,
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
      httpOnly: false,
      sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api).*)"],
};
