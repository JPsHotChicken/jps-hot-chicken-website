import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { STAFF_SESSION_COOKIE, readStaffSession } from "@/lib/staff-auth";
import {
  findEmployeeById,
  listPublishedWeeks,
  listRequestsForEmployee,
  listScheduledDates,
  loadShiftDays,
  loadPublishedRoles,
  loadPublishedWeek,
} from "@/lib/staff-repo";
import { payStubsForEmployee } from "@/lib/pay-stubs-repo";
import { listRuleSignatures } from "@/lib/staff-rules-repo";
import { listPublishedTipRates } from "@/lib/tip-rates-repo";
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
  toISODate,
} from "@/lib/schedule";
import { isStaffView } from "@/lib/staff-views";
import { loadTodaysWeather } from "@/lib/weather-repo";
import { WEATHER_KINDS, type Weather, type WeatherKind } from "@/lib/weather";
import { StaffDashboard } from "@/components/staff/StaffDashboard";
import { SetupNotice } from "@/components/admin/SetupNotice";

export const metadata: Metadata = {
  title: "My schedule",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** How far ahead the home page looks for somebody's next shift. */
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
  const initialView = isStaffView(requestedView) ? requestedView : "home";

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

  const [
    publishedWeeks,
    requests,
    scheduledDates,
    payStubs,
    tipRates,
    ruleSignatures,
    shiftDays,
    weather,
  ] = await Promise.all([
    listPublishedWeeks(thisWeek),
    listRequestsForEmployee(employee.id),
    listScheduledDates(employee.id, scheduledRange.from, scheduledRange.to),
    // Only released stubs come back, and only this person's — a draft pay run
    // is invisible here the same way it is invisible to the file route.
    payStubsForEmployee(employee.id),
    // The same handful of rates for everybody: an hour earned what an hour
    // earned, whoever worked it. Short enough to hand over whole, so paging
    // back through the weeks costs no further trips.
    listPublishedTipRates(),
    listRuleSignatures(employee.id),
    loadShiftDays(
      employee.id,
      todayISO,
      toISODate(addDays(fromISODate(todayISO), UPCOMING_DAYS)),
    ),
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

  // Show the current week when it's published, otherwise the next one that is.
  const initialWeekStart =
    publishedWeeks.find((entry) => entry.weekStart === thisWeek)?.weekStart ??
    publishedWeeks[0]?.weekStart ??
    null;

  const [initialWeek, initialRoles] = initialWeekStart
    ? await Promise.all([
        loadPublishedWeek(initialWeekStart),
        loadPublishedRoles(initialWeekStart, employee.id),
      ])
    : [null, null];

  return (
    <StaffDashboard
      employee={employee}
      publishedWeeks={publishedWeeks}
      initialWeekStart={initialWeekStart}
      initialWeek={initialWeek}
      initialRoles={initialRoles}
      initialRequests={requests}
      initialScheduledDates={scheduledDates}
      scheduledRange={scheduledRange}
      payStubs={payStubs}
      tipRates={tipRates}
      ruleSignatures={ruleSignatures}
      today={today}
      upcoming={upcoming}
      weather={shownWeather}
      initialView={initialView}
    />
  );
}
