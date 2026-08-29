import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { loadScheduleBase, loadWeek } from "@/lib/schedule-repo";
import { loadAliases } from "@/lib/pay-stubs-repo";
import { getPublishState } from "@/lib/staff-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { mondayOf, toISODate } from "@/lib/schedule";
import { Scheduler } from "@/components/admin/Scheduler";
import { SetupNotice } from "@/components/admin/SetupNotice";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// The schedule is read fresh on every visit — it is one owner looking at live
// data, so there is nothing worth caching and a stale week would be misleading.
export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  // `?view=staff` is how the dashboard is reached from another admin page —
  // there is nowhere else to land, since both views live on this one route.
  searchParams: Promise<{ view?: string }>;
}) {
  // `proxy.ts` already redirects signed-out visitors, but the dashboard checks
  // again so the page can never render off the back of a forged cookie.
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const view = (await searchParams).view === "staff" ? "staff" : "scheduler";

  const weekStart = toISODate(mondayOf());
  const base = await loadScheduleBase();
  const [week, publishState, payrollNames] = await Promise.all([
    loadWeek(weekStart),
    getPublishState(weekStart),
    // How payroll spells each person, shown on the staff tab so a wrong one can
    // be dropped before it sends somebody the wrong pay stub.
    loadAliases(),
  ]);

  return (
    <Scheduler
      employees={base.employees}
      timeOff={base.timeOff}
      deletedTimeOff={base.deletedTimeOff}
      recurringTimeOff={base.recurringTimeOff}
      weekStart={weekStart}
      week={week}
      publishState={publishState}
      payrollNames={payrollNames}
      initialView={view}
    />
  );
}
