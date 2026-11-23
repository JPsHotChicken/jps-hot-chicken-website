/**
 * Attendance tracker: shared types and formatting, safe for the browser.
 *
 * An entry is a local wall-clock date and time at the store — not an instant —
 * so both are kept as plain strings ("2026-11-23", "16:30") and never pass
 * through `Date`, which would shift them by the viewer's time zone.
 */

export type AttendanceEntry = {
  id: string;
  /** Null once the person has been removed from the roster. */
  employeeId: string | null;
  /** The name as it was when the entry was made. */
  employeeName: string;
  date: string;
  /** "HH:MM", 24-hour. */
  time: string;
  reason: string;
  createdAt: string;
};

export type AttendanceDraft = {
  employeeId: string;
  date: string;
  time: string;
  reason: string;
};

export type AttendanceEmployee = { id: string; name: string; active: boolean };

/** Offered as suggestions; any other reason can still be typed. */
export const COMMON_REASONS = [
  "Late",
  "Called out",
  "Called out sick",
  "No call, no show",
  "Left early",
  "Missed punch",
  "Extended break",
];

export const MAX_REASON = 500;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-11-23" -> "Mon, Nov 23, 2026" */
export function formatEntryDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  // UTC on both ends so the weekday can't slip a day in any time zone.
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "16:30" -> "4:30 PM" */
export function formatEntryTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Newest first. */
export function compareEntries(a: AttendanceEntry, b: AttendanceEntry): number {
  return (
    b.date.localeCompare(a.date) ||
    b.time.localeCompare(a.time) ||
    b.createdAt.localeCompare(a.createdAt)
  );
}

/** Entries inside an inclusive date range; either end may be left open. */
export function inRange(entry: AttendanceEntry, from: string, to: string): boolean {
  return (!from || entry.date >= from) && (!to || entry.date <= to);
}

/** The key an entry is grouped under for export: the live person, or the stored name. */
export const personKey = (entry: { employeeId: string | null; employeeName: string }) =>
  entry.employeeId ?? `name:${entry.employeeName}`;

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "staff";
}

/** `attendance-jordan-2026-01-01-to-2026-11-23.pdf` */
export function attendanceFilename(name: string, from: string, to: string, ext: "pdf" | "csv") {
  const range = from || to ? `-${from || "start"}-to-${to || "today"}` : "";
  return `attendance-${slug(name)}${range}.${ext}`;
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function attendanceCsv(entries: AttendanceEntry[]): string {
  const rows = [
    ["Employee", "Date", "Time", "Reason"],
    ...entries.map((e) => [e.employeeName, e.date, formatEntryTime(e.time), e.reason]),
  ];
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}
