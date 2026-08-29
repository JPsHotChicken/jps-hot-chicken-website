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

/**
 * A request the owner has deleted. Deleting keeps the row and stamps the moment
 * it went, so a delete can be looked at again and undone rather than being the
 * one action in the panel with no way back.
 */
export type DeletedTimeOffRequest = TimeOffRequest & { deletedAt: string };

/** Most recently deleted first: an undo is nearly always of the last delete. */
export function compareDeletedTimeOff(
  a: DeletedTimeOffRequest,
  b: DeletedTimeOffRequest,
): number {
  return b.deletedAt.localeCompare(a.deletedAt);
}

/**
 * What keeps somebody off a given day. `approved` and `pending` come from a
 * request; `recurring` is a standing weekly conflict, which was never a request
 * and so has nothing to approve.
 */
export type DayOffKind = "approved" | "recurring" | "pending";

export type DayOff = {
  employee: Employee;
  kind: DayOffKind;
  /** Why they are away, when they gave a reason. */
  reason: string;
};

/** Firmest answer first: two accepted days are worth seeing before a maybe. */
const DAY_OFF_ORDER: DayOffKind[] = ["approved", "recurring", "pending"];

/**
 * Everybody who is off on one day, so the day can say so while it is being
 * filled in.
 *
 * Declined requests are left out — a declined request means they are working.
 * Somebody covered twice over (a request on a day they are always off, say) is
 * listed once, under whichever answer is the firmer of the two.
 */
export function offOnDay(
  employees: Employee[],
  requests: TimeOffRequest[],
  recurring: RecurringTimeOff[],
  day: DayKey,
  dateISO: string,
): DayOff[] {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const found = new Map<string, DayOff>();

  const add = (employeeId: string, kind: DayOffKind, reason: string) => {
    const employee = employeeById.get(employeeId);
    // Time off outliving the person it belongs to is a moment mid-delete, not a
    // state worth drawing a badge for.
    if (!employee) return;
    const existing = found.get(employeeId);
    if (existing && DAY_OFF_ORDER.indexOf(existing.kind) <= DAY_OFF_ORDER.indexOf(kind)) return;
    found.set(employeeId, { employee, kind, reason });
  };

  for (const request of requests) {
    if (request.status === "denied" || !coversDate(request, dateISO)) continue;
    add(request.employeeId, request.status, request.reason);
  }
  for (const entry of recurring) {
    if (entry.day === day) add(entry.employeeId, "recurring", entry.reason);
  }

  return [...found.values()].sort(
    (a, b) =>
      DAY_OFF_ORDER.indexOf(a.kind) - DAY_OFF_ORDER.indexOf(b.kind) ||
      a.employee.name.localeCompare(b.employee.name),
  );
}

/* -------------------------------------------------------------------- hours */

/** First hour block on the grid (8 AM). */
export const START_HOUR = 8;
/** Closing time (10 PM) — the last block is 9–10 PM, so it is exclusive. */
export const END_HOUR = 22;

/** The hour each header column represents: [8, 9, … 21]. */
export const HOURS: number[] = Array.from(
  { length: END_HOUR - START_HOUR },
  (_, i) => START_HOUR + i,
);

/** Minutes past midnight the grid opens and closes at. */
export const OPEN_MINUTE = START_HOUR * 60;
export const CLOSE_MINUTE = END_HOUR * 60;

/**
 * How long one grid cell is. Shifts start on the hour or the half hour, so each
 * hour on the grid is split into two cells and somebody coming in at 10:30 gets
 * the right-hand half of the 10–11 column.
 */
export const SLOT_MINUTES = 30;
export const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;

/** Minutes past midnight for each half-hour cell: [480, 510, … 1290]. */
export const SLOTS: number[] = Array.from(
  { length: HOURS.length * SLOTS_PER_HOUR },
  (_, i) => OPEN_MINUTE + i * SLOT_MINUTES,
);

export const SLOT_COUNT = SLOTS.length;

/** Minutes past midnight a cell starts at. */
export function slotMinute(slotIndex: number): number {
  return OPEN_MINUTE + slotIndex * SLOT_MINUTES;
}

/** And back again — may be outside `0 … SLOT_COUNT`, so callers check. */
export function minuteSlot(minute: number): number {
  return (minute - OPEN_MINUTE) / SLOT_MINUTES;
}

/** Days the store is closed — everyone is automatically off. */
export const CLOSED_DAYS: readonly DayKey[] = ["sunday"];

export function isClosedDay(day: DayKey): boolean {
  return CLOSED_DAYS.includes(day);
}

function to12Hour(hour: number): number {
  return hour % 12 === 0 ? 12 : hour % 12;
}

function periodOf(minute: number): "AM" | "PM" {
  return Math.floor(minute / 60) >= 12 ? "PM" : "AM";
}

/** "8:30" — the clock face, without the period. */
function clockOf(minute: number): string {
  const hour = to12Hour(Math.floor(minute / 60));
  return `${hour}:${String(minute % 60).padStart(2, "0")}`;
}

/** "8:30 AM" — used in the per-employee shift lists. */
export function formatMinute(minute: number): string {
  return `${clockOf(minute)} ${periodOf(minute)}`;
}

/**
 * "10:00–10:30 AM" — a span within one half of the day drops the repeated
 * period, and one that straddles noon spells both out: "11:30 AM–12:00 PM".
 */
export function formatMinuteRange(start: number, end: number): string {
  const startPeriod = periodOf(start);
  const endPeriod = periodOf(end);
  return startPeriod === endPeriod
    ? `${clockOf(start)}–${clockOf(end)} ${startPeriod}`
    : `${clockOf(start)} ${startPeriod}–${clockOf(end)} ${endPeriod}`;
}

/**
 * "10–11 AM" — the whole hour a header column covers, so the last cell you fill
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

/** "10:00–10:30 AM" — the half hour one cell covers. */
export function formatSlotBlock(slotIndex: number): string {
  const start = slotMinute(slotIndex);
  return formatMinuteRange(start, start + SLOT_MINUTES);
}

/** "6" or "6.5" — hours read better without a trailing `.0`. */
export function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/* ---------------------------------------------------------------- positions */

/**
 * The stations a day is divided into, and how many people can be on each one at
 * the same time. Every day has the same shape, so a row means the same job on
 * Monday as it does on Saturday.
 */
export const POSITION_GROUPS = [
  { key: "front", label: "Front of house", seats: 2 },
  { key: "expo", label: "Expo", seats: 1 },
  { key: "sides", label: "Sides fryer", seats: 1 },
  { key: "line", label: "Line", seats: 5 },
  { key: "fryer", label: "Fryer", seats: 2 },
  { key: "prep", label: "Back prep", seats: 2 },
  { key: "cleaning", label: "Cleaning", seats: 1 },
] as const;

export type PositionKey = (typeof POSITION_GROUPS)[number]["key"];

export type PositionRow = {
  key: PositionKey;
  /** The station this row belongs to — "Line". */
  group: string;
  /** "Line 3" where a station has several spots, plain "Expo" where it has one. */
  label: string;
  /** 1-based spot within the station. */
  seat: number;
  /** True for the first spot on a station, which is where its heading goes. */
  firstOfGroup: boolean;
};

/** One entry per grid row, in the order the rows are drawn. */
export const POSITION_ROWS: PositionRow[] = POSITION_GROUPS.flatMap((group) =>
  Array.from({ length: group.seats }, (_, index) => ({
    key: group.key,
    group: group.label,
    label: group.seats === 1 ? group.label : `${group.label} ${index + 1}`,
    seat: index + 1,
    firstOfGroup: index === 0,
  })),
);

/** The grid is exactly as tall as the stations need — no more, no fewer. */
export const ROW_COUNT = POSITION_ROWS.length;

/** "Line 3", or "Row 15" for a stray row left over from an older layout. */
export function positionLabel(rowIndex: number): string {
  return POSITION_ROWS[rowIndex]?.label ?? `Row ${rowIndex + 1}`;
}

/* ------------------------------------------------------------------ the grid */

/** A day's assignments: `day[rowIndex][slotIndex]` is an employee id or null. */
export type DaySchedule = (string | null)[][];
export type WeekSchedule = Record<DayKey, DaySchedule>;

export function makeEmptyDay(): DaySchedule {
  return POSITION_ROWS.map(() => SLOTS.map(() => null));
}

export function makeEmptyWeek(): WeekSchedule {
  return Object.fromEntries(DAY_KEYS.map((day) => [day, makeEmptyDay()])) as WeekSchedule;
}

/* ----------------------------------------------------------------- coverage */

/**
 * How many people are on for each half hour of a day, by column. Someone
 * filling two positions in the same half hour counts once, the same way
 * `shiftsForDay` merges rows — the number answers "how many people are here",
 * not "how many cells are full".
 */
export function coverageBySlot(day: DaySchedule): number[] {
  return SLOTS.map((_, slotIndex) => {
    const people = new Set<string>();
    for (const row of day) {
      const employeeId = row?.[slotIndex];
      if (employeeId) people.add(employeeId);
    }
    return people.size;
  });
}

/**
 * The busiest half hour anywhere in the week. The heat map scales against this
 * so a shade means the same thing on every day, rather than each day being read
 * against its own quietest and busiest stretch.
 */
export function peakCoverage(week: WeekSchedule): number {
  return DAY_KEYS.reduce((peak, day) => {
    if (isClosedDay(day)) return peak;
    return Math.max(peak, ...coverageBySlot(week[day] ?? []));
  }, 0);
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

/**
 * A run of consecutive time an employee is on, in minutes past midnight.
 * `end` is exclusive, and both ends land on an hour or a half hour.
 */
export type ShiftRange = { start: number; end: number };

/**
 * The time an employee works on a day, collapsed into contiguous ranges.
 * Someone scheduled 8–11 and again 2–4 gets two ranges. Positions are merged,
 * so the same person on two stations for one half hour still counts once.
 */
export function shiftsForDay(day: DaySchedule, employeeId: string): ShiftRange[] {
  const worked = SLOTS.map((_, slotIndex) =>
    day.some((row) => row[slotIndex] === employeeId),
  );

  const ranges: ShiftRange[] = [];
  let runStart: number | null = null;

  worked.forEach((isWorking, slotIndex) => {
    if (isWorking && runStart === null) runStart = slotIndex;
    if (!isWorking && runStart !== null) {
      ranges.push({ start: SLOTS[runStart], end: SLOTS[slotIndex] });
      runStart = null;
    }
  });
  if (runStart !== null) ranges.push({ start: SLOTS[runStart], end: CLOSE_MINUTE });

  return ranges;
}

/** Total time covered by a set of ranges, in hours — 6.5 for a half-hour start. */
export function rangeHours(ranges: ShiftRange[]): number {
  return ranges.reduce((total, range) => total + (range.end - range.start), 0) / 60;
}

/**
 * Anybody still on after 8 PM is closing: the grid stops at 10, but shutting
 * down runs past it, so these shifts are flagged on the printed sheet.
 */
export const CLOSING_MINUTE = 20 * 60;

/** True when any part of the shift falls after 8 PM, i.e. they close that day. */
export function isClosingShift(ranges: ShiftRange[]): boolean {
  return ranges.some((range) => range.start < CLOSE_MINUTE && range.end > CLOSING_MINUTE);
}

/** "8:00 AM – 2:30 PM" */
export function formatRange(range: ShiftRange): string {
  return `${formatMinute(range.start)} – ${formatMinute(range.end)}`;
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
