import { useMemo } from "react";

import {
  DAY_LABELS,
  coversDate,
  dayKeyOf,
  formatOrdinalDate,
  fromISODate,
  type DayKey,
  type TimeOffRequest,
} from "@/lib/schedule";

/**
 * What one day in a week row looks like, worked out once for the home page's
 * swipeable strip and the My schedule page alike, so they can never disagree.
 */
export type DayMarks = {
  isWorking: (iso: string) => boolean;
  isRequestedOff: (iso: string) => boolean;
};

/**
 * Who works when, and which days they've asked off — dated requests that
 * weren't declined, plus any weekday they have off every week.
 */
export function useDayMarks(
  workDates: string[],
  timeOff: TimeOffRequest[] = [],
  recurringDays: DayKey[] = [],
): DayMarks {
  return useMemo(() => {
    const working = new Set(workDates);
    // A declined request means they're working, so it doesn't count — the same
    // rule as the calendar and the owner's grid.
    const standing = timeOff.filter((request) => request.status !== "denied");
    const weekly = new Set(recurringDays);
    return {
      isWorking: (iso) => working.has(iso),
      isRequestedOff: (iso) =>
        weekly.has(dayKeyOf(iso)) || standing.some((request) => coversDate(request, iso)),
    };
  }, [workDates, timeOff, recurringDays]);
}

type Props = {
  /** Seven `YYYY-MM-DD` dates, Sunday first. */
  days: string[];
  todayISO: string;
  marks: DayMarks;
  /** The list's accessible name — "This week". */
  label: string;
  /** Larger circles, for a page where the week is the main event. */
  size?: "md" | "lg";
  hidden?: boolean;
  className?: string;
  /** When given, each circle is a button that opens that day's details. */
  onSelectDay?: (iso: string) => void;
};

/**
 * One Sunday-to-Saturday week. Every day is ringed: red when they've asked for
 * it off, green when they work it, gray otherwise. Today also gets a smaller
 * solid blue circle inside its ring, with a little white between.
 */
export function WeekRow({
  days,
  todayISO,
  marks,
  label,
  size = "md",
  hidden,
  className = "",
  onSelectDay,
}: Props) {
  const circle = size === "lg" ? "size-10 sm:size-12" : "size-9 sm:size-10";

  return (
    <ol
      aria-label={label}
      aria-hidden={hidden}
      className={`grid grid-cols-7 gap-1 text-center ${className}`}
    >
      {days.map((date) => {
        const isToday = date === todayISO;
        const isWorking = marks.isWorking(date);
        const requestedOff = marks.isRequestedOff(date);
        const weekday = DAY_LABELS[dayKeyOf(date)];
        // Asking for a day off says more than being on the rota for it, so red
        // wins over green.
        const ring = requestedOff
          ? "border-2 border-red-500 text-foreground"
          : isWorking
            ? "border-2 border-emerald-500 text-foreground"
            : "border border-gray-300 text-muted-foreground";
        const dayOfMonth = fromISODate(date).getDate();
        return (
          <li
            key={date}
            aria-current={isToday ? "date" : undefined}
            aria-label={`${weekday} ${formatOrdinalDate(date)}${isToday ? ", today" : ""}, ${
              isWorking ? "working" : "off"
            }${requestedOff ? ", day off requested" : ""}`}
            className="flex flex-col items-center gap-1.5"
          >
            <span aria-hidden className="text-[0.65rem] font-bold text-muted-foreground uppercase">
              {weekday.slice(0, 3)}
            </span>
            {(() => {
              const circleClass = `flex ${circle} items-center justify-center rounded-full bg-background text-sm font-bold tabular-nums ${ring}`;
              const face = isToday ? (
                <span className="flex size-[calc(100%-10px)] items-center justify-center rounded-full bg-blue-600 text-xs text-white sm:text-sm">
                  {dayOfMonth}
                </span>
              ) : (
                dayOfMonth
              );
              return onSelectDay ? (
                <button
                  type="button"
                  onClick={() => onSelectDay(date)}
                  aria-label={`Details for ${weekday} ${formatOrdinalDate(date)}`}
                  aria-haspopup="dialog"
                  className={`${circleClass} cursor-pointer transition-transform hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none`}
                >
                  {face}
                </button>
              ) : (
                <span aria-hidden className={circleClass}>
                  {face}
                </span>
              );
            })()}
          </li>
        );
      })}
    </ol>
  );
}

/** The key under a week row. */
export function WeekLegend({ className = "" }: { className?: string }) {
  return (
    <p
      className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground ${className}`}
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-full bg-blue-600" />
        Today
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-full border-2 border-emerald-500" />
        Working
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-full border-2 border-red-500" />
        Requested off
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-full border border-gray-300" />
        Off
      </span>
    </p>
  );
}
