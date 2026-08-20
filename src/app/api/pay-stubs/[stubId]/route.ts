import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { STAFF_SESSION_COOKIE, readStaffSession } from "@/lib/staff-auth";
import { loadStubAccess, readStubFile } from "@/lib/pay-stubs-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Hands over one page of a pay run.
 *
 * The bucket is private and nothing else can reach it, so this is the only door
 * — which makes the check below the whole of the security for this feature:
 *
 *   • the owner, signed in at `/admin`, may read any page, draft or live;
 *   • an employee may read exactly one page: their own, and only once the run
 *     has been released.
 *
 * There is deliberately no third case. A page carries somebody's wages, their
 * home address and the account their pay lands in.
 */
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ stubId: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "The database is not configured." }, { status: 503 });
  }

  const { stubId } = await params;
  const cookieStore = await cookies();
  const isAdmin = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const employeeId = await readStaffSession(cookieStore.get(STAFF_SESSION_COOKIE)?.value);
  if (!isAdmin && !employeeId) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const stub = await loadStubAccess(stubId);
  // Same answer for "no such page" and "not yours", so this cannot be used to
  // learn which pages exist.
  const notFound = NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!stub) return notFound;

  if (!isAdmin) {
    const isOwnStub = stub.employeeId !== null && stub.employeeId === employeeId;
    if (!isOwnStub || !stub.releasedAt) return notFound;
  }

  const bytes = await readStubFile(stub.storagePath);
  const filename = `pay-stub-${stub.payDate ?? "draft"}.pdf`;

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      // Inline so it can be previewed in place; the name is for saving it.
      "Content-Disposition": `inline; filename="${filename}"`,
      // Never cached by a proxy — this is one person's document.
      "Cache-Control": "private, no-store",
    },
  });
}
