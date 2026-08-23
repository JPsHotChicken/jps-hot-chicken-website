import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { STAFF_SESSION_COOKIE, readStaffSession } from "@/lib/staff-auth";
import {
  findEmployeeById,
  listPublishedWeeks,
  listRequestsForEmployee,
  loadPublishedWeek,
} from "@/lib/staff-repo";
import { payStubsForEmployee } from "@/lib/pay-stubs-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { mondayOf, toISODate } from "@/lib/schedule";
import { StaffDashboard } from "@/components/staff/StaffDashboard";
import { SetupNotice } from "@/components/admin/SetupNotice";

export const metadata: Metadata = {
  title: "My schedule",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const cookieStore = await cookies();
  const employeeId = await readStaffSession(cookieStore.get(STAFF_SESSION_COOKIE)?.value);
  if (!employeeId) redirect("/staff/login");

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const employee = await findEmployeeById(employeeId);
  // The session is valid but the person is gone — treat it as signed out rather
  // than rendering a dashboard for somebody who no longer works here.
  if (!employee) redirect("/staff/login");

  const thisWeek = toISODate(mondayOf());
  const [publishedWeeks, requests, payStubs] = await Promise.all([
    listPublishedWeeks(thisWeek),
    listRequestsForEmployee(employee.id),
    // Only released stubs come back, and only this person's — a draft pay run
    // is invisible here the same way it is invisible to the file route.
    payStubsForEmployee(employee.id),
  ]);

  // Show the current week when it's published, otherwise the next one that is.
  const initialWeekStart =
    publishedWeeks.find((entry) => entry.weekStart === thisWeek)?.weekStart ??
    publishedWeeks[0]?.weekStart ??
    null;

  const initialWeek = initialWeekStart
    ? await loadPublishedWeek(initialWeekStart)
    : null;

  return (
    <StaffDashboard
      employee={employee}
      publishedWeeks={publishedWeeks}
      initialWeekStart={initialWeekStart}
      initialWeek={initialWeek}
      initialRequests={requests}
      payStubs={payStubs}
    />
  );
}
