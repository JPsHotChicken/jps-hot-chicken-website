import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";

/**
 * Gate for the owner-only admin area. This is the first line of defence for
 * nicer redirects; `/admin` re-checks the session when it renders, so a stale
 * or forged cookie can't reach the dashboard even if this is bypassed.
 */
export async function proxy(request: NextRequest) {
  const isLoggedIn = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    // Already signed in? Skip the form.
    return isLoggedIn
      ? NextResponse.redirect(new URL("/admin", request.url))
      : NextResponse.next();
  }

  return isLoggedIn
    ? NextResponse.next()
    : NextResponse.redirect(new URL("/admin/login", request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
