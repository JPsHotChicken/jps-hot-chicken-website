"use client";

import { useState } from "react";
import { CalendarClock, Menu } from "lucide-react";

import { roleColorClasses } from "@/lib/role-colors";
import {
  DAY_LABELS,
  dayKeyOf,
  formatOrdinalDate,
  formatRange,
  sundayWeekOf,
  type StaffShift,
  type DayKey,
  type RecurringTimeOff,
  type StaffShiftDay,
  type TimeOffRequest,
} from "@/lib/schedule";
import type { Weather } from "@/lib/weather";
import { DayDetails } from "./DayDetails";
import { StaffTour, useTourPending, type TourStep } from "./StaffTour";
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
  /** Weekdays they have off every week, ringed red in the week row. */
  recurringDays?: DayKey[];
  /** Their published shifts by day, for the popup a tapped day opens. */
  shiftDays?: StaffShiftDay[];
  /** Their every-week days off, for that popup. */
  recurring?: RecurringTimeOff[];
  /**
   * Who is signed in, for the first-visit tour of the portal. Left out (tests,
   * previews), there is no tour.
   */
  tourFor?: { id: string; name: string };
  /** Open the Menu, from the reminder at the bottom of the page. */
  onOpenMenu?: () => void;
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
  recurringDays = [],
  shiftDays = [],
  recurring = [],
  tourFor,
  onOpenMenu,
  onLoadDates,
}: Props) {
  /** The day tapped in the week strip, whose shift the popup is showing. */
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const working = today.shifts.length > 0;
  const empty = working ? null : noShiftLine(today);

  /* ------------------------------------------------------------ the tour */

  const [tourPending, finishTour] = useTourPending(tourFor?.id);
  // On a day off, the tour shows the role on their next shift instead.
  const upcomingRoleShift = upcoming?.shifts.find((shift) => shift.role) ?? null;
  const tourSteps = tourFor ? buildTourSteps() : [];

  function buildTourSteps(): TourStep[] {
    const firstName = tourFor!.name.trim().split(/\s+/)[0] ?? "";
    const greeting = firstName.charAt(0).toUpperCase() + firstName.slice(1);

    // The day the tour opens for them: their next work day this week, else
    // any work day this week, else today. This week is what the strip opens on.
    const thisWeek = sundayWeekOf(today.date);
    const worked = thisWeek.filter((date) => workDates.includes(date));
    const demoDay = worked.find((date) => date >= today.date) ?? worked[0] ?? today.date;
    const demoLabel = `${DAY_LABELS[dayKeyOf(demoDay)]}, ${formatOrdinalDate(demoDay)}`;
    const demoWorked = worked.includes(demoDay);

    const todayRole = working ? today.shifts[0].role : null;
    const roleStep: TourStep = working
      ? {
          target: '[data-tour="role"]',
          title: "Your station for today",
          body: todayRole ? (
            <p>
              Under your hours is your role: where you&apos;re stationed for today&apos;s
              shift. Today you&apos;re on <strong className="text-foreground">{todayRole.name}</strong>.
            </p>
          ) : (
            <p>
              Under your hours is your role: where you&apos;re stationed for the shift. Your
              manager hasn&apos;t given you one for today yet. It shows up here when they do.
            </p>
          ),
        }
      : upcomingRoleShift?.role
        ? {
            target: '[data-tour="role"]',
            title: "Where you're stationed",
            body: (
              <p>
                Every shift now shows your role: where you&apos;re stationed. On your next shift
                you&apos;re on{" "}
                <strong className="text-foreground">{upcomingRoleShift.role.name}</strong>. On
                days you work, it shows right under today&apos;s hours too.
              </p>
            ),
          }
        : {
            target: '[data-tour="today"]',
            title: "Where you're stationed",
            body: (
              <p>
                On days you work, today&apos;s hours show here with your role right under them:
                where you&apos;re stationed for that shift.
              </p>
            ),
          };

    return [
      {
        title: `Welcome to the new staff portal, ${greeting}!`,
        body: (
          <>
            <p>Here&apos;s a quick look at what&apos;s new. It takes under a minute.</p>
            <p>You can skip it, and nothing on the page changes either way.</p>
          </>
        ),
        next: "Let's go",
        onEnter: () => setSelectedDay(null),
      },
      { ...roleStep, onEnter: () => setSelectedDay(null) },
      {
        target: `[data-day="${demoDay}"]`,
        title: "Tap any day in your week",
        body: (
          <p>
            Every day in your week can be tapped to see that day&apos;s shift. Try{" "}
            <strong className="text-foreground">{demoLabel}</strong>.
          </p>
        ),
        tapTarget: true,
        next: "Show me",
        onEnter: () => setSelectedDay(null),
      },
      {
        target: '[aria-labelledby="day-details-title"]',
        title: "Your shift details",
        body: demoWorked ? (
          <p>
            Here are your hours and role for {demoLabel}.
            Any day you open closes again with the ✕.
          </p>
        ) : (
          <p>
            You&apos;re not on for {demoLabel}, so it says so. On a work day this shows your
            hours and role. Any day you open closes again with the ✕.
          </p>
        ),
        // Really open it, the same as tapping the day does.
        onEnter: () => setSelectedDay(demoDay),
      },
      {
        target: '[data-tour="menu"]',
        title: "Everything else is in the Menu",
        body: (
          <p>
            Your full schedule, time off, Pay Out and the rules are all in the Menu, up here.
          </p>
        ),
        onEnter: () => setSelectedDay(null),
      },
    ];
  }

  return (
    <div className="space-y-4">
      {/* One card: the weather strip runs straight into today's shift. */}
      <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
        {weather && <WeatherCard weather={weather} />}

        <section aria-labelledby="today-heading" data-working={working} data-tour="today">
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
                {today.shifts.map((shift, index) => (
                  <li key={`${shift.start}-${shift.end}`} className="space-y-2">
                    <p className="font-heading text-4xl leading-tight font-bold tracking-tight tabular-nums sm:text-5xl">
                      {formatRange(shift)}
                    </p>
                    <div data-tour={index === 0 ? "role" : undefined} className="w-fit">
                      <RoleLine role={shift.role} />
                    </div>
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
                      data-tour={!working && shift === upcomingRoleShift ? "role" : undefined}
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${roleColorClasses(shift.role.color).pill
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
          onSelectDay={setSelectedDay}
          todayISO={today.date}
          workDates={workDates}
          timeOff={timeOff}
          recurringDays={recurringDays}
          onRangeChange={onLoadDates}
        />
      </section>

      {/* Everything else lives behind the Menu; say so, once, at the bottom. */}
      <button
        type="button"
        onClick={onOpenMenu}
        className="mx-auto flex w-fit max-w-full items-center gap-2.5 rounded-full border border-border bg-background px-4 py-2 text-left text-sm text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <Menu aria-hidden className="size-4 shrink-0 text-brand" />
        <span>
          {" "}
          <span className="font-bold text-foreground">Menu</span>
        </span>
      </button>

      {selectedDay && (
        <DayDetails
          date={selectedDay}
          todayISO={today.date}
          shiftDay={shiftDays.find((entry) => entry.date === selectedDay)}
          timeOff={timeOff}
          recurring={recurring}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {tourPending && tourSteps.length > 0 && (
        <StaffTour
          steps={tourSteps}
          onFinish={() => {
            setSelectedDay(null);
            finishTour();
          }}
        />
      )}
    </div>
  );
}
