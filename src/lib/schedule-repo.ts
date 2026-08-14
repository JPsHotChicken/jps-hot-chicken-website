import "server-only";

import { getDb } from "@/lib/supabase/server";
import {
  DAY_KEYS,
  HOURS,
  START_HOUR,
  addDays,
  datesForWeek,
  fromISODate,
  makeEmptyWeek,
  toISODate,
  type DayKey,
  type Employee,
  type RecurringTimeOff,
  type ShiftGroup,
  type TimeOffRequest,
  type TimeOffStatus,
  type WeekSchedule,
} from "@/lib/schedule";

/**
 * Every read and write the scheduler performs, in one place.
 *
 * The grid is stored one row per filled cell keyed by real calendar date, while
 * the UI thinks in (week, weekday, rowIndex, hourIndex). Translating between the
 * two is this module's job — nothing above it needs to know the table shape.
 */

/** Inclusive rectangle of grid cells, mirroring `CellRange` in the UI. */
export type CellBlock = { rowStart: number; rowEnd: number; hourStart: number; hourEnd: number };

/** Grid column index (0-based) to the absolute hour stored in the database. */
const toHour = (hourIndex: number) => START_HOUR + hourIndex;
/** And back again. */
const toHourIndex = (hour: number) => hour - START_HOUR;

/** The ISO date each weekday of `weekStartISO` falls on. */
function dateFor(weekStartISO: string, day: DayKey): string {
  return toISODate(datesForWeek(weekStartISO)[day]);
}

function dayOf(weekStartISO: string, dateISO: string): DayKey | undefined {
  const offset = Math.round(
    (fromISODate(dateISO).getTime() - fromISODate(weekStartISO).getTime()) / 86_400_000,
  );
  return DAY_KEYS[offset];
}

/** Postgres errors carry a code; surface something the dashboard can show. */
function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[schedule] ${context}: ${error?.message ?? "unknown error"}`);
}

/* --------------------------------------------------------------------- read */

export type ScheduleBase = {
  rowCount: number;
  employees: Employee[];
  timeOff: TimeOffRequest[];
  recurringTimeOff: RecurringTimeOff[];
};

/** Everything the dashboard needs that isn't tied to one particular week. */
export async function loadScheduleBase(): Promise<ScheduleBase> {
  const db = getDb();

  const [settings, employees, timeOff, recurring] = await Promise.all([
    db.from("schedule_settings").select("row_count").eq("id", true).single(),
    db.from("employees").select("id, name, shift_group").order("name"),
    db
      .from("time_off_requests")
      .select("id, employee_id, start_date, end_date, reason, status, requested_at")
      .order("start_date"),
    db.from("recurring_time_off").select("id, employee_id, day, reason"),
  ]);

  if (settings.error) fail("loading settings", settings.error);
  if (employees.error) fail("loading employees", employees.error);
  if (timeOff.error) fail("loading time off", timeOff.error);
  if (recurring.error) fail("loading recurring time off", recurring.error);

  return {
    rowCount: settings.data.row_count,
    employees: employees.data.map((row) => ({
      id: row.id,
      name: row.name,
      group: row.shift_group,
    })),
    timeOff: timeOff.data.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason,
      status: row.status,
      requestedAt: row.requested_at,
    })),
    recurringTimeOff: recurring.data.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      day: row.day,
      reason: row.reason,
    })),
  };
}

/** One week's grid, shaped exactly like the localStorage doc used to be. */
export async function loadWeek(weekStartISO: string, rowCount: number): Promise<WeekSchedule> {
  const db = getDb();
  const weekEndISO = toISODate(addDays(fromISODate(weekStartISO), 6));

  const { data, error } = await db
    .from("shift_assignments")
    .select("shift_date, row_index, hour, employee_id")
    .gte("shift_date", weekStartISO)
    .lte("shift_date", weekEndISO);

  if (error) fail(`loading week ${weekStartISO}`, error);

  const week = makeEmptyWeek(rowCount);
  for (const row of data) {
    const day = dayOf(weekStartISO, row.shift_date);
    const hourIndex = toHourIndex(row.hour);
    // Rows beyond the current row count (left over from a taller grid) and
    // hours outside the open range are simply not shown.
    if (!day || row.row_index >= rowCount || hourIndex < 0 || hourIndex >= HOURS.length) continue;
    week[day][row.row_index][hourIndex] = row.employee_id;
  }
  return week;
}

/* ---------------------------------------------------------------- employees */

export async function insertEmployee(name: string, group: ShiftGroup): Promise<Employee> {
  const { data, error } = await getDb()
    .from("employees")
    .insert({ name, shift_group: group })
    .select("id, name, shift_group")
    .single();

  if (error) fail("adding an employee", error);
  return { id: data.id, name: data.name, group: data.shift_group };
}

/**
 * Remove someone. Their shifts and time off go with them via `on delete
 * cascade`, so there is no chance of orphaned ids pointing at a deleted person.
 */
export async function deleteEmployee(id: string): Promise<void> {
  const { error } = await getDb().from("employees").delete().eq("id", id);
  if (error) fail("removing an employee", error);
}

/* ----------------------------------------------------------------- settings */

export async function setRowCount(rowCount: number): Promise<void> {
  const db = getDb();
  const { error } = await db
    .from("schedule_settings")
    .update({ row_count: rowCount, updated_at: new Date().toISOString() })
    .eq("id", true);
  if (error) fail("changing the row count", error);

  // Shrinking drops the rows that fall off the bottom, matching what the grid
  // shows. Without this they would reappear if the count were raised again.
  const { error: pruneError } = await db
    .from("shift_assignments")
    .delete()
    .gte("row_index", rowCount);
  if (pruneError) fail("pruning shifts past the new row count", pruneError);
}

/* -------------------------------------------------------------------- grid */

/** Assign every cell in a dragged block, or clear it when `employeeId` is null. */
export async function assignBlock(
  weekStartISO: string,
  day: DayKey,
  block: CellBlock,
  employeeId: string | null,
): Promise<void> {
  const db = getDb();
  const date = dateFor(weekStartISO, day);

  // Clear first either way: assigning replaces whoever was there.
  const { error } = await db
    .from("shift_assignments")
    .delete()
    .eq("shift_date", date)
    .gte("row_index", block.rowStart)
    .lte("row_index", block.rowEnd)
    .gte("hour", toHour(block.hourStart))
    .lte("hour", toHour(block.hourEnd));
  if (error) fail("clearing a block of shifts", error);

  if (!employeeId) return;

  const rows = [];
  for (let rowIndex = block.rowStart; rowIndex <= block.rowEnd; rowIndex++) {
    for (let hourIndex = block.hourStart; hourIndex <= block.hourEnd; hourIndex++) {
      rows.push({
        shift_date: date,
        row_index: rowIndex,
        hour: toHour(hourIndex),
        employee_id: employeeId,
      });
    }
  }

  const { error: insertError } = await db.from("shift_assignments").insert(rows);
  if (insertError) fail("assigning a block of shifts", insertError);
}

/** Replace each target day with a copy of `from`, within the same week. */
export async function copyDayToDays(
  weekStartISO: string,
  from: DayKey,
  targets: DayKey[],
): Promise<void> {
  if (targets.length === 0) return;
  const db = getDb();
  const sourceDate = dateFor(weekStartISO, from);
  const targetDates = targets.map((day) => dateFor(weekStartISO, day));

  const { data, error } = await db
    .from("shift_assignments")
    .select("row_index, hour, employee_id")
    .eq("shift_date", sourceDate);
  if (error) fail("reading the day being copied", error);

  const { error: clearError } = await db
    .from("shift_assignments")
    .delete()
    .in("shift_date", targetDates);
  if (clearError) fail("clearing the days being replaced", clearError);

  if (data.length === 0) return;

  const rows = targetDates.flatMap((date) =>
    data.map((row) => ({ ...row, shift_date: date })),
  );
  const { error: insertError } = await db.from("shift_assignments").insert(rows);
  if (insertError) fail("copying a day", insertError);
}

/** Replace the whole of `toWeekISO` with a copy of `fromWeekISO`. */
export async function copyWeek(fromWeekISO: string, toWeekISO: string): Promise<void> {
  const db = getDb();
  const offsetDays = Math.round(
    (fromISODate(toWeekISO).getTime() - fromISODate(fromWeekISO).getTime()) / 86_400_000,
  );

  const { data, error } = await db
    .from("shift_assignments")
    .select("shift_date, row_index, hour, employee_id")
    .gte("shift_date", fromWeekISO)
    .lte("shift_date", toISODate(addDays(fromISODate(fromWeekISO), 6)));
  if (error) fail("reading the week being copied", error);

  const { error: clearError } = await db
    .from("shift_assignments")
    .delete()
    .gte("shift_date", toWeekISO)
    .lte("shift_date", toISODate(addDays(fromISODate(toWeekISO), 6)));
  if (clearError) fail("clearing the week being replaced", clearError);

  if (data.length === 0) return;

  const rows = data.map((row) => ({
    shift_date: toISODate(addDays(fromISODate(row.shift_date), offsetDays)),
    row_index: row.row_index,
    hour: row.hour,
    employee_id: row.employee_id,
  }));
  const { error: insertError } = await db.from("shift_assignments").insert(rows);
  if (insertError) fail("copying a week", insertError);
}

/* ---------------------------------------------------------------- time off */

export async function insertTimeOff(input: {
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<TimeOffRequest> {
  const { data, error } = await getDb()
    .from("time_off_requests")
    .insert({
      employee_id: input.employeeId,
      start_date: input.startDate,
      end_date: input.endDate,
      reason: input.reason,
    })
    .select("id, employee_id, start_date, end_date, reason, status, requested_at")
    .single();

  if (error) fail("adding a time off request", error);
  return {
    id: data.id,
    employeeId: data.employee_id,
    startDate: data.start_date,
    endDate: data.end_date,
    reason: data.reason,
    status: data.status,
    requestedAt: data.requested_at,
  };
}

export async function updateTimeOffStatus(id: string, status: TimeOffStatus): Promise<void> {
  const { error } = await getDb().from("time_off_requests").update({ status }).eq("id", id);
  if (error) fail("updating a request", error);
}

export async function deleteTimeOff(id: string): Promise<void> {
  const { error } = await getDb().from("time_off_requests").delete().eq("id", id);
  if (error) fail("deleting a request", error);
}

/**
 * Add a standing weekly conflict. One row per person per weekday, so re-adding
 * a day someone already has just updates the reason instead of erroring.
 */
export async function upsertRecurringTimeOff(input: {
  employeeId: string;
  day: DayKey;
  reason: string;
}): Promise<RecurringTimeOff> {
  const { data, error } = await getDb()
    .from("recurring_time_off")
    .upsert(
      { employee_id: input.employeeId, day: input.day, reason: input.reason },
      { onConflict: "employee_id,day" },
    )
    .select("id, employee_id, day, reason")
    .single();

  if (error) fail("adding recurring time off", error);
  return { id: data.id, employeeId: data.employee_id, day: data.day, reason: data.reason };
}

export async function deleteRecurringTimeOff(id: string): Promise<void> {
  const { error } = await getDb().from("recurring_time_off").delete().eq("id", id);
  if (error) fail("removing recurring time off", error);
}
