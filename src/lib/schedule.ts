import { DAY_KEYS, DAY_LABELS, type DayKey } from "@/lib/hours";

export { DAY_KEYS, DAY_LABELS };
export type { DayKey };

/* ---------------------------------------------------------------- employees */

export const SHIFT_GROUPS = ["morning", "night", "other"] as const;
export type ShiftGroup = (typeof SHIFT_GROUPS)[number];

export const SHIFT_GROUP_LABELS: Record<ShiftGroup, string> = {
  morning: "Morning shift",
  night: "Night shift",
  other: "Other",
};

export type Employee = {
  id: string;
  name: string;
  group: ShiftGroup;
  /**
   * The four digit code this person signs in with at `/staff`. Only ever loaded
   * for the owner's dashboard — the staff side never receives anyone's code but
   * their own, and it is absent everywhere else.
   */
  loginCode?: string | null;
};

/* ----------------------------------------------------------------- time off */

export const TIME_OFF_STATUSES = ["pending", "approved", "denied"] as const;
export type TimeOffStatus = (typeof TIME_OFF_STATUSES)[number];

/**
 * The stored values stay `pending` / `approved` / `denied`; these are what both
 * the owner and staff read, so the two sides never describe the same request
 * with different words.
 */
export const TIME_OFF_STATUS_LABELS: Record<TimeOffStatus, string> = {
  pending: "In review",
  approved: "Accepted",
  denied: "Declined",
};

/** A one-off request to be away. `startDate`–`endDate` are inclusive ISO dates. */
export type TimeOffRequest = {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: TimeOffStatus;
  /** ISO date the request was entered, so the list can order by age. */
  requestedAt: string;
};

/**
 * A standing weekly conflict — "never schedule me on Tuesdays". Unlike a
 * request there is nothing to approve: it is already a fact about the week.
 */
export type RecurringTimeOff = {
  id: string;
  employeeId: string;
  day: DayKey;
  reason: string;
};

/** True when `dateISO` falls inside the request. ISO dates sort chronologically. */
export function coversDate(request: TimeOffRequest, dateISO: string): boolean {
  return request.startDate <= dateISO && dateISO <= request.endDate;
}

/** True when the request touches any day of the week starting `weekStartISO`. */
export function coversWeek(request: TimeOffRequest, weekStartISO: string): boolean {
  const weekEndISO = toISODate(addDays(fromISODate(weekStartISO), 6));
  // Two inclusive ranges overlap unless one ends before the other begins.
  return request.startDate <= weekEndISO && weekStartISO <= request.endDate;
}

/**
 * Whole days covered, counting both ends — a single-day request is 1. Takes just
 * the dates so it also works for a range being picked but not yet filed.
 */
export function requestDayCount(request: Pick<TimeOffRequest, "startDate" | "endDate">): number {
  const start = fromISODate(request.startDate);
  const end = fromISODate(request.endDate);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Math.max(1, days);
}

/**
 * Pending first (they are the ones still waiting on an answer), then by start
 * date, so the next thing to deal with is always at the top.
 */
export function compareTimeOff(a: TimeOffRequest, b: TimeOffRequest): number {
  if (a.status !== b.status) {
    if (a.status === "pending") return -1;
    if (b.status === "pending") return 1;
  }
  return a.startDate.localeCompare(b.startDate);
}

/* -------------------------------------------------------------------- hours */

/** First hour block on the grid (8 AM). */
export const START_HOUR = 8;
/** Closing time (10 PM) — the last block is 9–10 PM, so it is exclusive. */
export const END_HOUR = 22;

/** The hour each column represents: [8, 9, … 21]. */
export const HOURS: number[] = Array.from(
  { length: END_HOUR - START_HOUR },
  (_, i) => START_HOUR + i,
);

/** Days the store is closed — everyone is automatically off. */
export const CLOSED_DAYS: readonly DayKey[] = ["sunday"];

export function isClosedDay(day: DayKey): boolean {
  return CLOSED_DAYS.includes(day);
}

function to12Hour(hour: number): number {
  return hour % 12 === 0 ? 12 : hour % 12;
}

/**
 * "10–11 AM" — the whole hour a column covers, so the last cell you fill
 * clearly includes that hour rather than reading like an end time.
 */
export function formatHourBlock(hour: number): string {
  const end = hour + 1;
  const startPeriod = hour >= 12 ? "PM" : "AM";
  const endPeriod = end >= 12 ? "PM" : "AM";
  // The block that straddles noon (11–12) drops the period rather than
  // claiming AM or PM for a range that is both.
  return startPeriod === endPeriod
    ? `${to12Hour(hour)}–${to12Hour(end)} ${startPeriod}`
    : `${to12Hour(hour)}–${to12Hour(end)}`;
}

/** "8:00 AM" — used in the per-employee shift lists. */
export function formatHourLong(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  return `${to12Hour(hour)}:00 ${period}`;
}

/* ------------------------------------------------------------------ the grid */

/** A day's assignments: `day[rowIndex][hourIndex]` is an employee id or null. */
export type DaySchedule = (string | null)[][];
export type WeekSchedule = Record<DayKey, DaySchedule>;

/**
 * Rows (concurrent positions) shown per day. The starting value lives in the
 * database as the default on `schedule_settings.row_count`; these bounds are
 * enforced both here and by a check constraint on that column.
 */
export const MIN_ROW_COUNT = 1;
export const MAX_ROW_COUNT = 20;

export function makeEmptyDay(rowCount: number): DaySchedule {
  return Array.from({ length: rowCount }, () => Array.from({ length: HOURS.length }, () => null));
}

export function makeEmptyWeek(rowCount: number): WeekSchedule {
  return Object.fromEntries(DAY_KEYS.map((day) => [day, makeEmptyDay(rowCount)])) as WeekSchedule;
}

/**
 * Grow or shrink a week to `rowCount` rows, keeping existing assignments.
 * Rows past the new count fall off, matching what the database prunes.
 */
export function resizeWeek(week: WeekSchedule, rowCount: number): WeekSchedule {
  return Object.fromEntries(
    DAY_KEYS.map((day) => {
      const existing = week[day] ?? [];
      const rows = Array.from({ length: rowCount }, (_, rowIndex) => {
        const row = existing[rowIndex] ?? [];
        return Array.from({ length: HOURS.length }, (_, hourIndex) => row[hourIndex] ?? null);
      });
      return [day, rows];
    }),
  ) as WeekSchedule;
}


/* -------------------------------------------------------------------- dates */

/** Local-time ISO date (`YYYY-MM-DD`) — avoids the UTC shift `toISOString` causes. */
export function toISODate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Parse `YYYY-MM-DD` as a local date (not UTC midnight). */
export function fromISODate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** The Monday on or before `date`. Weeks in this tool run Monday → Sunday. */
export function mondayOf(date: Date = new Date()): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay(): 0 = Sunday, so Sunday belongs to the week that started 6 days ago.
  const offset = (result.getDay() + 6) % 7;
  return addDays(result, -offset);
}

/** The calendar date each day of the week falls on, given that week's Monday. */
export function datesForWeek(weekStartISO: string): Record<DayKey, Date> {
  const monday = fromISODate(weekStartISO);
  return Object.fromEntries(
    DAY_KEYS.map((day, index) => [day, addDays(monday, index)]),
  ) as Record<DayKey, Date>;
}

/** "Aug 3" */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Aug 3 – Aug 9, 2026" */
export function formatWeekRange(weekStartISO: string): string {
  const monday = fromISODate(weekStartISO);
  const sunday = addDays(monday, 6);
  const sameYear = monday.getFullYear() === sunday.getFullYear();
  const start = formatShortDate(monday);
  const end = formatShortDate(sunday);
  return sameYear
    ? `${start} – ${end}, ${sunday.getFullYear()}`
    : `${start}, ${monday.getFullYear()} – ${end}, ${sunday.getFullYear()}`;
}

/** "Aug 3, 2026", or "Aug 3 – Aug 5, 2026" when the two dates differ. */
export function formatDateRange(startISO: string, endISO: string): string {
  const start = fromISODate(startISO);
  const end = fromISODate(endISO);
  if (startISO === endISO) return `${formatShortDate(start)}, ${start.getFullYear()}`;
  return start.getFullYear() === end.getFullYear()
    ? `${formatShortDate(start)} – ${formatShortDate(end)}, ${end.getFullYear()}`
    : `${formatShortDate(start)}, ${start.getFullYear()} – ` +
        `${formatShortDate(end)}, ${end.getFullYear()}`;
}

/* ------------------------------------------------------------------- shifts */

/** A run of consecutive hours an employee is on. `end` is exclusive. */
export type ShiftRange = { start: number; end: number };

/**
 * The hours an employee works on a day, collapsed into contiguous ranges.
 * Someone scheduled 8–11 and again 14–16 gets two ranges. Rows are merged, so
 * the same person in two rows for one hour still counts as that single hour.
 */
export function shiftsForDay(day: DaySchedule, employeeId: string): ShiftRange[] {
  const worked = HOURS.map((_, hourIndex) =>
    day.some((row) => row[hourIndex] === employeeId),
  );

  const ranges: ShiftRange[] = [];
  let runStart: number | null = null;

  worked.forEach((isWorking, hourIndex) => {
    if (isWorking && runStart === null) runStart = hourIndex;
    if (!isWorking && runStart !== null) {
      ranges.push({ start: HOURS[runStart], end: HOURS[hourIndex] });
      runStart = null;
    }
  });
  if (runStart !== null) ranges.push({ start: HOURS[runStart], end: END_HOUR });

  return ranges;
}

export function rangeHours(ranges: ShiftRange[]): number {
  return ranges.reduce((total, range) => total + (range.end - range.start), 0);
}

/**
 * Working the 8–9 PM hour means closing: the grid stops at a clean hour, but
 * shutting down runs past it, so these shifts are flagged on the printed sheet.
 */
export const CLOSING_HOUR = 20;

/** True when the person is on for the 8–9 PM hour, i.e. they close that day. */
export function isClosingShift(ranges: ShiftRange[]): boolean {
  return ranges.some((range) => range.start <= CLOSING_HOUR && range.end > CLOSING_HOUR);
}

/** "8:00 AM – 2:00 PM" */
export function formatRange(range: ShiftRange): string {
  return `${formatHourLong(range.start)} – ${formatHourLong(range.end)}`;
}

/** Every day's shifts for one employee, plus the week total. */
export function employeeWeek(week: WeekSchedule, employeeId: string) {
  const days = DAY_KEYS.map((day) => ({
    day,
    label: DAY_LABELS[day],
    closed: isClosedDay(day),
    ranges: isClosedDay(day) ? [] : shiftsForDay(week[day] ?? [], employeeId),
  }));
  const totalHours = days.reduce((total, entry) => total + rangeHours(entry.ranges), 0);
  return { days, totalHours };
}

/** Sort helper: group order first (morning → night → other), then name. */
export function compareEmployees(a: Employee, b: Employee): number {
  const groupDelta = SHIFT_GROUPS.indexOf(a.group) - SHIFT_GROUPS.indexOf(b.group);
  return groupDelta !== 0 ? groupDelta : a.name.localeCompare(b.name);
}

export function employeesByGroup(employees: Employee[]): Record<ShiftGroup, Employee[]> {
  return Object.fromEntries(
    SHIFT_GROUPS.map((group) => [
      group,
      employees.filter((e) => e.group === group).sort((a, b) => a.name.localeCompare(b.name)),
    ]),
  ) as Record<ShiftGroup, Employee[]>;
}
