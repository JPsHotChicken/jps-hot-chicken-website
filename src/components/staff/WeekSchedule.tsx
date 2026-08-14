"use client";

import { CalendarCheck, MoonStar } from "lucide-react";

import {
  datesForWeek,
  employeeWeek,
  formatRange,
  formatShortDate,
  isClosingShift,
  rangeHours,
  type WeekSchedule as Week,
} from "@/lib/schedule";

type Props = {
  week: Week;
  employeeId: string;
  weekStart: string;
};

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * One employee's week, laid out the same way as their page in the exported PDF:
 * day and date on the left, the hours they're on in the middle, the day's total
 * on the right, and the closing-shift note underneath.
 */
export function WeekSchedule({ week, employeeId, weekStart }: Props) {
  const { days, totalHours } = employeeWeek(week, employeeId);
  const dates = datesForWeek(weekStart);
  const closingDays = days.filter(({ ranges }) => isClosingShift(ranges)).map(({ label }) => label);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white">
          Total hours this week: {totalHours}
        </span>
        {closingDays.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-bold tracking-wide text-background uppercase">
            <MoonStar className="size-3.5" />
            Closing shift
          </span>
        )}
      </div>

      <ul className="mt-4 divide-y divide-border border-y border-border">
        {days.map(({ day, label, closed, ranges }) => {
          const hours = rangeHours(ranges);
          return (
            <li key={day} className="flex items-baseline gap-3 py-3">
              <div className="w-24 shrink-0 sm:w-32">
                <p className="font-heading text-sm font-bold">{label}</p>
                <p className="text-xs text-muted-foreground">{formatShortDate(dates[day])}</p>
              </div>

              <div className="min-w-0 flex-1">
                {closed ? (
                  <p className="text-sm text-muted-foreground italic">Closed — off</p>
                ) : ranges.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Off</p>
                ) : (
                  <ul className="space-y-0.5">
                    {ranges.map((range) => (
                      <li key={`${range.start}-${range.end}`} className="text-sm font-bold">
                        {formatRange(range)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {hours > 0 && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {hours} h
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {closingDays.length > 0 && (
        <div className="mt-4 rounded-lg border-l-4 border-brand bg-brand/5 px-4 py-3">
          <p className="font-heading text-sm font-bold">Closing shift</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You are scheduled to close on {joinList(closingDays)}. Closing staff are expected to
            stay until the restaurant is fully closed down, which is typically between 9:15 and
            9:45 PM. Please plan your evening accordingly, and speak with your manager if this
            creates a conflict.
          </p>
        </div>
      )}

      {totalHours === 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          <CalendarCheck className="size-4 shrink-0" />
          You&apos;re not scheduled for any shifts this week.
        </p>
      )}
    </div>
  );
}
