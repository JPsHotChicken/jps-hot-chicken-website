import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { STAFF_SESSION_COOKIE, readStaffSession } from "@/lib/staff-auth";
import {
  findEmployeeById,
  listPublishedWeeks,
  listRequestsForEmployee,
  listScheduledDates,
  loadPublishedWeek,
} from "@/lib/staff-repo";
import { payStubsForEmployee } from "@/lib/pay-stubs-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { CALENDAR_DAY_COUNT, addDays, calendarStart, mondayOf, toISODate } from "@/lib/schedule";
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

  // The six rows the calendar opens on, with a week's slack either side: this
  // runs on a server clock that can sit a day either side of the employee's, and
  // a day is enough to move a Monday-start window a whole week.
  const scheduledFrom = addDays(calendarStart(), -7);
  const scheduledRange = {
    from: toISODate(scheduledFrom),
    to: toISODate(addDays(scheduledFrom, CALENDAR_DAY_COUNT + 13)),
  };

  const [publishedWeeks, requests, scheduledDates, payStubs] = await Promise.all([
    listPublishedWeeks(thisWeek),
    listRequestsForEmployee(employee.id),
    listScheduledDates(employee.id, scheduledRange.from, scheduledRange.to),
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
      initialScheduledDates={scheduledDates}
      scheduledRange={scheduledRange}
      payStubs={payStubs}
    />
  );
}
