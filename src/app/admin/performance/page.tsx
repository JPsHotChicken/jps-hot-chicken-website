import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { loadPerformanceData } from "@/lib/performance-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { PerformanceSheets } from "@/components/admin/PerformanceSheets";
import { SetupNotice } from "@/components/admin/SetupNotice";

export const metadata: Metadata = {
  title: "Performance sheets",
  robots: { index: false, follow: false },
};

// Read fresh on every visit — it is one owner looking at live data, and a stale
// metric set would be printed onto paper before anyone noticed.
export const dynamic = "force-dynamic";

/**
 * The performance sheet builder.
 *
 * Defines what gets measured, who it is measured for, and prints the sheet it
 * gets written on. Nothing records results: tracking happens on the paper this
 * page produces, which is why there is no entry screen anywhere behind it.
 */
export default async function PerformancePage() {
  // `proxy.ts` already redirects signed-out visitors; checking again here means
  // the page can never render off the back of a forged cookie.
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  return <PerformanceSheets initial={await loadPerformanceData()} />;
}
