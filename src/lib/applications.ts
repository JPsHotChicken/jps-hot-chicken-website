import { fromISODate, toISODate } from "@/lib/schedule";
import { toCsv } from "@/lib/csv";

/**
 * Types and the arithmetic behind the Applications page — no database, no React,
 * so both sides of the page and the tests can use them.
 *
 * Three things live on that page and they barely touch: applications arrive on
 * their own and are only ever read, interviews are typed in by hand, and the
 * text pieces are a notebook. What they share is this file's date and phone
 * formatting, which is the only reason they are described together.
 */

/* --------------------------------------------------------------- applications */

export const APPLICATION_STATUSES = [
  "new",
  "contacted",
  "interview",
  "hired",
  "passed",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "New",
  contacted: "Contacted",
  interview: "Interview set",
  hired: "Hired",
  passed: "Passed",
};

/** Pill colours, in the same order the statuses move through. */
export const STATUS_STYLES: Record<ApplicationStatus, string> = {
  new: "bg-brand/10 text-brand",
  contacted: "bg-amber-100 text-amber-800",
  interview: "bg-indigo-100 text-indigo-800",
  hired: "bg-emerald-100 text-emerald-800",
  passed: "bg-muted text-muted-foreground",
};

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value);
}

/**
 * One application, exactly as it was submitted, plus the two fields the owner
 * owns. Everything the applicant typed is a string — the form asks most of its
 * questions as a choice between words ("Yes", "16–17", "Weekends"), and storing
 * those as anything else would only invent a translation to get wrong.
 */
export type Application = {
  id: string;
  submittedAt: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  age: string;
  workAuthorized: string;
  position: string;
  location: string;
  availability: string;
  employmentType: string;
  foodService: string;
  experience: string;
  transportation: string;
  /** Where the owner has got to with them. */
  status: ApplicationStatus;
  /** The owner's own note — not something the applicant wrote. */
  note: string;
};

/** What the apply route hands over. Status and note start empty. */
export type ApplicationDraft = Omit<Application, "id" | "submittedAt" | "status" | "note">;

export function applicantName(application: Application): string {
  const name = `${application.firstName} ${application.lastName}`.trim();
  return name || "(no name given)";
}

/* ---------------------------------------------------------------- interviews */

export type Interview = {
  id: string;
  /** The application it was booked from, when it was booked from one. */
  applicationId: string | null;
  name: string;
  phone: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** 24-hour `HH:MM`, or empty when a time hasn't been settled on yet. */
  time: string;
  note: string;
};

export type InterviewDraft = Omit<Interview, "id">;

/** The shape of a time an `<input type="time">` will accept back. */
export const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function isValidTime(value: string): boolean {
  return value === "" || TIME_PATTERN.test(value);
}

/**
 * Sort by when the interview is, soonest first. An interview with no time yet
 * sits at the top of its day, where it is a visible loose end rather than
 * something buried under the times that are settled.
 */
export function compareInterviews(a: Interview, b: Interview): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/**
 * Split the list either side of today.
 *
 * Today's interviews count as upcoming for the whole day — one at 10am is still
 * worth looking at from the parking lot at 10:05, and dropping it into the past
 * at the moment it starts would take it off the screen exactly when it matters.
 * Past interviews come back newest first, since that is the end of the list
 * anyone ever wants.
 */
export function splitInterviews(
  interviews: readonly Interview[],
  today: string = todayISO(),
): { upcoming: Interview[]; past: Interview[] } {
  const sorted = [...interviews].sort(compareInterviews);
  return {
    upcoming: sorted.filter((interview) => interview.date >= today),
    past: sorted.filter((interview) => interview.date < today).reverse(),
  };
}

/* ------------------------------------------------------------- text snippets */

export type TextSnippet = {
  id: string;
  title: string;
  body: string;
  sortOrder: number;
};

export function compareSnippets(a: TextSnippet, b: TextSnippet): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.title.localeCompare(b.title);
}

/**
 * Move one snippet up or down, renumbering the whole list.
 *
 * Renumbering matters: a result still carrying its old positions would make the
 * second of two moves throw the first one away. Same reasoning as `moveItem` in
 * `truck.ts`, and the same shape of answer.
 */
export function moveSnippet(
  snippets: readonly TextSnippet[],
  id: string,
  direction: -1 | 1,
): TextSnippet[] {
  const ordered = [...snippets].sort(compareSnippets);
  const from = ordered.findIndex((snippet) => snippet.id === id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= ordered.length) return ordered;

  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  return ordered.map((snippet, index) => ({ ...snippet, sortOrder: index }));
}

/* -------------------------------------------------------------------- dates */

/** Today, as a date input wants it. */
export function todayISO(): string {
  return toISODate(new Date());
}

/** "Tue, Aug 18" — the day of the week is half the point of reading a date here. */
export function formatInterviewDate(iso: string): string {
  return fromISODate(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** 24-hour "14:30" as "2:30 PM". Empty in, empty out. */
export function formatTime(time: string): string {
  if (!TIME_PATTERN.test(time)) return "";
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours < 12 ? "AM" : "PM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** "Aug 18, 2026 · 3:04 PM" — when an application landed. */
export function formatSubmitted(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

/**
 * How many whole days ago something happened, for the "3 days ago" beside a
 * new application. Measured between calendar days rather than by dividing the
 * gap in milliseconds, so an application from 11pm last night reads as
 * yesterday at 8am rather than as today.
 */
export function daysAgo(iso: string, now: Date = new Date()): number | null {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const thenDay = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((nowDay.getTime() - thenDay.getTime()) / 86_400_000);
}

/**
 * How far past this a date is written out in full instead. "612 days ago" tells
 * you nothing; past about a month, what you want is the date.
 */
const RECENT_DAYS = 30;

/**
 * "Today" / "Yesterday" / "5 days ago" — how long somebody has been waiting,
 * which on this page matters more than the calendar date they applied.
 *
 * Null means there is no short form worth showing, either because the date is
 * too old to read that way or because it didn't parse; callers fall back to
 * `formatSubmitted`.
 */
export function formatAge(iso: string, now: Date = new Date()): string | null {
  const days = daysAgo(iso, now);
  if (days === null || days < 0 || days > RECENT_DAYS) return null;
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

/* ---------------------------------------------------------------------- CSV */

const CSV_HEADERS = [
  "Submitted",
  "First name",
  "Last name",
  "Phone",
  "Email",
  "Age",
  "Position",
  "Location",
  "Employment",
  "Availability",
  "Work authorized",
  "Food service before",
  "Transportation",
  "Experience",
  "Status",
  "Note",
] as const;

/** The sheet as a real spreadsheet, for when it wants to leave this page. */
export function toApplicationsCsv(applications: readonly Application[]): string {
  return toCsv([
    CSV_HEADERS,
    ...applications.map((application) => [
      formatSubmitted(application.submittedAt),
      application.firstName,
      application.lastName,
      application.phone,
      application.email,
      application.age,
      application.position,
      application.location,
      application.employmentType,
      application.availability,
      application.workAuthorized,
      application.foodService,
      application.transportation,
      application.experience,
      STATUS_LABELS[application.status],
      application.note,
    ]),
  ]);
}

export function applicationsCsvFilename(today: string = todayISO()): string {
  return `applications-${today}.csv`;
}
