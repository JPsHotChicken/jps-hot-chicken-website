"use client";

import { useState } from "react";
import {
  CalendarOff,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  LogOut,
  Send,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { staffLogout, loadPublishedWeekAction, myRequestsAction, requestTimeOffAction } from "@/app/staff/actions";
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
import { TimeOffCalendar } from "./TimeOffCalendar";
import { WeekSchedule as WeekScheduleView } from "./WeekSchedule";

const STATUS_BADGE: Record<TimeOffStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  denied: "bg-rose-100 text-rose-900",
};

export type StaffDashboardProps = {
  employee: Employee;
  /** Weeks the owner has published, soonest first. */
  publishedWeeks: { weekStart: string; publishedAt: string }[];
  initialWeekStart: string | null;
  initialWeek: WeekSchedule | null;
  initialRequests: TimeOffRequest[];
};

export function StaffDashboard({
  employee,
  publishedWeeks,
  initialWeekStart,
  initialWeek,
  initialRequests,
}: StaffDashboardProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [weeks, setWeeks] = useState<Record<string, WeekSchedule>>(
    initialWeekStart && initialWeek ? { [initialWeekStart]: initialWeek } : {},
  );
  const [requests, setRequests] = useState(initialRequests);
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

        {/* --------------------------------------------------- request days */}
        <section className="rounded-xl border border-border bg-background shadow-sm">
          <header className="border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 font-heading text-base font-bold">
              <CalendarOff className="size-4 text-brand" />
              Request days off
            </h2>
          </header>

          <div className="space-y-3 p-4">
            <TimeOffCalendar
              requests={requests}
              selection={selection}
              onSelect={(next) => {
                setSelection(next);
                setConfirmation(null);
              }}
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
                You haven&apos;t asked for any days off yet.
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
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${
                            STATUS_BADGE[request.status]
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
      </main>
    </div>
  );
}
