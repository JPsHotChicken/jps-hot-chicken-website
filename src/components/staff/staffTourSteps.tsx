import { addDaysISO, payWeekOf } from "@/lib/pay-stubs";
import {
  DAY_LABELS,
  addDays,
  coversDate,
  dayKeyOf,
  formatDateRange,
  formatOrdinalDate,
  fromISODate,
  isClosedDay,
  sundayWeekOf,
  toISODate,
  type StaffShiftDay,
  type TimeOffRequest,
} from "@/lib/schedule";
import type { StaffView } from "@/lib/staff-views";
import type { StaffToday } from "./StaffHome";
import type { MyPayStub } from "./PayOutPage";
import type { TourStep } from "./StaffTour";

/**
 * Which popup the tour has opened, if any. The tour really opens them — the
 * same popup a tap opens — rather than showing a picture of one.
 */
export type TourDemo =
  | { kind: "homeDay"; date: string }
  | { kind: "timeOffDay"; date: string }
  | { kind: "payWeek"; monday: string }
  | null;

type Context = {
  name: string;
  today: StaffToday;
  upcoming: StaffShiftDay | null;
  workDates: string[];
  timeOff: TimeOffRequest[];
  payStubs: MyPayStub[];
  /** Switch the page the tour is on. */
  show: (view: StaffView) => void;
  /** Open one of the popups, or close whichever is open. */
  demo: (demo: TourDemo) => void;
};

const strong = (text: string) => <strong className="text-foreground">{text}</strong>;

const dayName = (iso: string) => `${DAY_LABELS[dayKeyOf(iso)]}, ${formatOrdinalDate(iso)}`;

/**
 * The first-visit tour, page by page: the home page, then My schedule, then
 * Pay Out. Built fresh from what this person actually has, so it points at
 * their own shifts, their own role and their own checks.
 */
export function buildStaffTour(context: Context): TourStep[] {
  const { name, today, upcoming, workDates, timeOff, payStubs, show, demo } = context;
  const firstName = name.trim().split(/\s+/)[0] ?? "";
  const greeting = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const working = today.shifts.length > 0;

  /* --------------------------------------------------------------- home */

  const home = (popup: TourDemo = null) => () => {
    show("home");
    demo(popup);
  };

  // The day the tour opens: their next work day this week, else any work day
  // this week, else today. This week is what the home page's strip opens on.
  const thisWeek = sundayWeekOf(today.date);
  const worked = thisWeek.filter((date) => workDates.includes(date));
  const homeDay = worked.find((date) => date >= today.date) ?? worked[0] ?? today.date;

  const todayRole = working ? today.shifts[0].role : null;
  const upcomingRole = upcoming?.shifts.find((shift) => shift.role)?.role ?? null;
  const roleStep: TourStep = working
    ? {
        target: '[data-tour="role"]',
        title: "Your station for today",
        body: todayRole ? (
          <p>
            Under your hours is your role: where you&apos;re stationed for today&apos;s shift.
            Today you&apos;re on {strong(todayRole.name)}.
          </p>
        ) : (
          <p>
            Under your hours is your role: where you&apos;re stationed for the shift. Your
            manager hasn&apos;t given you one for today yet. It shows up here when they do.
          </p>
        ),
      }
    : upcomingRole
      ? {
          target: '[data-tour="role"]',
          title: "Where you're stationed",
          body: (
            <p>
              Every shift now shows your role: where you&apos;re stationed. On your next shift
              you&apos;re on {strong(upcomingRole.name)}. On days you work, it shows right
              under today&apos;s hours too.
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

  /* -------------------------------------------------------- My schedule */

  const schedule = (popup: TourDemo = null) => () => {
    show("schedule");
    demo(popup);
  };

  // A day to show asking off with: the first open day after today that they
  // haven't already asked for. Asking for it is left to them — the tour only
  // opens the popup.
  const requested = (iso: string) =>
    timeOff.some((request) => request.status !== "denied" && coversDate(request, iso));
  let offDay = toISODate(addDays(fromISODate(today.date), 1));
  for (let tries = 0; tries < 14; tries++) {
    if (!isClosedDay(dayKeyOf(offDay)) && !requested(offDay)) break;
    offDay = toISODate(addDays(fromISODate(offDay), 1));
  }

  /* ------------------------------------------------------------ Pay Out */

  const pay = (popup: TourDemo = null) => () => {
    show("payStubs");
    demo(popup);
  };
  const payWeek = payStubs.map(payWeekOf).find(Boolean) ?? null;

  const paySteps: TourStep[] = payWeek
    ? [
        {
          target: '[data-tour="pay-calendar"]',
          title: "What you earned, week by week",
          body: (
            <p>
              Pay Out shows each week you were paid for, with what you earned beside it. Weeks
              run Monday to Sunday, the same as your checks.
            </p>
          ),
          onEnter: pay(),
        },
        {
          target: `[data-week="${payWeek}"]`,
          title: "Tap a week",
          body: (
            <p>
              Tap any week to see how it breaks down. Try the week of{" "}
              {strong(formatDateRange(payWeek, addDaysISO(payWeek, 6)))}.
            </p>
          ),
          tapTarget: true,
          tapHint: "Tap the highlighted week",
          next: "Show me",
          onEnter: pay(),
        },
        {
          target: '[aria-labelledby="week-pay-title"]',
          title: "Wages and tips, split out",
          body: (
            <p>
              Here&apos;s that week: your pay for the hours you worked, your tips, and the total
              you earned, all before taxes.
            </p>
          ),
          onEnter: pay({ kind: "payWeek", monday: payWeek }),
        },
        {
          target: '[data-tour="see-check"]',
          title: "The whole check",
          body: (
            <p>
              Tap {strong("See whole check")} to open the pay stub itself, with every detail
              on it. Every check is also listed under {strong("My checks")} at the bottom of
              the page.
            </p>
          ),
          onEnter: pay({ kind: "payWeek", monday: payWeek }),
        },
      ]
    : [
        {
          target: '[data-tour="pay-calendar"]',
          title: "What you earned, week by week",
          body: (
            <p>
              Once payroll goes out, Pay Out shows what you earned each week. Tap a week to see
              your wages and tips split out, and open the whole check from there.
            </p>
          ),
          onEnter: pay(),
        },
      ];

  return [
    {
      title: `Welcome, ${greeting}!`,
      body: <p>Here&apos;s a quick look around the new staff portal.</p>,
      next: "Let's go",
      onEnter: home(),
    },
    { ...roleStep, onEnter: home() },
    {
      target: `[data-day="${homeDay}"]`,
      title: "Tap any day in your week",
      body: (
        <p>
          Every day in your week can be tapped to see that day&apos;s shift. Try{" "}
          {strong(dayName(homeDay))}.
        </p>
      ),
      tapTarget: true,
      tapHint: "Tap the highlighted day",
      next: "Show me",
      onEnter: home(),
    },
    {
      target: '[aria-labelledby="day-details-title"]',
      title: "Your shift details",
      body: worked.includes(homeDay) ? (
        <p>
          Here are your hours and role for {dayName(homeDay)}. Any day you open closes again
          with the ✕.
        </p>
      ) : (
        <p>
          You&apos;re not on for {dayName(homeDay)}, so it says so. On a work day this shows
          your hours and role.
        </p>
      ),
      onEnter: home({ kind: "homeDay", date: homeDay }),
    },
    {
      target: '[data-tour="menu"]',
      title: "Everything else is in the Menu",
      body: (
        <p>
          Your schedule, Pay Out and the rules are all in the Menu, up here. Next, a look at My
          schedule.
        </p>
      ),
      onEnter: home(),
    },
    {
      target: '[data-tour="timeoff-calendar"]',
      title: "Ask for a day off",
      body: (
        <p>
          On My schedule, tap any day on this calendar to ask for it off. Green dots are days
          you work; a red ✕ marks a day you&apos;ve already asked for.
        </p>
      ),
      onEnter: schedule(),
    },
    {
      target: `[data-tour="timeoff-calendar"] [data-date="${offDay}"]`,
      title: "Tap a day",
      body: <p>Try {strong(dayName(offDay))}.</p>,
      tapTarget: true,
      tapHint: "Tap the highlighted day",
      next: "Show me",
      onEnter: schedule(),
    },
    {
      target: '[aria-labelledby="day-off-title"]',
      title: "Give a reason and send it",
      body: (
        <p>
          Write why you need the day and press {strong("Request this day off")}. Your manager
          reviews it. The tour won&apos;t send anything, so this one stays unsent.
        </p>
      ),
      onEnter: schedule({ kind: "timeOffDay", date: offDay }),
    },
    {
      target: '[data-tour="timeoff-list"]',
      title: "All your requests, in one list",
      body: (
        <p>
          Everything you&apos;ve asked for shows here with where it stands: waiting, approved
          or declined. Tap one to see it, change its reason or delete it.
        </p>
      ),
      onEnter: schedule(),
    },
    {
      target: '[data-tour="recurring"]',
      title: "A day off every week",
      body: (
        <>
          <p>
            If there&apos;s a day you can never work, like every Tuesday, set it here and your
            manager sees it while building the schedule.
          </p>
          <p className="font-semibold text-foreground">
            It&apos;s a request, not a guarantee.
          </p>
        </>
      ),
      onEnter: schedule(),
    },
    {
      target: '[data-tour="preferences"]',
      title: "Pick the position you'd like",
      body: (
        <>
          <p>
            For each day you&apos;re scheduled, you can say which role you&apos;d like. Your
            manager sees it when choosing who goes where.
          </p>
          <p className="font-semibold text-foreground">
            It&apos;s a request, not a guarantee.
          </p>
        </>
      ),
      onEnter: schedule(),
    },
    ...paySteps,
  ];
}
