import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { listBatches, loadBatch, loadRoster } from "@/lib/pay-stubs-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/admin/SetupNotice";
import { PayStubsDashboard } from "@/components/admin/PayStubsDashboard";

export const metadata: Metadata = {
  title: "Staff pay stubs",
  robots: { index: false, follow: false },
};

// Assignments change as the owner works through the pages, and a stale view
// would show a stub as unassigned after it had been settled.
export const dynamic = "force-dynamic";

/**
 * Where the accountant's payroll PDF becomes everyone's pay stub.
 *
 * The upload is split into a page per person here, checked against the roster,
 * and held as a draft until the owner releases it. Staff read their own page
 * from `/staff` once it is live — never this screen, which shows every page.
 */
export default async function PayStubsPage({
  searchParams,
}: {
  /** `?batch=` picks a pay run; without it the most recent one opens. */
  searchParams: Promise<{ batch?: string }>;
}) {
  // `proxy.ts` already redirects signed-out visitors; checking again here means
  // the page can never render off the back of a forged cookie.
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const requested = (await searchParams).batch;
  const [batches, roster] = await Promise.all([listBatches(), loadRoster()]);
  const chosen = batches.find((option) => option.id === requested) ?? batches[0];
  const batch = chosen ? await loadBatch(chosen.id) : null;

  return <PayStubsDashboard batches={batches} batch={batch} roster={roster} />;
}
