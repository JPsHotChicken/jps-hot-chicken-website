import { siteConfig, type DayHours } from "@/data/site";

export const DAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

// Maps JS Date.getDay() (0 = Sunday) to our DayKey.
const JS_DAY_TO_KEY: Record<number, DayKey> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

/** Convert a 24h "HH:MM" string to a 12h label, e.g. "21:00" -> "9:00 PM". */
export function formatTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const hour = Number(hStr);
  const minute = Number(mStr);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minutes = minute === 0 ? "" : `:${mStr}`;
  return `${hour12}${minutes} ${period}`;
}

/** Human-readable hours for a single day, e.g. "11:00 AM – 9:00 PM" or "Closed". */
export function formatDayHours(day: DayHours): string {
  if (!day) return "Closed";
  return `${formatTime(day.open)} – ${formatTime(day.close)}`;
}

/** The DayKey for today (uses the visitor's local date). */
export function getTodayKey(date: Date = new Date()): DayKey {
  return JS_DAY_TO_KEY[date.getDay()];
}

/** Today's hours, as a { open, close } object or null when closed. */
export function getTodayHours(date: Date = new Date()): DayHours {
  return siteConfig.hours[getTodayKey(date)];
}

export type WeekRow = { key: DayKey; label: string; hours: string; isToday: boolean };

/** The full week as display rows, Monday-first, with today flagged. */
export function getWeekRows(date: Date = new Date()): WeekRow[] {
  const todayKey = getTodayKey(date);
  return DAY_KEYS.map((key) => ({
    key,
    label: DAY_LABELS[key],
    hours: formatDayHours(siteConfig.hours[key]),
    isToday: key === todayKey,
  }));
}
