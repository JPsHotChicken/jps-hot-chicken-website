import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import {
  OPERATIONS_SESSION_COOKIE,
  verifyOperationsSessionToken,
} from "@/lib/operations-auth";
import { STAFF_SESSION_COOKIE, readStaffSession } from "@/lib/staff-auth";

/**
 * Gate for the three signed-in areas: the owner's dashboard at `/admin`, the
 * shift tools at `/operations`, and the employee schedule at `/staff`. This is
 * the first line of defence for nicer redirects; every page re-checks its own
 * session when it renders, so a stale or forged cookie can't reach any of them
 * even if this is bypassed.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/operations" || pathname.startsWith("/operations/")) {
    const isUnlocked = await verifyOperationsSessionToken(
      request.cookies.get(OPERATIONS_SESSION_COOKIE)?.value,
    );

    if (pathname === "/operations/login") {
      return isUnlocked
        ? NextResponse.redirect(new URL("/operations", request.url))
        : NextResponse.next();
    }
    return isUnlocked
      ? NextResponse.next()
      : NextResponse.redirect(new URL("/operations/login", request.url));
  }

  if (pathname === "/staff" || pathname.startsWith("/staff/")) {
    const isSignedIn = Boolean(
      await readStaffSession(request.cookies.get(STAFF_SESSION_COOKIE)?.value),
    );

    // Signing in and setting a first password both have to work while signed
    // out — a new hire has no session yet, and that is the whole point of them.
    const isPublic = pathname === "/staff/login" || pathname.startsWith("/staff/setup");
    if (isPublic) {
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
  matcher: [
    "/admin",
    "/admin/:path*",
    "/operations",
    "/operations/:path*",
    "/staff",
    "/staff/:path*",
  ],
};
