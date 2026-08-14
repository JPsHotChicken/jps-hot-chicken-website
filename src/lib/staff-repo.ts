import "server-only";

import { getDb } from "@/lib/supabase/server";
import { STAFF_ATTEMPT_WINDOW_MINUTES, STAFF_MAX_ATTEMPTS } from "@/lib/staff-auth";
import {
  DAY_KEYS,
  HOURS,
  START_HOUR,
  addDays,
  fromISODate,
  makeEmptyWeek,
  toISODate,
  type DayKey,
  type Employee,
  type TimeOffRequest,
  type WeekSchedule,
} from "@/lib/schedule";

/** Reads and writes for the employee-facing side of the scheduler. */

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[staff] ${context}: ${error?.message ?? "unknown error"}`);
}

function dayOf(weekStartISO: string, dateISO: string): DayKey | undefined {
  const offset = Math.round(
    (fromISODate(dateISO).getTime() - fromISODate(weekStartISO).getTime()) / 86_400_000,
  );
  return DAY_KEYS[offset];
}

/* ------------------------------------------------------------- login codes */

/**
 * A code nobody else has. Four digits is only 10,000 possibilities, so this
 * retries on collision rather than assuming a random pick is free.
 */
export async function generateUniqueLoginCode(): Promise<string> {
  const db = getDb();
  const { data, error } = await db.from("employees").select("login_code");
  if (error) fail("reading existing codes", error);

  const taken = new Set(data.map((row) => row.login_code).filter(Boolean));
  // Codes starting 0 are fine; leading zeros are preserved because the column
  // is text, not a number.
  const available: string[] = [];
  for (let n = 0; n < 10_000; n++) {
    const code = String(n).padStart(4, "0");
    if (!taken.has(code)) available.push(code);
  }
  if (available.length === 0) throw new Error("Every four digit code is taken.");
  return available[Math.floor(Math.random() * available.length)];
}

export async function setLoginCode(employeeId: string, code: string): Promise<void> {
  const { error } = await getDb()
    .from("employees")
    .update({ login_code: code })
    .eq("id", employeeId);
  if (error) fail("setting a login code", error);
}

/* ---------------------------------------------------------------- sign in */

/** How many failed attempts an address has made inside the throttle window. */
export async function recentFailedAttempts(ip: string): Promise<number> {
  const since = new Date(Date.now() - STAFF_ATTEMPT_WINDOW_MINUTES * 60_000).toISOString();
  const { count, error } = await getDb()
    .from("staff_login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("succeeded", false)
    .gte("attempted_at", since);

  // A throttle that can't be read shouldn't lock the whole restaurant out.
  if (error) {
    console.error("[staff] Could not read login attempts:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function recordLoginAttempt(ip: string, succeeded: boolean): Promise<void> {
  const { error } = await getDb().from("staff_login_attempts").insert({ ip, succeeded });
  if (error) console.error("[staff] Could not record a login attempt:", error.message);
}

export function isThrottled(failures: number): boolean {
  return failures >= STAFF_MAX_ATTEMPTS;
}

/** The employee a code belongs to, or `null` when nothing matches. */
export async function findEmployeeByCode(code: string): Promise<Employee | null> {
  const { data, error } = await getDb()
    .from("employees")
    .select("id, name, shift_group")
    .eq("login_code", code)
    .maybeSingle();

  if (error) fail("checking a login code", error);
  return data ? { id: data.id, name: data.name, group: data.shift_group } : null;
}

export async function findEmployeeById(id: string): Promise<Employee | null> {
  const { data, error } = await getDb()
    .from("employees")
    .select("id, name, shift_group")
    .eq("id", id)
    .maybeSingle();

  if (error) fail("loading an employee", error);
  return data ? { id: data.id, name: data.name, group: data.shift_group } : null;
}

/* ------------------------------------------------------- published weeks */

export type PublishedWeek = { weekStart: string; publishedAt: string };

/** Published weeks from this week onward, soonest first. */
export async function listPublishedWeeks(fromWeekISO: string): Promise<PublishedWeek[]> {
  const { data, error } = await getDb()
    .from("published_weeks")
    .select("week_start, published_at")
    .gte("week_start", fromWeekISO)
    .order("week_start");

  if (error) fail("listing published weeks", error);
  return data.map((row) => ({ weekStart: row.week_start, publishedAt: row.published_at }));
}

/**
 * The published grid for one week, in the same shape the admin grid uses so the
 * existing `employeeWeek` helpers work unchanged.
 */
export async function loadPublishedWeek(
  weekStartISO: string,
  rowCount: number,
): Promise<WeekSchedule> {
  const { data, error } = await getDb()
    .from("published_shifts")
    .select("shift_date, row_index, hour, employee_id")
    .eq("week_start", weekStartISO);

  if (error) fail(`loading published week ${weekStartISO}`, error);

  const week = makeEmptyWeek(rowCount);
  for (const row of data) {
    const day = dayOf(weekStartISO, row.shift_date);
    const hourIndex = row.hour - START_HOUR;
    if (!day || row.row_index >= rowCount || hourIndex < 0 || hourIndex >= HOURS.length) continue;
    week[day][row.row_index][hourIndex] = row.employee_id;
  }
  return week;
}

/* --------------------------------------------------------------- requests */

export async function listRequestsForEmployee(employeeId: string): Promise<TimeOffRequest[]> {
  const { data, error } = await getDb()
    .from("time_off_requests")
    .select("id, employee_id, start_date, end_date, reason, status, requested_at")
    .eq("employee_id", employeeId)
    .order("start_date", { ascending: false });

  if (error) fail("loading your requests", error);
  return data.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    status: row.status,
    requestedAt: row.requested_at,
  }));
}

/* -------------------------------------------------------------- publishing */

/**
 * Copy a week's working grid into the published tables, replacing whatever was
 * published for that week before. Everything staff see comes from this snapshot,
 * so until it runs the owner's edits are invisible to them.
 */
export async function publishWeek(weekStartISO: string): Promise<string> {
  const db = getDb();
  const weekEndISO = toISODate(addDays(fromISODate(weekStartISO), 6));

  const { data, error } = await db
    .from("shift_assignments")
    .select("shift_date, row_index, hour, employee_id")
    .gte("shift_date", weekStartISO)
    .lte("shift_date", weekEndISO);
  if (error) fail("reading the week being published", error);

  const publishedAt = new Date().toISOString();
  const { error: weekError } = await db
    .from("published_weeks")
    .upsert({ week_start: weekStartISO, published_at: publishedAt }, { onConflict: "week_start" });
  if (weekError) fail("marking the week published", weekError);

  // Replace rather than merge: a shift the owner deleted has to disappear for
  // staff too, and that only happens if the old snapshot goes first.
  const { error: clearError } = await db
    .from("published_shifts")
    .delete()
    .eq("week_start", weekStartISO);
  if (clearError) fail("clearing the previous published week", clearError);

  if (data.length > 0) {
    const { error: insertError } = await db
      .from("published_shifts")
      .insert(data.map((row) => ({ ...row, week_start: weekStartISO })));
    if (insertError) fail("publishing the week", insertError);
  }

  return publishedAt;
}

export type PublishState = {
  publishedAt: string | null;
  /** True when the working grid no longer matches what staff can see. */
  hasUnpublishedChanges: boolean;
};

/** Whether a week is published, and whether it has drifted since. */
export async function getPublishState(weekStartISO: string): Promise<PublishState> {
  const db = getDb();
  const weekEndISO = toISODate(addDays(fromISODate(weekStartISO), 6));

  const [week, working, published] = await Promise.all([
    db.from("published_weeks").select("published_at").eq("week_start", weekStartISO).maybeSingle(),
    db
      .from("shift_assignments")
      .select("shift_date, row_index, hour, employee_id")
      .gte("shift_date", weekStartISO)
      .lte("shift_date", weekEndISO),
    db
      .from("published_shifts")
      .select("shift_date, row_index, hour, employee_id")
      .eq("week_start", weekStartISO),
  ]);

  if (week.error) fail("reading publish state", week.error);
  if (working.error) fail("reading the working week", working.error);
  if (published.error) fail("reading the published week", published.error);

  if (!week.data) return { publishedAt: null, hasUnpublishedChanges: working.data.length > 0 };

  const key = (row: { shift_date: string; row_index: number; hour: number; employee_id: string }) =>
    `${row.shift_date}|${row.row_index}|${row.hour}|${row.employee_id}`;
  const workingKeys = new Set(working.data.map(key));
  const publishedKeys = new Set(published.data.map(key));
  const same =
    workingKeys.size === publishedKeys.size &&
    [...workingKeys].every((entry) => publishedKeys.has(entry));

  return { publishedAt: week.data.published_at, hasUnpublishedChanges: !same };
}
