"use server";

import { cookies } from "next/headers";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { STAFF_PASSWORD_MIN_LENGTH, isValidPasswordShape } from "@/lib/staff-auth";
import * as repo from "@/lib/schedule-repo";
import * as staff from "@/lib/staff-repo";
import {
  DAY_KEYS,
  CLOSE_MINUTE,
  EMPLOYEE_NAME_MAX_LENGTH,
  OPEN_MINUTE,
  ROLE_NAME_MAX_LENGTH,
  ROW_COUNT,
  SLOT_COUNT,
  SLOT_MINUTES,
  SHIFT_GROUPS,
  TIME_OFF_STATUSES,
  isRoleColor,
  type DayKey,
  type Employee,
  type RecurringTimeOff,
  type RoleColor,
  type ShiftGroup,
  type ShiftRole,
  type TimeOffRequest,
  type TimeOffStatus,
  type WeekPreferences,
  type WeekRoles,
  type WeekSchedule,
} from "@/lib/schedule";

/**
 * Server Actions behind the admin dashboard.
 *
 * A Server Action is a public POST endpoint — being rendered inside a protected
 * page proves nothing about the caller. Every action here re-checks the session
 * cookie itself, and validates its arguments rather than trusting the client,
 * because anyone on the internet can call these with any payload they like.
 */

async function requireAdmin(): Promise<void> {
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    throw new Error("Not signed in.");
  }
}

/* --------------------------------------------------------------- validation */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertISODate(value: string, field: string): string {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a date in YYYY-MM-DD form.`);
  }
  return value;
}

function assertMonday(value: string): string {
  assertISODate(value, "Week start");
  const [year, month, day] = value.split("-").map(Number);
  if (new Date(year, month - 1, day).getDay() !== 1) {
    throw new Error("Week start must be a Monday.");
  }
  return value;
}

function assertDay(value: string): DayKey {
  if (!DAY_KEYS.includes(value as DayKey)) throw new Error(`Unknown day "${value}".`);
  return value as DayKey;
}

function assertUuid(value: string, field: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${field} is not a valid id.`);
  }
  return value;
}

function assertBlock(block: repo.CellBlock): repo.CellBlock {
  const within = (value: number, max: number) =>
    Number.isInteger(value) && value >= 0 && value < max;
  const ok =
    within(block.rowStart, ROW_COUNT) &&
    within(block.rowEnd, ROW_COUNT) &&
    within(block.slotStart, SLOT_COUNT) &&
    within(block.slotEnd, SLOT_COUNT) &&
    block.rowStart <= block.rowEnd &&
    block.slotStart <= block.slotEnd;
  if (!ok) throw new Error("That block of cells is out of range.");
  return block;
}

/** Trim, require something left, and cap the length so a row can't be abused. */
function assertText(value: string, field: string, { max = 200, required = false } = {}): string {
  const trimmed = value.trim();
  if (required && !trimmed) throw new Error(`${field} is required.`);
  if (trimmed.length > max) throw new Error(`${field} must be ${max} characters or fewer.`);
  return trimmed;
}

/* ------------------------------------------------------------------- reads */

export type WeekData = {
  week: WeekSchedule;
  weekRoles: WeekRoles;
  /** Stations staff have asked for, by day. */
  preferences: WeekPreferences;
};

export async function loadWeekAction(weekStart: string): Promise<WeekData> {
  await requireAdmin();
  assertMonday(weekStart);
  const [week, weekRoles, preferences] = await Promise.all([
    repo.loadWeek(weekStart),
    repo.loadWeekRoles(weekStart),
    repo.loadWeekPreferences(weekStart),
  ]);
  return { week, weekRoles, preferences };
}

/**
 * Re-read everything for one week. The dashboard applies its edits optimistically,
 * so when a write fails this is how it gets back in step with the database
 * rather than showing a change that was never saved.
 */
export async function reloadAction(
  weekStart: string,
): Promise<repo.ScheduleBase & WeekData> {
  await requireAdmin();
  assertMonday(weekStart);
  const [base, week, weekRoles, preferences] = await Promise.all([
    repo.loadScheduleBase(),
    repo.loadWeek(weekStart),
    repo.loadWeekRoles(weekStart),
    repo.loadWeekPreferences(weekStart),
  ]);
  return { ...base, week, weekRoles, preferences };
}

/* --------------------------------------------------------------- employees */

/** New employees get a setup code straight away, so they can be told it on the spot. */
export async function addEmployeeAction(name: string, group: ShiftGroup): Promise<Employee> {
  await requireAdmin();
  if (!SHIFT_GROUPS.includes(group)) throw new Error(`Unknown shift group "${group}".`);
  return repo.insertEmployee(
    assertText(name, "Name", { max: EMPLOYEE_NAME_MAX_LENGTH, required: true }),
    group,
    await staff.generateUniqueSetupCode(),
  );
}

/** Fix a spelling, or add a surname. Returns the name as it was stored. */
export async function renameEmployeeAction(employeeId: string, name: string): Promise<string> {
  await requireAdmin();
  const stored = assertText(name, "Name", { max: EMPLOYEE_NAME_MAX_LENGTH, required: true });
  await repo.renameEmployee(assertUuid(employeeId, "Employee"), stored);
  return stored;
}

/**
 * Issue a fresh setup code — used when one is forgotten, or shared too widely.
 *
 * This does not touch a password they have already set: the code is only what
 * gets somebody through setup the first time.
 */
export async function regenerateSetupCodeAction(employeeId: string): Promise<string> {
  await requireAdmin();
  const code = await staff.generateUniqueSetupCode();
  await staff.setSetupCode(assertUuid(employeeId, "Employee"), code);
  return code;
}

/**
 * Set an employee's password on their behalf, from Staff management.
 *
 * The owner can already read these back, so letting them type a new one is how
 * a locked-out employee gets going again without a reset flow to build.
 *
 * A refusal comes back as a value rather than a thrown error, because both
 * reasons for one — too short, or already somebody else's — are things the owner
 * needs to read. Next.js replaces the message on an uncaught Server Action error
 * with a generic one in production, so throwing would leave them staring at
 * "something went wrong" with no idea which password to try instead.
 */
export type SetPasswordResult =
  | { ok: true; password: string; passwordSetAt: string }
  | { ok: false; error: string };

export async function setStaffPasswordAction(
  employeeId: string,
  password: string,
): Promise<SetPasswordResult> {
  await requireAdmin();
  if (!isValidPasswordShape(password)) {
    return {
      ok: false,
      error: `A password has to be at least ${STAFF_PASSWORD_MIN_LENGTH} characters.`,
    };
  }

  try {
    await staff.setStaffPassword(assertUuid(employeeId, "Employee"), password);
  } catch (cause) {
    if (cause instanceof staff.PasswordTakenError) return { ok: false, error: cause.message };
    throw cause;
  }

  // Setting a password spends the setup code, so the panel is told it has gone
  // rather than being left showing one that no longer works.
  return { ok: true, password, passwordSetAt: new Date().toISOString() };
}

/* -------------------------------------------------------------- publishing */

/** Push the visible week to every employee's `/staff` view. */
export async function publishWeekAction(weekStart: string): Promise<string> {
  await requireAdmin();
  assertMonday(weekStart);
  return staff.publishWeek(weekStart);
}

export async function publishStateAction(weekStart: string): Promise<staff.PublishState> {
  await requireAdmin();
  assertMonday(weekStart);
  return staff.getPublishState(weekStart);
}

export async function removeEmployeeAction(id: string): Promise<void> {
  await requireAdmin();
  await repo.deleteEmployee(assertUuid(id, "Employee"));
}

/* -------------------------------------------------------------------- grid */

export async function assignBlockAction(
  weekStart: string,
  day: string,
  block: repo.CellBlock,
  employeeId: string | null,
): Promise<void> {
  await requireAdmin();
  assertMonday(weekStart);
  await repo.assignBlock(
    weekStart,
    assertDay(day),
    assertBlock(block),
    employeeId === null ? null : assertUuid(employeeId, "Employee"),
  );
}

export async function copyDayAction(
  weekStart: string,
  from: string,
  targets: string[],
): Promise<void> {
  await requireAdmin();
  assertMonday(weekStart);
  await repo.copyDayToDays(weekStart, assertDay(from), targets.map(assertDay));
}

export async function copyWeekAction(fromWeek: string, toWeek: string): Promise<void> {
  await requireAdmin();
  assertMonday(fromWeek);
  assertMonday(toWeek);
  await repo.copyWeek(fromWeek, toWeek);
}

/* ------------------------------------------------------------------- roles */

function assertRoleColor(value: string): RoleColor {
  if (!isRoleColor(value)) throw new Error(`Unknown colour "${value}".`);
  return value;
}

/**
 * Like a password, a refused role comes back as a value: "there is already a
 * role called Lead" is something the owner needs to read, and production
 * Next.js would swap a thrown message for a generic one.
 */
export type RoleResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function roleResult<T>(run: () => Promise<T>): Promise<RoleResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (cause) {
    if (cause instanceof repo.RoleNameTakenError) return { ok: false, error: cause.message };
    throw cause;
  }
}

export async function addRoleAction(name: string, color: string): Promise<RoleResult<ShiftRole>> {
  await requireAdmin();
  const stored = assertText(name, "Role name", { max: ROLE_NAME_MAX_LENGTH, required: true });
  return roleResult(() => repo.insertRole(stored, assertRoleColor(color)));
}

export async function updateRoleAction(
  id: string,
  name: string,
  color: string,
): Promise<RoleResult<ShiftRole>> {
  await requireAdmin();
  const stored = assertText(name, "Role name", { max: ROLE_NAME_MAX_LENGTH, required: true });
  const role = { id: assertUuid(id, "Role"), name: stored, color: assertRoleColor(color) };
  return roleResult(async () => {
    await repo.updateRole(role.id, role.name, role.color);
    return role;
  });
}

export async function deleteRoleAction(id: string): Promise<void> {
  await requireAdmin();
  await repo.deleteRole(assertUuid(id, "Role"));
}

/** Give one person's shift a role, or clear it with `null`. */
export async function setShiftRoleAction(
  weekStart: string,
  day: string,
  employeeId: string,
  range: { start: number; end: number },
  roleId: string | null,
): Promise<void> {
  await requireAdmin();
  assertMonday(weekStart);
  const onGrid = (minute: number) =>
    Number.isInteger(minute) &&
    minute >= OPEN_MINUTE &&
    minute <= CLOSE_MINUTE &&
    (minute - OPEN_MINUTE) % SLOT_MINUTES === 0;
  if (!onGrid(range.start) || !onGrid(range.end) || range.start >= range.end) {
    throw new Error("That shift is out of range.");
  }
  await repo.setShiftRole(
    weekStart,
    assertDay(day),
    assertUuid(employeeId, "Employee"),
    range.start,
    range.end,
    roleId === null ? null : assertUuid(roleId, "Role"),
  );
}

/* ---------------------------------------------------------------- time off */

export async function addTimeOffAction(input: {
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<TimeOffRequest> {
  await requireAdmin();
  const startDate = assertISODate(input.startDate, "Start date");
  const endDate = assertISODate(input.endDate, "End date");
  if (endDate < startDate) throw new Error("The end date can't be before the start date.");

  return repo.insertTimeOff({
    employeeId: assertUuid(input.employeeId, "Employee"),
    startDate,
    endDate,
    reason: assertText(input.reason, "Reason"),
  });
}

export async function setTimeOffStatusAction(id: string, status: TimeOffStatus): Promise<void> {
  await requireAdmin();
  if (!TIME_OFF_STATUSES.includes(status)) throw new Error(`Unknown status "${status}".`);
  await repo.updateTimeOffStatus(assertUuid(id, "Request"), status);
}

/**
 * Delete a request. Soft, so it can be listed under "Deleted requests" and put
 * back; returns when it was deleted so the panel can say.
 */
export async function removeTimeOffAction(id: string): Promise<string> {
  await requireAdmin();
  return repo.deleteTimeOff(assertUuid(id, "Request"));
}

/** Undo a delete. */
export async function restoreTimeOffAction(id: string): Promise<void> {
  await requireAdmin();
  await repo.restoreTimeOff(assertUuid(id, "Request"));
}

export async function addRecurringTimeOffAction(input: {
  employeeId: string;
  day: DayKey;
  reason: string;
}): Promise<RecurringTimeOff> {
  await requireAdmin();
  return repo.upsertRecurringTimeOff({
    employeeId: assertUuid(input.employeeId, "Employee"),
    day: assertDay(input.day),
    reason: assertText(input.reason, "Reason"),
  });
}

export async function removeRecurringTimeOffAction(id: string): Promise<void> {
  await requireAdmin();
  await repo.deleteRecurringTimeOff(assertUuid(id, "Recurring time off"));
}
