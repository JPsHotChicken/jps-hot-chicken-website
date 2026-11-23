import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { loadAttendance } from "@/lib/attendance-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { AttendanceTracker } from "@/components/admin/AttendanceTracker";
import { SetupNotice } from "@/components/admin/SetupNotice";

export const metadata: Metadata = {
  title: "Attendance tracker",
  robots: { index: false, follow: false },
};

// Live data for one owner — nothing worth caching.
export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  // `proxy.ts` already redirects signed-out visitors; checking again here means
  // the page can never render off the back of a forged cookie.
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { employees, entries } = await loadAttendance();
  return <AttendanceTracker employees={employees} initialEntries={entries} />;
}
