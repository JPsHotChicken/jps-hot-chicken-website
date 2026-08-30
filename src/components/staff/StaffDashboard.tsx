"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  FileText,
  LoaderCircle,
  LogOut,
  Send,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  staffLogout,
  loadPublishedWeekAction,
  myRequestsAction,
  requestTimeOffAction,
  scheduledDatesAction,
} from "@/app/staff/actions";
import {
  SHIFT_GROUP_LABELS,
  TIME_OFF_STATUS_LABELS,
  compareTimeOff,
  formatDateRange,
  formatWeekRange,
  requestDayCount,
  type Employee,
  type TimeOffRequest,
  type TimeOffStatus,
  type WeekSchedule,
} from "@/lib/schedule";
import { formatPayDate } from "@/lib/pay-stubs";
import { TimeOffCalendar } from "./TimeOffCalendar";
import { WeekSchedule as WeekScheduleView } from "./WeekSchedule";

const STATUS_BADGE: Record<TimeOffStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  denied: "bg-rose-100 text-rose-900",
};

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
  initialRequests: TimeOffRequest[];
  /** Days this person is on, over the span the page loaded up front. */
  initialScheduledDates: string[];
  /** What that span was, so the calendar only refetches when it leaves it. */
  scheduledRange: { from: string; to: string };
  /** Released stubs belonging to this person, newest pay date first. */
  payStubs: MyPayStub[];
};

export function StaffDashboard({
  employee,
  publishedWeeks,
  initialWeekStart,
  initialWeek,
  initialRequests,
  initialScheduledDates,
  scheduledRange,
  payStubs,
}: StaffDashboardProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [weeks, setWeeks] = useState<Record<string, WeekSchedule>>(
    initialWeekStart && initialWeek ? { [initialWeekStart]: initialWeek } : {},
  );
  const [requests, setRequests] = useState(initialRequests);
  const [scheduledDates, setScheduledDates] = useState(initialScheduledDates);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selection, setSelection] = useState<{ start: string; end: string } | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const index = weekStart ? publishedWeeks.findIndex((w) => w.weekStart === weekStart) : -1;
  const week = weekStart ? weeks[weekStart] : undefined;

  const goToWeek = async (target: string) => {
    setWeekStart(target);
    if (weeks[target]) return;
    setLoading(true);
    try {
      const loaded = await loadPublishedWeekAction(target);
      setWeeks((current) => ({ ...current, [target]: loaded }));
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

  const submitRequest = async () => {
    if (!selection) return;
    setSubmitting(true);
    setError(null);
    try {
      await requestTimeOffAction({
        startDate: selection.start,
        endDate: selection.end,
        reason,
      });
      setRequests(await myRequestsAction());
      setConfirmation(
        `Request sent for ${formatDateRange(selection.start, selection.end)}. Your manager will review it.`,
      );
      setSelection(null);
      setReason("");
    } catch (cause) {
      console.error("[staff] Could not file a request:", cause);
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Couldn't send that request. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const sorted = [...requests].sort(compareTimeOff);
  const selectedDays = selection
    ? requestDayCount({ startDate: selection.start, endDate: selection.end })
    : 0;

  return (
    <div className="min-h-screen bg-muted">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="mr-auto min-w-0">
            <h1 className="truncate font-heading text-lg font-bold tracking-tight">
              {employee.name}
            </h1>
            <p className="text-xs text-muted-foreground">{SHIFT_GROUP_LABELS[employee.group]}</p>
          </div>
          <form action={staffLogout}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </form>
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

      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:px-6">
        {/* ------------------------------------------------------- schedule */}
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
              <WeekScheduleView week={week} employeeId={employee.id} weekStart={weekStart} />
            )}
          </div>
        </section>

        {/* ------------------------------------------------------- calendar */}
        <section className="rounded-xl border border-border bg-background shadow-sm">
          <header className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 font-heading text-base font-bold">
              <CalendarDays className="size-4 text-brand" />
              Schedule
            </h2>
            {/* The same two marks the calendar draws, so the key and the grid
                can never say different things. */}
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="size-1.5 rounded-full bg-orange-500" />
                Scheduled days
              </span>
              <span className="flex items-center gap-1.5">
                <X aria-hidden strokeWidth={3.5} className="size-3 text-red-600" />
                Requested days off
              </span>
            </p>
          </header>

          <div className="space-y-3 p-4">
            <TimeOffCalendar
              requests={requests}
              scheduledDates={scheduledDates}
              selection={selection}
              onSelect={(next) => {
                setSelection(next);
                setConfirmation(null);
              }}
              onRangeChange={loadScheduled}
            />

            {selection && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                <p className="text-sm">
                  <span className="font-semibold">
                    {formatDateRange(selection.start, selection.end)}
                  </span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {selectedDays} {selectedDays === 1 ? "day" : "days"}
                  </span>
                </p>

                <label htmlFor="staff-reason" className="sr-only">
                  Reason
                </label>
                <input
                  id="staff-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Reason (optional)"
                  maxLength={200}
                  className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />

                <div className="flex gap-2">
                  <Button onClick={submitRequest} disabled={submitting}>
                    <Send data-icon="inline-start" />
                    {submitting ? "Sending…" : "Send request"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSelection(null);
                      setReason("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {confirmation && (
              <p
                role="status"
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
              >
                {confirmation}
              </p>
            )}
          </div>
        </section>

        {/* ----------------------------------------------------- my requests */}
        <section className="rounded-xl border border-border bg-background shadow-sm">
          <header className="border-b border-border px-4 py-3">
            <h2 className="font-heading text-base font-bold">
              My requests{" "}
              <span className="text-sm font-normal text-muted-foreground">({requests.length})</span>
            </h2>
          </header>

          <div className="p-4">
            {sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Requested days off will appear here.
              </p>
            ) : (
              <ul className="space-y-2">
                {sorted.map((request) => {
                  const days = requestDayCount(request);
                  return (
                    <li
                      key={request.id}
                      className="rounded-lg border border-border px-3 py-2.5 text-sm"
                    >
                      <div className="flex items-start gap-2">
                        <span className="min-w-0 flex-1 font-semibold">
                          {formatDateRange(request.startDate, request.endDate)}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${STATUS_BADGE[request.status]
                            }`}
                        >
                          {TIME_OFF_STATUS_LABELS[request.status]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {days} {days === 1 ? "day" : "days"}
                        <span className="mx-1">·</span>
                        asked on {formatDateRange(request.requestedAt, request.requestedAt)}
                      </p>
                      {request.reason && (
                        <p className="mt-1 text-xs break-words text-foreground/80">
                          {request.reason}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------- my pay stubs */}
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
      </main>
    </div>
  );
}
