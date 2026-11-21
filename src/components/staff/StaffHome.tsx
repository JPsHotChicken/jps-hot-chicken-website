import { CalendarClock } from "lucide-react";

import { roleColorClasses } from "@/lib/role-colors";
import {
  DAY_LABELS,
  dayKeyOf,
  formatOrdinalDate,
  formatRange,
  type StaffShift,
  type StaffShiftDay,
  type TimeOffRequest,
} from "@/lib/schedule";
import type { Weather } from "@/lib/weather";
import { Coffee } from "./TodayArt";
import { WeatherCard } from "./WeatherCard";
import { WeekStrip } from "./WeekStrip";

export type StaffToday = {
  /** Today at the restaurant, `YYYY-MM-DD`. */
  date: string;
  /** The store is shut today. */
  closed: boolean;
  /** Whether this week's schedule has been published at all. */
  posted: boolean;
  shifts: StaffShift[];
};

type Props = {
  today: StaffToday;
  /** The next day after today with a shift on it, if one is posted. */
  upcoming: StaffShiftDay | null;
  /** Today's weather at the restaurant; the weather card is left off when it's unknown. */
  weather?: Weather | null;
  /** Every date this person has a published shift on, `YYYY-MM-DD`. */
  workDates?: string[];
  /** Their time-off requests, so requested days are ringed in red. */
  timeOff?: TimeOffRequest[];
  /** Fetch work days for a span of dates the week strip can swipe to. */
  onLoadDates?: (fromISO: string, toISO: string) => void;
};

/** What today's card says in place of hours when there aren't any. */
function noShiftLine(today: StaffToday): { headline: string; detail: string } {
  if (today.closed) return { headline: "Closed today", detail: "The restaurant is closed." };
  if (!today.posted) {
    return {
      headline: "Not posted yet",
      detail: "This week's schedule hasn't been published. Check back soon.",
    };
  }
  return { headline: "You're off today", detail: "You're not on the schedule today." };
}

function RoleLine({ role }: { role: StaffShift["role"] }) {
  if (!role) {
    return <p className="text-xl font-semibold text-muted-foreground">No role assigned</p>;
  }
  return (
    <p className="flex items-center gap-2 text-xl font-semibold">
      <span
        aria-hidden
        className={`size-3 shrink-0 rounded-full ${roleColorClasses(role.color).dot}`}
      />
      {role.name}
    </p>
  );
}

/**
 * The staff home page: today, big, then when they are next in. Everything else
 * lives behind the Menu.
 */
export function StaffHome({
  today,
  upcoming,
  weather,
  workDates = [],
  timeOff = [],
  onLoadDates,
}: Props) {
  const working = today.shifts.length > 0;
  const empty = working ? null : noShiftLine(today);

  return (
    <div className="space-y-4">
      {/* One card: the weather strip runs straight into today's shift. */}
      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
        {weather && <WeatherCard weather={weather} />}

        <section aria-labelledby="today-heading" data-working={working}>
          <div className="px-5 pt-6 pb-7 sm:px-8 sm:pt-8 sm:pb-9">
            <p className="text-xs font-bold tracking-widest text-brand uppercase">Today</p>
            <h2 id="today-heading" className="mt-1 font-heading text-2xl font-semibold">
              {formatOrdinalDate(today.date)}
            </h2>

            {!working && <Coffee className="mt-4 h-16 w-auto sm:h-20" />}

            {empty ? (
              <div className="mt-3">
                <p className="font-heading text-4xl font-bold tracking-tight sm:text-5xl">
                  {empty.headline}
                </p>
                <p className="mt-2 text-base text-muted-foreground">{empty.detail}</p>
              </div>
            ) : (
              <ul className="mt-3 space-y-6">
                {today.shifts.map((shift) => (
                  <li key={`${shift.start}-${shift.end}`} className="space-y-2">
                    <p className="font-heading text-4xl leading-tight font-bold tracking-tight tabular-nums sm:text-5xl">
                      {formatRange(shift)}
                    </p>
                    <RoleLine role={shift.role} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section
        aria-labelledby="upcoming-heading"
        className="rounded-xl border border-border bg-background p-5 shadow-sm"
      >
        <h2
          id="upcoming-heading"
          className="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
        >
          <CalendarClock className="size-4 text-brand" />
          Upcoming shift
        </h2>

        {upcoming ? (
          <div className="mt-3">
            <p className="font-heading text-lg font-bold">
              {DAY_LABELS[dayKeyOf(upcoming.date)]}, {formatOrdinalDate(upcoming.date)}
            </p>
            <ul className="mt-1 space-y-1">
              {upcoming.shifts.map((shift) => (
                <li
                  key={`${shift.start}-${shift.end}`}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold tabular-nums"
                >
                  {formatRange(shift)}
                  {shift.role && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        roleColorClasses(shift.role.color).pill
                      }`}
                    >
                      {shift.role.name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No upcoming shifts posted yet. They show up here once your manager publishes the
            schedule.
          </p>
        )}

        <WeekStrip
          todayISO={today.date}
          workDates={workDates}
          timeOff={timeOff}
          onRangeChange={onLoadDates}
        />
      </section>
    </div>
  );
}
