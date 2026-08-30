import "server-only";

import { getDb } from "@/lib/supabase/server";
import {
  DAY_KEYS,
  ROW_COUNT,
  SLOT_COUNT,
  addDays,
  compareDeletedTimeOff,
  datesForWeek,
  fromISODate,
  makeEmptyWeek,
  minuteSlot,
  slotMinute,
  toISODate,
  type DayKey,
  type DeletedTimeOffRequest,
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
 * The grid is stored one row per filled half-hour cell keyed by real calendar
 * date, while the UI thinks in (week, weekday, rowIndex, slotIndex). Translating
 * between the two is this module's job — nothing above it needs to know the
 * table shape. `start_minute` is minutes past midnight, so 480 is 8:00 AM and
 * 510 is the 8:30 half.
 */

/** Inclusive rectangle of grid cells, mirroring `CellRange` in the UI. */
export type CellBlock = { rowStart: number; rowEnd: number; slotStart: number; slotEnd: number };

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
  employees: Employee[];
  timeOff: TimeOffRequest[];
  /** Requests the owner deleted, newest delete first, so one can be put back. */
  deletedTimeOff: DeletedTimeOffRequest[];
  recurringTimeOff: RecurringTimeOff[];
};

/** Everything the dashboard needs that isn't tied to one particular week. */
export async function loadScheduleBase(): Promise<ScheduleBase> {
  const db = getDb();

  const [employees, timeOff, recurring] = await Promise.all([
    db
      .from("employees")
      .select("id, name, shift_group, setup_code, staff_password, password_set_at")
      .order("name"),
    // Deleted requests come back too — deleting is reversible, so the panel has
    // to be able to show what was thrown away.
    db
      .from("time_off_requests")
      .select("id, employee_id, start_date, end_date, reason, status, requested_at, deleted_at")
      .order("start_date"),
    db.from("recurring_time_off").select("id, employee_id, day, reason"),
  ]);

  if (employees.error) fail("loading employees", employees.error);
  if (timeOff.error) fail("loading time off", timeOff.error);
  if (recurring.error) fail("loading recurring time off", recurring.error);

  // One query, split in two: a deleted request is the same row with a stamp on
  // it, and the panel needs both piles.
  const active: TimeOffRequest[] = [];
  const deleted: DeletedTimeOffRequest[] = [];
  for (const row of timeOff.data) {
    const request: TimeOffRequest = {
      id: row.id,
      employeeId: row.employee_id,
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason,
      status: row.status,
      requestedAt: row.requested_at,
    };
    if (row.deleted_at === null) active.push(request);
    else deleted.push({ ...request, deletedAt: row.deleted_at });
  }
  deleted.sort(compareDeletedTimeOff);

  return {
    employees: employees.data.map((row) => ({
      id: row.id,
      name: row.name,
      group: row.shift_group,
      setupCode: row.setup_code,
      password: row.staff_password,
      passwordSetAt: row.password_set_at,
    })),
    timeOff: active,
    deletedTimeOff: deleted,
    recurringTimeOff: recurring.data.map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      day: row.day,
      reason: row.reason,
    })),
  };
}

/** One week's grid, one entry per position row and half-hour cell. */
export async function loadWeek(weekStartISO: string): Promise<WeekSchedule> {
  const db = getDb();
  const weekEndISO = toISODate(addDays(fromISODate(weekStartISO), 6));

  const { data, error } = await db
    .from("shift_assignments")
    .select("shift_date, row_index, start_minute, employee_id")
    .gte("shift_date", weekStartISO)
    .lte("shift_date", weekEndISO);

  if (error) fail(`loading week ${weekStartISO}`, error);

  const week = makeEmptyWeek();
  for (const row of data) {
    const day = dayOf(weekStartISO, row.shift_date);
    const slotIndex = minuteSlot(row.start_minute);
    // Rows past the last position (left over from an older, taller grid) and
    // times outside the open hours are simply not shown.
    if (!day || row.row_index >= ROW_COUNT || slotIndex < 0 || slotIndex >= SLOT_COUNT) continue;
    week[day][row.row_index][slotIndex] = row.employee_id;
  }
  return week;
}

/* ---------------------------------------------------------------- employees */

export async function insertEmployee(
  name: string,
  group: ShiftGroup,
  setupCode: string | null,
): Promise<Employee> {
  const { data, error } = await getDb()
    .from("employees")
    .insert({ name, shift_group: group, setup_code: setupCode })
    .select("id, name, shift_group, setup_code, staff_password, password_set_at")
    .single();

  if (error) fail("adding an employee", error);
  return {
    id: data.id,
    name: data.name,
    group: data.shift_group,
    setupCode: data.setup_code,
    password: data.staff_password,
    passwordSetAt: data.password_set_at,
  };
}

/**
 * Remove someone. Their shifts and time off go with them via `on delete
 * cascade`, so there is no chance of orphaned ids pointing at a deleted person.
 */
export async function deleteEmployee(id: string): Promise<void> {
  const { error } = await getDb().from("employees").delete().eq("id", id);
  if (error) fail("removing an employee", error);
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
    .gte("start_minute", slotMinute(block.slotStart))
    .lte("start_minute", slotMinute(block.slotEnd));
  if (error) fail("clearing a block of shifts", error);

  if (!employeeId) return;

  const rows = [];
  for (let rowIndex = block.rowStart; rowIndex <= block.rowEnd; rowIndex++) {
    for (let slotIndex = block.slotStart; slotIndex <= block.slotEnd; slotIndex++) {
      rows.push({
        shift_date: date,
        row_index: rowIndex,
        start_minute: slotMinute(slotIndex),
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
    .select("row_index, start_minute, employee_id")
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
    .select("shift_date, row_index, start_minute, employee_id")
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
    start_minute: row.start_minute,
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

/**
 * Delete a request — softly. The row stays with `deleted_at` set, which keeps it
 * out of every list that matters (the owner's panel, the day badges, the staff
 * member's own view) while leaving it there to be put back. Nothing prunes these
 * yet; a handful of dead rows is cheaper than a delete that can't be undone.
 */
export async function deleteTimeOff(id: string): Promise<string> {
  const deletedAt = new Date().toISOString();
  const { error } = await getDb()
    .from("time_off_requests")
    .update({ deleted_at: deletedAt })
    .eq("id", id);
  if (error) fail("deleting a request", error);
  return deletedAt;
}

/** Undo a delete, putting the request back exactly as it was. */
export async function restoreTimeOff(id: string): Promise<void> {
  const { error } = await getDb()
    .from("time_off_requests")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) fail("restoring a request", error);
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
