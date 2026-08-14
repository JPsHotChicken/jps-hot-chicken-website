import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { STAFF_SESSION_COOKIE, readStaffSession } from "@/lib/staff-auth";

/**
 * Gate for the two signed-in areas: the owner's dashboard at `/admin` and the
 * employee schedule at `/staff`. This is the first line of defence for nicer
 * redirects; both pages re-check the session when they render, so a stale or
 * forged cookie can't reach either even if this is bypassed.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/staff" || pathname.startsWith("/staff/")) {
    const isSignedIn = Boolean(
      await readStaffSession(request.cookies.get(STAFF_SESSION_COOKIE)?.value),
    );

    if (pathname === "/staff/login") {
      return isSignedIn
        ? NextResponse.redirect(new URL("/staff", request.url))
        : NextResponse.next();
    }
    return isSignedIn
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/staff/login", request.url));
  }

  const isLoggedIn = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

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
  matcher: ["/admin", "/admin/:path*", "/staff", "/staff/:path*"],
};
