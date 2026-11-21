"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarX,
  ChevronLeft,
  ChevronRight,
  FileText,
  HandCoins,
  LoaderCircle,
  Menu,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  loadPublishedWeekAction,
  scheduledDatesAction,
} from "@/app/staff/actions";
import {
  formatDateRange,
  formatWeekRange,
  type DayKey,
  type Employee,
  type PublishedRoleCell,
  type StaffShiftDay,
  type TimeOffRequest,
  type WeekSchedule,
} from "@/lib/schedule";
import { formatPayDate } from "@/lib/pay-stubs";
import { formatMoney, formatPeriod, type PublishedTipRate } from "@/lib/tips";
import { type RuleSignature } from "@/lib/staff-rules";
import { STAFF_VIEW_LABELS, type StaffView } from "@/lib/staff-views";
import type { Weather } from "@/lib/weather";
import { RulesSlideshow } from "./RulesSlideshow";
import { StaffHome, type StaffToday } from "./StaffHome";
import { StaffMenu } from "./StaffMenu";
import { TimeOffPage } from "./TimeOffPage";
import { WeekSchedule as WeekScheduleView } from "./WeekSchedule";

/** One released pay stub of this employee's, as the list needs it. */
export type MyPayStub = {
  id: string;
  payDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

export type StaffDashboardProps = {
  employee: Employee;
  /** Weeks the owner has published, soonest first. */
  publishedWeeks: { weekStart: string; publishedAt: string }[];
  initialWeekStart: string | null;
  initialWeek: WeekSchedule | null;
  /** This person's roles on that week's shifts. */
  initialRoles?: Record<DayKey, PublishedRoleCell[]> | null;
  initialRequests: TimeOffRequest[];
  /** Days this person is on, over the span the page loaded up front. */
  initialScheduledDates: string[];
  /** What that span was, so the calendar only refetches when it leaves it. */
  scheduledRange: { from: string; to: string };
  /** Released stubs belonging to this person, newest pay date first. */
  payStubs: MyPayStub[];
  /** Every week of tips per hour the owner has sent out, oldest first. */
  tipRates: PublishedTipRate[];
  /** Which rules slides this person has signed, on their current wording. */
  ruleSignatures: RuleSignature[];
  /** Today's shifts, for the home page. */
  today: StaffToday;
  /** The next day after today with a shift on it. */
  upcoming: StaffShiftDay | null;
  /** Today's weather at the restaurant, or `null` if the forecast didn't load. */
  weather?: Weather | null;
  /** Which section to open on — `/staff?view=payStubs`, say. */
  initialView?: StaffView;
};

export function StaffDashboard({
  employee,
  publishedWeeks,
  initialWeekStart,
  initialWeek,
  initialRoles,
  initialRequests,
  initialScheduledDates,
  scheduledRange,
  payStubs,
  tipRates,
  ruleSignatures,
  today,
  upcoming,
  weather = null,
  initialView = "home",
}: StaffDashboardProps) {
  const [view, setView] = useState<StaffView>(initialView);
  const [menuOpen, setMenuOpen] = useState(false);
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [weeks, setWeeks] = useState<Record<string, WeekSchedule>>(
    initialWeekStart && initialWeek ? { [initialWeekStart]: initialWeek } : {},
  );
  const [roleWeeks, setRoleWeeks] = useState<Record<string, Record<DayKey, PublishedRoleCell[]>>>(
    initialWeekStart && initialRoles ? { [initialWeekStart]: initialRoles } : {},
  );
  const [requests, setRequests] = useState(initialRequests);
  const [scheduledDates, setScheduledDates] = useState(initialScheduledDates);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Which week of tips is on screen. Opens on the most recent one. */
  const [rateIndex, setRateIndex] = useState(tipRates.length - 1);
  const rate = tipRates[rateIndex];


  const index = weekStart ? publishedWeeks.findIndex((w) => w.weekStart === weekStart) : -1;
  const week = weekStart ? weeks[weekStart] : undefined;

  const goToWeek = async (target: string) => {
    setWeekStart(target);
    if (weeks[target]) return;
    setLoading(true);
    try {
      const loaded = await loadPublishedWeekAction(target);
      setWeeks((current) => ({ ...current, [target]: loaded.week }));
      setRoleWeeks((current) => ({ ...current, [target]: loaded.roles }));
    } catch (cause) {
      console.error("[staff] Could not load a week:", cause);
      setError("Couldn't load that week. Please try again.");
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-muted">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Button
            variant="ghost"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
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
            <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={() => setError(null)}>
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
            onLoadDates={loadScheduled}
          />
        )}

        {view === "rules" && (
          <RulesSlideshow employeeName={employee.name} initialSignatures={ruleSignatures} />
        )}

        {/* ------------------------------------------------------- schedule */}
        {view === "schedule" && (
        <section className="rounded-xl border border-border bg-background shadow-sm">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <h2 className="mr-auto font-heading text-base font-bold">My schedule</h2>
            {publishedWeeks.length > 0 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous week"
                  disabled={index <= 0}
                  onClick={() => goToWeek(publishedWeeks[index - 1].weekStart)}
                >
                  <ChevronLeft />
                </Button>
                <span className="min-w-0 text-sm font-semibold whitespace-nowrap">
                  {loading ? (
                    <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                  ) : (
                    weekStart && formatWeekRange(weekStart)
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next week"
                  disabled={index < 0 || index >= publishedWeeks.length - 1}
                  onClick={() => goToWeek(publishedWeeks[index + 1].weekStart)}
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
          </header>

          <div className="p-4">
            {!weekStart || !week ? (
              <p className="flex items-center gap-2 rounded-lg bg-muted px-4 py-6 text-sm text-muted-foreground">
                <CalendarX className="size-4 shrink-0" />
                No schedule has been posted yet. You&apos;ll see it here as soon as your manager
                publishes it.
              </p>
            ) : (
              <WeekScheduleView
                week={week}
                roles={roleWeeks[weekStart]}
                employeeId={employee.id}
                weekStart={weekStart}
              />
            )}
          </div>
        </section>
        )}

        {view === "timeOff" && (
          <TimeOffPage
            requests={requests}
            onRequestsChange={setRequests}
            scheduledDates={scheduledDates}
            onRangeChange={loadScheduled}
          />
        )}

        {/* ------------------------------------------------------ online tips */}
        {view === "tips" && (
        <section className="rounded-xl border border-border bg-background shadow-sm">
          <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-3">
            <h2 className="mr-auto flex items-center gap-2 font-heading text-base font-bold">
              <HandCoins className="size-4 text-brand" />
              Online tips
            </h2>
            {rate && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Earlier week"
                  disabled={rateIndex <= 0}
                  onClick={() => setRateIndex(rateIndex - 1)}
                >
                  <ChevronLeft />
                </Button>
                <span className="text-sm font-semibold whitespace-nowrap">
                  {formatPeriod(rate.periodStart, rate.periodEnd)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Later week"
                  disabled={rateIndex >= tipRates.length - 1}
                  onClick={() => setRateIndex(rateIndex + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
          </header>

          <div className="p-4">
            {rate ? (
              <>
                <p className="flex items-baseline gap-2">
                  <span className="font-mono text-3xl font-bold tabular-nums">
                    {formatMoney(rate.perHour)}
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">per hour</span>
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  What every hour worked that week earned in tips.
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing yet. Once your manager works out the week&apos;s tips, what an hour earned
                shows up here.
              </p>
            )}
          </div>
        </section>

        )}

        {/* ---------------------------------------------------- my pay stubs */}
        {view === "payStubs" && (
        <section className="rounded-xl border border-border bg-background shadow-sm">
          <header className="border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 font-heading text-base font-bold">
              <FileText className="size-4 text-brand" />
              My pay stubs{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({payStubs.length})
              </span>
            </h2>
          </header>

          <div className="p-4">
            {payStubs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pay stubs yet. They show up here once payroll has been sent out.
              </p>
            ) : (
              <ul className="space-y-2">
                {payStubs.map((stub) => (
                  <li key={stub.id}>
                    {/* The whole row is the link, so it is one easy target on a
                        phone rather than a small button to aim at. */}
                    <Link
                      href={`/staff/pay-stubs/${stub.id}`}
                      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">
                          {stub.periodStart && stub.periodEnd
                            ? formatDateRange(stub.periodStart, stub.periodEnd)
                            : formatPayDate(stub.payDate)}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {stub.periodStart && stub.periodEnd
                            ? `Paid ${formatPayDate(stub.payDate)}`
                            : "Pay period not listed"}
                        </span>
                      </span>
                      <span className="shrink-0 font-heading text-xs font-bold text-brand">
                        See more
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        )}
      </main>
    </div>
  );
}
