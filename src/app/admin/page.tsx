import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { loadScheduleBase, loadWeek } from "@/lib/schedule-repo";
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

export default async function AdminPage() {
  // `proxy.ts` already redirects signed-out visitors, but the dashboard checks
  // again so the page can never render off the back of a forged cookie.
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const weekStart = toISODate(mondayOf());
  const base = await loadScheduleBase();
  const week = await loadWeek(weekStart, base.rowCount);

  return (
    <Scheduler
      rowCount={base.rowCount}
      employees={base.employees}
      timeOff={base.timeOff}
      recurringTimeOff={base.recurringTimeOff}
      weekStart={weekStart}
      week={week}
    />
  );
}
