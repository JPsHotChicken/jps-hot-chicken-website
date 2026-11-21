import "server-only";

import { getDb } from "@/lib/supabase/server";
import {
  STAFF_ATTEMPT_WINDOW_MINUTES,
  STAFF_MAX_ATTEMPTS,
  STAFF_SETUP_CODE_LENGTH,
} from "@/lib/staff-auth";
import {
  DAY_KEYS,
  addDays,
  fromISODate,
  rangesFromMinutes,
  roleCellForShift,
  toISODate,
  type DayKey,
  type Employee,
  type RolePreference,
  type RecurringTimeOff,
  type StaffShiftDay,
  type TimeOffRequest,
} from "@/lib/schedule";

/** Reads and writes for the employee-facing side of the scheduler. */

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[staff] ${context}: ${error?.message ?? "unknown error"}`);
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

/**
 * Store a password against an employee, stamping when it was set and spending
 * their setup code.
 *
 * Clearing `setup_code` in the same statement is what makes the code expire: it
 * did its one job, and a code read out across a counter shouldn't stay live
 * afterwards. It is the same UPDATE deliberately — if the password is refused
 * for being somebody else's, the whole thing rolls back and the code is still
 * there to try again with.
 *
 * Handing a fresh code out later (the dice in Staff management) is how somebody
 * who already has a password is let through setup a second time.
 */
export async function setStaffPassword(employeeId: string, password: string): Promise<string> {
  const { error } = await getDb()
    .from("employees")
    .update({
      staff_password: password,
      password_set_at: new Date().toISOString(),
      setup_code: null,
    })
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

/**
 * The employee a setup code belongs to, for the first-time sign-in flow.
 *
 * A spent code is `null` on the row, and no five digit string matches `null`, so
 * a code that has already been traded for a password simply finds nobody.
 */
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
 * One person's published shifts between two dates, with the role on each, for
 * the staff home page. Days with nothing on are left out, soonest first.
 */
export async function loadShiftDays(
  employeeId: string,
  fromISO: string,
  toISO: string,
): Promise<StaffShiftDay[]> {
  const db = getDb();
  const [shifts, roles] = await Promise.all([
    db
      .from("published_shifts")
      .select("shift_date, start_minute")
      .eq("employee_id", employeeId)
      .gte("shift_date", fromISO)
      .lte("shift_date", toISO),
    db
      .from("published_shift_roles")
      .select("shift_date, start_minute, role_name, role_color")
      .eq("employee_id", employeeId)
      .gte("shift_date", fromISO)
      .lte("shift_date", toISO),
  ]);
  if (shifts.error) fail("loading your upcoming shifts", shifts.error);
  if (roles.error) fail("loading your upcoming roles", roles.error);

  const minutesByDate = new Map<string, number[]>();
  for (const row of shifts.data) {
    const list = minutesByDate.get(row.shift_date) ?? [];
    list.push(row.start_minute);
    minutesByDate.set(row.shift_date, list);
  }

  return [...minutesByDate.keys()].sort().map((date) => {
    const roleCells = roles.data
      .filter((row) => row.shift_date === date)
      .map((row) => ({
        employeeId,
        minute: row.start_minute,
        name: row.role_name,
        color: row.role_color,
      }));
    return {
      date,
      shifts: rangesFromMinutes(minutesByDate.get(date) ?? []).map((range) => {
        const role = roleCellForShift(roleCells, employeeId, range);
        return { ...range, role: role ? { name: role.name, color: role.color } : null };
      }),
    };
  });
}

/**
 * The working week's roles as they would be published: named and coloured, and
 * only on half hours the person is actually on. A role left behind on time
 * somebody was taken off is ignored rather than tidied away, so it is dropped
 * here instead.
 */
async function rolesToPublish(
  weekStartISO: string,
  working: { shift_date: string; start_minute: number; employee_id: string }[],
) {
  const weekEndISO = toISODate(addDays(fromISODate(weekStartISO), 6));
  const db = getDb();
  const [cells, roles] = await Promise.all([
    db
      .from("shift_role_assignments")
      .select("shift_date, employee_id, start_minute, role_id")
      .gte("shift_date", weekStartISO)
      .lte("shift_date", weekEndISO),
    db.from("shift_roles").select("id, name, color"),
  ]);
  if (cells.error) fail("reading the week's roles", cells.error);
  if (roles.error) fail("reading roles", roles.error);

  const on = new Set(working.map((row) => `${row.shift_date}|${row.employee_id}|${row.start_minute}`));
  const roleById = new Map(roles.data.map((role) => [role.id, role]));

  return cells.data.flatMap((cell) => {
    const role = roleById.get(cell.role_id);
    if (!role || !on.has(`${cell.shift_date}|${cell.employee_id}|${cell.start_minute}`)) return [];
    return [
      {
        week_start: weekStartISO,
        shift_date: cell.shift_date,
        employee_id: cell.employee_id,
        start_minute: cell.start_minute,
        role_name: role.name,
        role_color: role.color,
      },
    ];
  });
}

/**
 * The dates between `fromISO` and `toISO` this employee has a published shift
 * on, so their calendar can mark the days they are working.
 *
 * The snapshot holds one row per half hour per position, so a single day comes
 * back many times over; the pages are read through and folded down to a set of
 * dates. Reading in pages rather than one shot keeps the answer complete even
 * when a long stretch of full days would run past the API's row limit.
 */
export async function listScheduledDates(
  employeeId: string,
  fromISO: string,
  toISO: string,
): Promise<string[]> {
  const db = getDb();
  const dates = new Set<string>();

  for (let page = 0; page < SCHEDULED_DATE_MAX_PAGES; page += 1) {
    const from = page * SCHEDULED_DATE_PAGE;
    const { data, error } = await db
      .from("published_shifts")
      .select("shift_date")
      .eq("employee_id", employeeId)
      .gte("shift_date", fromISO)
      .lte("shift_date", toISO)
      .order("shift_date")
      .range(from, from + SCHEDULED_DATE_PAGE - 1);

    if (error) fail("loading your scheduled days", error);
    for (const row of data) dates.add(row.shift_date);
    if (data.length < SCHEDULED_DATE_PAGE) break;
  }

  return [...dates].sort();
}

/** Rows per read, comfortably under the API's default thousand-row ceiling. */
const SCHEDULED_DATE_PAGE = 500;
/** A stop, so a surprise in the data can never turn into an endless loop. */
const SCHEDULED_DATE_MAX_PAGES = 40;

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

/**
 * One of this person's own live requests, or `null` — whether it doesn't exist,
 * is somebody else's, or has been deleted, the answer to them is the same.
 */
async function findOwnRequest(employeeId: string, id: string) {
  const { data, error } = await getDb()
    .from("time_off_requests")
    .select("id, end_date")
    .eq("id", id)
    .eq("employee_id", employeeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) fail("finding your request", error);
  return data;
}

/** Raised when a staff member reaches for a request they can't change. */
export class RequestLockedError extends Error {}

/**
 * Change the dates or reason of one of your own requests. It goes back to "In
 * review" whatever it was before: what the manager answered was a different
 * request. A request that has already ended is history and can't be changed.
 */
export async function updateOwnRequest(
  employeeId: string,
  id: string,
  todayISO: string,
  input: { startDate: string; endDate: string; reason: string },
): Promise<void> {
  const existing = await findOwnRequest(employeeId, id);
  if (!existing) throw new RequestLockedError("That request couldn't be found.");
  if (existing.end_date < todayISO) {
    throw new RequestLockedError("That request is in the past, so it can't be changed.");
  }

  const { error } = await getDb()
    .from("time_off_requests")
    .update({
      start_date: input.startDate,
      end_date: input.endDate,
      reason: input.reason,
      status: "pending",
    })
    .eq("id", id)
    .eq("employee_id", employeeId);
  if (error) fail("changing your request", error);
}

/**
 * Delete one of your own requests. Soft, like the owner's deletes: it lands in
 * the owner's "Deleted requests" and can be put back from there.
 */
export async function deleteOwnRequest(
  employeeId: string,
  id: string,
  todayISO: string,
): Promise<void> {
  const existing = await findOwnRequest(employeeId, id);
  if (!existing) throw new RequestLockedError("That request couldn't be found.");
  if (existing.end_date < todayISO) {
    throw new RequestLockedError("That request is in the past, so it can't be deleted.");
  }

  const { error } = await getDb()
    .from("time_off_requests")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("employee_id", employeeId);
  if (error) fail("deleting your request", error);
}

/* ------------------------------------------------- recurring days off */

/** This person's standing weekly days off, Monday first. */
export async function listRecurringForEmployee(employeeId: string): Promise<RecurringTimeOff[]> {
  const { data, error } = await getDb()
    .from("recurring_time_off")
    .select("id, employee_id, day, reason")
    .eq("employee_id", employeeId);
  if (error) fail("loading your days off every week", error);
  return data
    .map((row) => ({ id: row.id, employeeId: row.employee_id, day: row.day, reason: row.reason }))
    .sort((a, b) => DAY_KEYS.indexOf(a.day) - DAY_KEYS.indexOf(b.day));
}

/**
 * Add a weekday off, every week. It lands in the same table the owner fills
 * from the time-off panel, so it shows on the schedule maker straight away.
 */
export async function addOwnRecurring(employeeId: string, day: DayKey): Promise<void> {
  // Upserting only the day leaves alone any reason the owner already wrote
  // against it; a new row takes the column's empty default.
  const { error } = await getDb()
    .from("recurring_time_off")
    .upsert({ employee_id: employeeId, day }, { onConflict: "employee_id,day" });
  if (error) fail("adding a day off every week", error);
}

/** Remove one of your own weekly days off. Somebody else's id matches nothing. */
export async function removeOwnRecurring(employeeId: string, id: string): Promise<void> {
  const { error } = await getDb()
    .from("recurring_time_off")
    .delete()
    .eq("id", id)
    .eq("employee_id", employeeId);
  if (error) fail("removing a day off every week", error);
}

/* --------------------------------------------------- role preferences */

export async function listOwnPreferences(
  employeeId: string,
  fromISO: string,
  toISO: string,
): Promise<RolePreference[]> {
  const { data, error } = await getDb()
    .from("role_preferences")
    .select("employee_id, shift_date, role_id")
    .eq("employee_id", employeeId)
    .gte("shift_date", fromISO)
    .lte("shift_date", toISO);
  if (error) fail("loading your role preferences", error);
  return data.map((row) => ({
    employeeId: row.employee_id,
    date: row.shift_date,
    roleId: row.role_id,
  }));
}

/** Raised when a preference is set for a day it can't be set for. */
export class PreferenceRefusedError extends Error {}

/**
 * Say which of the owner's roles you'd like on a day you're working, or clear
 * it with `null`. Only for days from today on that you have a published shift:
 * a preference for a day you aren't on has nothing to attach to.
 */
export async function setOwnPreference(
  employeeId: string,
  dateISO: string,
  todayISO: string,
  roleId: string | null,
): Promise<void> {
  const db = getDb();
  if (dateISO < todayISO) throw new PreferenceRefusedError("That day has already gone.");

  if (roleId === null) {
    const { error } = await db
      .from("role_preferences")
      .delete()
      .eq("employee_id", employeeId)
      .eq("shift_date", dateISO);
    if (error) fail("clearing a role preference", error);
    return;
  }

  const { count, error: shiftError } = await db
    .from("published_shifts")
    .select("shift_date", { count: "exact", head: true })
    .eq("employee_id", employeeId)
    .eq("shift_date", dateISO);
  if (shiftError) fail("checking your shift", shiftError);
  if (!count) throw new PreferenceRefusedError("You're not scheduled that day.");

  const { error } = await db.from("role_preferences").upsert(
    {
      employee_id: employeeId,
      shift_date: dateISO,
      role_id: roleId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,shift_date" },
  );
  // 23503: the role was deleted while the page was open.
  if (error?.code === "23503") {
    throw new PreferenceRefusedError("That role no longer exists. Refresh the page.");
  }
  if (error) fail("saving a role preference", error);
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

  // Roles are snapshotted the same way, replaced wholesale.
  const roles = await rolesToPublish(weekStartISO, data);
  const { error: clearRolesError } = await db
    .from("published_shift_roles")
    .delete()
    .eq("week_start", weekStartISO);
  if (clearRolesError) fail("clearing the previous published roles", clearRolesError);
  if (roles.length > 0) {
    const { error: rolesError } = await db.from("published_shift_roles").insert(roles);
    if (rolesError) fail("publishing the week's roles", rolesError);
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

  const [week, working, published, publishedRoles] = await Promise.all([
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
    db
      .from("published_shift_roles")
      .select("shift_date, employee_id, start_minute, role_name, role_color")
      .eq("week_start", weekStartISO),
  ]);

  if (week.error) fail("reading publish state", week.error);
  if (working.error) fail("reading the working week", working.error);
  if (published.error) fail("reading the published week", published.error);
  if (publishedRoles.error) fail("reading the published roles", publishedRoles.error);

  if (!week.data) return { publishedAt: null, hasUnpublishedChanges: working.data.length > 0 };

  const key = (row: {
    shift_date: string;
    row_index: number;
    start_minute: number;
    employee_id: string;
  }) => `${row.shift_date}|${row.row_index}|${row.start_minute}|${row.employee_id}`;
  const workingKeys = new Set(working.data.map(key));
  const publishedKeys = new Set(published.data.map(key));
  const sameShifts =
    workingKeys.size === publishedKeys.size &&
    [...workingKeys].every((entry) => publishedKeys.has(entry));
  if (!sameShifts) return { publishedAt: week.data.published_at, hasUnpublishedChanges: true };

  // A role given, changed or renamed since Go Live is a change staff haven't seen.
  const roleKey = (row: {
    shift_date: string;
    employee_id: string;
    start_minute: number;
    role_name: string;
    role_color: string;
  }) => `${row.shift_date}|${row.employee_id}|${row.start_minute}|${row.role_name}|${row.role_color}`;
  const workingRoles = new Set((await rolesToPublish(weekStartISO, working.data)).map(roleKey));
  const publishedRoleKeys = new Set(publishedRoles.data.map(roleKey));
  const sameRoles =
    workingRoles.size === publishedRoleKeys.size &&
    [...workingRoles].every((entry) => publishedRoleKeys.has(entry));

  return { publishedAt: week.data.published_at, hasUnpublishedChanges: !sameRoles };
}
