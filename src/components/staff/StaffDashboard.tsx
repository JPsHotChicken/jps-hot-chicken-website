"use client";

import { useCallback, useRef, useState } from "react";
import { Menu, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { scheduledDatesAction } from "@/app/staff/actions";
import {
  type Employee,
  type RolePreference,
  type ShiftRole,
  type RecurringTimeOff,
  type StaffShiftDay,
  type TimeOffRequest,
} from "@/lib/schedule";
import { type RuleSignature } from "@/lib/staff-rules";
import { STAFF_VIEW_LABELS, type StaffView } from "@/lib/staff-views";
import type { Weather } from "@/lib/weather";
import { MySchedulePage } from "./MySchedulePage";
import { PayOutPage, type MyPayStub } from "./PayOutPage";
import { RulesSlideshow } from "./RulesSlideshow";
import { StaffHome, type StaffToday } from "./StaffHome";
import { StaffMenu } from "./StaffMenu";
import { StaffTour, useTourPending } from "./StaffTour";
import { buildStaffTour, type TourDemo } from "./staffTourSteps";

export type { MyPayStub };

export type StaffDashboardProps = {
  employee: Employee;
  initialRequests: TimeOffRequest[];
  /** Days this person is on, over the span the page loaded up front. */
  initialScheduledDates: string[];
  /** What that span was, so the calendar only refetches when it leaves it. */
  scheduledRange: { from: string; to: string };
  /** Released stubs belonging to this person, newest pay date first. */
  payStubs: MyPayStub[];
  /** Which rules slides this person has signed, on their current wording. */
  ruleSignatures: RuleSignature[];
  /** Today's shifts, for the home page. */
  today: StaffToday;
  /** The next day after today with a shift on it. */
  upcoming: StaffShiftDay | null;
  /** Published shifts from this week's Sunday on, for My schedule. */
  shiftDays?: StaffShiftDay[];
  /** Weekdays they have off every week. */
  initialRecurring?: RecurringTimeOff[];
  /** Roles they've asked for on coming days. */
  initialPreferences?: RolePreference[];
  /** The owner's roles, for picking a preference from. */
  roles?: ShiftRole[];
  /** Today's weather at the restaurant, or `null` if the forecast didn't load. */
  weather?: Weather | null;
  /** Which section to open on — `/staff?view=payStubs`, say. */
  initialView?: StaffView;
};

export function StaffDashboard({
  employee,
  initialRequests,
  initialScheduledDates,
  scheduledRange,
  payStubs,
  ruleSignatures,
  today,
  upcoming,
  shiftDays = [],
  initialRecurring = [],
  initialPreferences = [],
  roles = [],
  weather = null,
  initialView = "home",
}: StaffDashboardProps) {
  const [view, setView] = useState<StaffView>(initialView);
  const [menuOpen, setMenuOpen] = useState(false);
  const [requests, setRequests] = useState(initialRequests);
  const [scheduledDates, setScheduledDates] = useState(initialScheduledDates);
  const [recurring, setRecurring] = useState(initialRecurring);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [error, setError] = useState<string | null>(null);

  /** The first-visit tour, and whichever popup it has opened to show off. */
  const [tourPending, finishTour] = useTourPending(employee.id);
  const [tourDemo, setTourDemo] = useState<TourDemo>(null);

  /**
   * Spans of calendar whose shifts have already been fetched. A ref rather than
   * state because nothing on screen depends on it, and because the callback
   * below has to stay the same function between renders — the calendar asks
   * through an effect, and a new function every render would ask forever.
   */
  const loadedSpans = useRef([scheduledRange]);

  const loadScheduled = useCallback(async (from: string, to: string) => {
    if (loadedSpans.current.some((span) => span.from <= from && span.to >= to)) return;
    loadedSpans.current.push({ from, to });
    try {
      const dates = await scheduledDatesAction(from, to);
      // Merged, not replaced: paging back to a month should not blank the dots
      // on the one before it.
      setScheduledDates((current) => [...new Set([...current, ...dates])]);
    } catch (cause) {
      console.error("[staff] Could not load scheduled days:", cause);
      setError("Couldn't load your schedule for those days. Please try again.");
      // Let a later look at the same span try again.
      loadedSpans.current = loadedSpans.current.filter(
        (span) => span.from !== from || span.to !== to,
      );
    }
  }, []);

  const selectView = (next: StaffView) => {
    setView(next);
    // Keep the address in step, so a refresh or the back link from a pay stub
    // lands on the same section. Replaced, not pushed: the Menu is not history.
    const url = next === "home" ? "/staff" : `/staff?view=${next}`;
    window.history.replaceState(null, "", url);
    window.scrollTo({ top: 0 });
  };

  const recurringDays = recurring.map((entry) => entry.day);

  return (
    <div className="min-h-screen bg-muted">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Button
            variant="ghost"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            data-tour="menu"
            className="-ml-2 gap-2 px-2 text-base font-semibold"
          >
            <Menu className="size-5" />
            Menu
          </Button>
          {view !== "home" && (
            <h1 className="min-w-0 truncate font-heading text-base font-bold">
              {STAFF_VIEW_LABELS[view]}
            </h1>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive sm:px-6"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="flex-1">{error}</p>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss"
              onClick={() => setError(null)}
            >
              <X />
            </Button>
          </div>
        )}
      </header>

      <StaffMenu open={menuOpen} view={view} onOpenChange={setMenuOpen} onSelect={selectView} />

      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:px-6">
        {view === "home" && (
          <StaffHome
            today={today}
            upcoming={upcoming}
            weather={weather}
            workDates={scheduledDates}
            timeOff={requests}
            recurringDays={recurringDays}
            shiftDays={shiftDays}
            recurring={recurring}
            tourDay={tourDemo?.kind === "homeDay" ? tourDemo.date : null}
            onLoadDates={loadScheduled}
            onOpenMenu={() => setMenuOpen(true)}
          />
        )}

        {view === "schedule" && (
          <MySchedulePage
            todayISO={today.date}
            shiftDays={shiftDays}
            workDates={scheduledDates}
            timeOff={requests}
            onTimeOffChange={setRequests}
            onLoadDates={loadScheduled}
            recurring={recurring}
            onRecurringChange={setRecurring}
            preferences={preferences}
            onPreferencesChange={setPreferences}
            roles={roles}
            tourTimeOffDay={tourDemo?.kind === "timeOffDay" ? tourDemo.date : null}
          />
        )}

        {view === "rules" && (
          <RulesSlideshow employeeName={employee.name} initialSignatures={ruleSignatures} />
        )}

        {view === "payStubs" && (
          <PayOutPage
            payStubs={payStubs}
            todayISO={today.date}
            tourWeek={tourDemo?.kind === "payWeek" ? tourDemo.monday : null}
          />
        )}
      </main>

      {tourPending && (
        <StaffTour
          steps={buildStaffTour({
            name: employee.name,
            today,
            upcoming,
            workDates: scheduledDates,
            timeOff: requests,
            payStubs,
            // Each step says which page it's on; only switching when it
            // changes keeps the page from jumping back to the top every step.
            // (The steps are rebuilt every render, so `view` here is current.)
            show: (next) => {
              if (view !== next) selectView(next);
            },
            demo: setTourDemo,
          })}
          onFinish={() => {
            setTourDemo(null);
            finishTour();
            selectView("home");
          }}
        />
      )}
    </div>
  );
}
