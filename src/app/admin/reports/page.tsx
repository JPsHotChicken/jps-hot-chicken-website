import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { SalesReports } from "@/components/admin/SalesReports";

export const metadata: Metadata = {
  title: "Reports",
  robots: { index: false, follow: false },
};

/**
 * The reports page.
 *
 * There is nothing to load: both reports are built from a sales summary the
 * owner has just downloaded, read in the browser, and printed or filed the same
 * morning. So this page is only the gate — see `SalesReports` for the reports
 * themselves, `lib/sales-report.ts` for what is taken off the export, and
 * `lib/spreadsheet.ts` for how the export is opened.
 *
 * It needs no Supabase, which means it keeps working on a day the database
 * doesn't.
 */
export default async function ReportsPage() {
  // `proxy.ts` already redirects signed-out visitors; checking again here means
  // the page can never render off the back of a forged cookie.
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  return <SalesReports />;
}
