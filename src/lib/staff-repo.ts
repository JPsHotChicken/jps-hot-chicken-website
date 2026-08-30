import "server-only";

import { getDb } from "@/lib/supabase/server";
import {
  STAFF_ATTEMPT_WINDOW_MINUTES,
  STAFF_MAX_ATTEMPTS,
  STAFF_SETUP_CODE_LENGTH,
} from "@/lib/staff-auth";
import {
  DAY_KEYS,
  ROW_COUNT,
  SLOT_COUNT,
  addDays,
  fromISODate,
  makeEmptyWeek,
  minuteSlot,
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

/* ------------------------------------------------------------- setup codes */

/** How many five digit codes exist, i.e. 00000-99999. */
const SETUP_CODE_SPACE = 10 ** STAFF_SETUP_CODE_LENGTH;

function randomSetupCode(): string {
  const [pick] = crypto.getRandomValues(new Uint32Array(1));
  return String(pick % SETUP_CODE_SPACE).padStart(STAFF_SETUP_CODE_LENGTH, "0");
}

/**
 * A setup code nobody else has.
 *
 * Guesses at random and checks against the codes already handed out rather than
 * building the whole hundred-thousand-code range: a restaurant has tens of
 * employees, so the first guess is free virtually every time. Leading zeros
 * survive because the column is text, not a number.
 */
export async function generateUniqueSetupCode(): Promise<string> {
  const db = getDb();
  const { data, error } = await db.from("employees").select("setup_code");
  if (error) fail("reading existing setup codes", error);

  const taken = new Set(data.map((row) => row.setup_code).filter(Boolean));
  if (taken.size >= SETUP_CODE_SPACE) throw new Error("Every five digit code is taken.");

  let code = randomSetupCode();
  while (taken.has(code)) code = randomSetupCode();
  return code;
}

/** Raised when the chosen code already belongs to somebody else. */
export class SetupCodeTakenError extends Error {
  constructor() {
    super("Another employee already uses that code. Pick a different one.");
    this.name = "SetupCodeTakenError";
  }
}

export async function setSetupCode(employeeId: string, code: string): Promise<void> {
  const { error } = await getDb()
    .from("employees")
    .update({ setup_code: code })
    .eq("id", employeeId);

  // 23505 is Postgres' unique violation. Codes have to identify one person, so
  // a clash is a normal thing for the owner to hit and fix, not a crash.
  if (error?.code === "23505") throw new SetupCodeTakenError();
  if (error) fail("setting a setup code", error);
}

/* ---------------------------------------------------------------- passwords */

/**
 * Raised when the password somebody typed is already another employee's.
 *
 * Sign-in is by password alone, so two people cannot share one — there would be
 * no way to tell who had just arrived. This is why the message says to pick a
 * different one rather than that it is wrong.
 */
export class PasswordTakenError extends Error {
  constructor() {
    super("That password is already in use. Please choose a different one.");
    this.name = "PasswordTakenError";
  }
}

/** Store a password against an employee, stamping when it was set. */
export async function setStaffPassword(employeeId: string, password: string): Promise<string> {
  const { error } = await getDb()
    .from("employees")
    .update({ staff_password: password, password_set_at: new Date().toISOString() })
    .eq("id", employeeId);

  if (error?.code === "23505") throw new PasswordTakenError();
  if (error) fail("setting a password", error);
  return password;
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

/**
 * The employee a password belongs to, or `null` when nothing matches.
 *
 * The password is the only thing typed at sign-in, so it is also what says who
 * is signing in — which is why `staff_password` is unique in the database.
 */
export async function findEmployeeByPassword(password: string): Promise<Employee | null> {
  const { data, error } = await getDb()
    .from("employees")
    .select("id, name, shift_group")
    .eq("staff_password", password)
    .maybeSingle();

  if (error) fail("checking a password", error);
  return data ? { id: data.id, name: data.name, group: data.shift_group } : null;
}

/** The employee a setup code belongs to, for the first-time sign-in flow. */
export async function findEmployeeBySetupCode(code: string): Promise<Employee | null> {
  const { data, error } = await getDb()
    .from("employees")
    .select("id, name, shift_group")
    .eq("setup_code", code)
    .maybeSingle();

  if (error) fail("checking a setup code", error);
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
export async function loadPublishedWeek(weekStartISO: string): Promise<WeekSchedule> {
  const { data, error } = await getDb()
    .from("published_shifts")
    .select("shift_date, row_index, start_minute, employee_id")
    .eq("week_start", weekStartISO);

  if (error) fail(`loading published week ${weekStartISO}`, error);

  const week = makeEmptyWeek();
  for (const row of data) {
    const day = dayOf(weekStartISO, row.shift_date);
    const slotIndex = minuteSlot(row.start_minute);
    if (!day || row.row_index >= ROW_COUNT || slotIndex < 0 || slotIndex >= SLOT_COUNT) continue;
    week[day][row.row_index][slotIndex] = row.employee_id;
  }
  return week;
}

/* --------------------------------------------------------------- requests */

export async function listRequestsForEmployee(employeeId: string): Promise<TimeOffRequest[]> {
  const { data, error } = await getDb()
    .from("time_off_requests")
    .select("id, employee_id, start_date, end_date, reason, status, requested_at")
    .eq("employee_id", employeeId)
    // A request the owner deleted is gone as far as staff are concerned, even
    // though the row is still there waiting to be undone.
    .is("deleted_at", null)
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
    .select("shift_date, row_index, start_minute, employee_id")
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
      .select("shift_date, row_index, start_minute, employee_id")
      .gte("shift_date", weekStartISO)
      .lte("shift_date", weekEndISO),
    db
      .from("published_shifts")
      .select("shift_date, row_index, start_minute, employee_id")
      .eq("week_start", weekStartISO),
  ]);

  if (week.error) fail("reading publish state", week.error);
  if (working.error) fail("reading the working week", working.error);
  if (published.error) fail("reading the published week", published.error);

  if (!week.data) return { publishedAt: null, hasUnpublishedChanges: working.data.length > 0 };

  const key = (row: {
    shift_date: string;
    row_index: number;
    start_minute: number;
    employee_id: string;
  }) => `${row.shift_date}|${row.row_index}|${row.start_minute}|${row.employee_id}`;
  const workingKeys = new Set(working.data.map(key));
  const publishedKeys = new Set(published.data.map(key));
  const same =
    workingKeys.size === publishedKeys.size &&
    [...workingKeys].every((entry) => publishedKeys.has(entry));

  return { publishedAt: week.data.published_at, hasUnpublishedChanges: !same };
}
