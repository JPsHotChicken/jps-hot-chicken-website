"use server";

import { cookies } from "next/headers";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import * as repo from "@/lib/schedule-repo";
import * as staff from "@/lib/staff-repo";
import {
  DAY_KEYS,
  HOURS,
  MAX_ROW_COUNT,
  MIN_ROW_COUNT,
  SHIFT_GROUPS,
  TIME_OFF_STATUSES,
  type DayKey,
  type Employee,
  type RecurringTimeOff,
  type ShiftGroup,
  type TimeOffRequest,
  type TimeOffStatus,
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
    within(block.rowStart, MAX_ROW_COUNT) &&
    within(block.rowEnd, MAX_ROW_COUNT) &&
    within(block.hourStart, HOURS.length) &&
    within(block.hourEnd, HOURS.length) &&
    block.rowStart <= block.rowEnd &&
    block.hourStart <= block.hourEnd;
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

export async function loadWeekAction(weekStart: string, rowCount: number): Promise<WeekSchedule> {
  await requireAdmin();
  assertMonday(weekStart);
  const rows = Math.min(MAX_ROW_COUNT, Math.max(MIN_ROW_COUNT, Math.trunc(rowCount)));
  return repo.loadWeek(weekStart, rows);
}

/**
 * Re-read everything for one week. The dashboard applies its edits optimistically,
 * so when a write fails this is how it gets back in step with the database
 * rather than showing a change that was never saved.
 */
export async function reloadAction(
  weekStart: string,
): Promise<repo.ScheduleBase & { week: WeekSchedule }> {
  await requireAdmin();
  assertMonday(weekStart);
  const base = await repo.loadScheduleBase();
  return { ...base, week: await repo.loadWeek(weekStart, base.rowCount) };
}

/* --------------------------------------------------------------- employees */

/** New employees get a sign-in code straight away, so they can be told it on the spot. */
export async function addEmployeeAction(name: string, group: ShiftGroup): Promise<Employee> {
  await requireAdmin();
  if (!SHIFT_GROUPS.includes(group)) throw new Error(`Unknown shift group "${group}".`);
  return repo.insertEmployee(
    assertText(name, "Name", { max: 80, required: true }),
    group,
    await staff.generateUniqueLoginCode(),
  );
}

/** Issue a fresh random code — used when one is forgotten, or shared too widely. */
export async function regenerateLoginCodeAction(employeeId: string): Promise<string> {
  await requireAdmin();
  const code = await staff.generateUniqueLoginCode();
  await staff.setLoginCode(assertUuid(employeeId, "Employee"), code);
  return code;
}

/** Set a specific sign-in code, chosen by the owner in Staff management. */
export async function setLoginCodeAction(employeeId: string, code: string): Promise<string> {
  await requireAdmin();
  if (!/^[0-9]{4}$/.test(code)) throw new Error("A code has to be exactly four digits.");
  await staff.setLoginCode(assertUuid(employeeId, "Employee"), code);
  return code;
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

/* ---------------------------------------------------------------- settings */

export async function setRowCountAction(rowCount: number): Promise<number> {
  await requireAdmin();
  const clamped = Math.min(MAX_ROW_COUNT, Math.max(MIN_ROW_COUNT, Math.trunc(rowCount)));
  await repo.setRowCount(clamped);
  return clamped;
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

export async function removeTimeOffAction(id: string): Promise<void> {
  await requireAdmin();
  await repo.deleteTimeOff(assertUuid(id, "Request"));
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
