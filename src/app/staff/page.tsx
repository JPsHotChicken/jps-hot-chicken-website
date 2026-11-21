import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { STAFF_SESSION_COOKIE, readStaffSession } from "@/lib/staff-auth";
import {
  findEmployeeById,
  listPublishedWeeks,
  listRequestsForEmployee,
  listOwnPreferences,
  listRecurringForEmployee,
  listScheduledDates,
  loadShiftDays,
} from "@/lib/staff-repo";
import { payStubsForEmployee } from "@/lib/pay-stubs-repo";
import { loadRoles } from "@/lib/schedule-repo";
import { listRuleSignatures } from "@/lib/staff-rules-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import {
  CALENDAR_DAY_COUNT,
  addDays,
  calendarStart,
  dayKeyOf,
  fromISODate,
  isClosedDay,
  mondayOf,
  restaurantTodayISO,
  sundayWeekOf,
  toISODate,
} from "@/lib/schedule";
import { MOVED_STAFF_VIEWS, isStaffView } from "@/lib/staff-views";
import { loadTodaysWeather } from "@/lib/weather-repo";
import { WEATHER_KINDS, type Weather, type WeatherKind } from "@/lib/weather";
import { StaffDashboard } from "@/components/staff/StaffDashboard";
import { SetupNotice } from "@/components/admin/SetupNotice";

export const metadata: Metadata = {
  title: "My schedule",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** How far ahead the home page looks for somebody's next shift, in days. */
const UPCOMING_DAYS = 28;

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; weather?: string; night?: string }>;
}) {
  const cookieStore = await cookies();
  const employeeId = await readStaffSession(
    cookieStore.get(STAFF_SESSION_COOKIE)?.value,
  );
  if (!employeeId) redirect("/staff/login");

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const employee = await findEmployeeById(employeeId);
  // The session is valid but the person is gone — treat it as signed out rather
  // than rendering a dashboard for somebody who no longer works here.
  if (!employee) redirect("/staff/login");

  const params = await searchParams;
  const requestedView = params.view;
  const initialView = isStaffView(requestedView)
    ? requestedView
    : (MOVED_STAFF_VIEWS[requestedView ?? ""] ?? "home");

  // The restaurant's today, not the server's: Vercel runs in UTC.
  const todayISO = restaurantTodayISO();
  const thisWeek = toISODate(mondayOf(fromISODate(todayISO)));

  // The six rows the calendar opens on, with a week's slack either side: this
  // runs on a server clock that can sit a day either side of the employee's, and
  // a day is enough to move a Monday-start window a whole week.
  const scheduledFrom = addDays(calendarStart(), -7);
  const scheduledRange = {
    from: toISODate(scheduledFrom),
    to: toISODate(addDays(scheduledFrom, CALENDAR_DAY_COUNT + 13)),
  };

  // Shifts are read from this week's Sunday, so My schedule can show the days of
  // this week already gone, and well past next Saturday for the home page.
  const shiftsFrom = sundayWeekOf(todayISO)[0];
  const shiftsTo = toISODate(addDays(fromISODate(todayISO), UPCOMING_DAYS));

  const [
    publishedWeeks,
    requests,
    scheduledDates,
    payStubs,
    ruleSignatures,
    shiftDays,
    recurring,
    preferences,
    roles,
    weather,
  ] = await Promise.all([
    listPublishedWeeks(thisWeek),
    listRequestsForEmployee(employee.id),
    listScheduledDates(employee.id, scheduledRange.from, scheduledRange.to),
    // Only released stubs come back, and only this person's — a draft pay run
    // is invisible here the same way it is invisible to the file route.
    payStubsForEmployee(employee.id),
    listRuleSignatures(employee.id),
    loadShiftDays(employee.id, shiftsFrom, shiftsTo),
    listRecurringForEmployee(employee.id),
    listOwnPreferences(employee.id, todayISO, shiftsTo),
    // The owner's roles: what a role preference is picked from.
    loadRoles(),
    // Never throws, and gives up after a couple of seconds: decoration only.
    loadTodaysWeather(),
  ]);

  const today = {
    date: todayISO,
    closed: isClosedDay(dayKeyOf(todayISO)),
    posted: publishedWeeks.some((entry) => entry.weekStart === thisWeek),
    shifts: shiftDays.find((entry) => entry.date === todayISO)?.shifts ?? [],
  };
  const upcoming = shiftDays.find((entry) => entry.date > todayISO) ?? null;

  // Local development only: `?weather=rain` (add `&night=1` for after dark) draws
  // that scene whatever the sky is doing, so each one can be looked at. Ignored
  // on the live site.
  const previewKind = params.weather as WeatherKind | undefined;
  const shownWeather: Weather | null =
    process.env.NODE_ENV !== "production" && previewKind && WEATHER_KINDS.includes(previewKind)
      ? {
          kind: previewKind,
          isDay: params.night !== "1",
          label: `Preview: ${previewKind}`,
          temperature: weather?.temperature ?? 60,
          high: weather?.high ?? 64,
          low: weather?.low ?? 45,
          rainChance: 60,
        }
      : weather;

  return (
    <StaffDashboard
      employee={employee}
      initialRequests={requests}
      initialScheduledDates={scheduledDates}
      scheduledRange={scheduledRange}
      payStubs={payStubs}
      ruleSignatures={ruleSignatures}
      today={today}
      upcoming={upcoming}
      shiftDays={shiftDays}
      initialRecurring={recurring}
      initialPreferences={preferences}
      roles={roles}
      weather={shownWeather}
      initialView={initialView}
    />
  );
}
