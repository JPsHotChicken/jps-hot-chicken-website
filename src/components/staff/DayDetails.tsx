"use client";

import { useEffect, useRef } from "react";
import { CalendarOff, Clock, Repeat, Tag, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { roleColorClasses } from "@/lib/role-colors";
import {
  DAY_LABELS,
  TIME_OFF_STATUS_LABELS,
  coversDate,
  dayKeyOf,
  formatHours,
  formatOrdinalDate,
  formatRange,
  fromISODate,
  isClosedDay,
  rangeHours,
  type RecurringTimeOff,
  type StaffShiftDay,
  type TimeOffRequest,
} from "@/lib/schedule";

type Props = {
  date: string;
  todayISO: string;
  /** Their published shifts that day, if any. */
  shiftDay?: StaffShiftDay;
  timeOff: TimeOffRequest[];
  recurring: RecurringTimeOff[];
  onClose: () => void;
};

/**
 * Everything about one day, opened by tapping its circle on My schedule: the
 * date, the hours and role, and any time off asked for it. Sits at
 * the bottom of the screen on a phone, where a thumb can reach it, and in the
 * middle on anything wider.
 */
export function DayDetails({ date, todayISO, shiftDay, timeOff, recurring, onClose }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const weekday = DAY_LABELS[dayKeyOf(date)];
  const year = fromISODate(date).getFullYear();
  const shifts = shiftDay?.shifts ?? [];
  const requests = timeOff.filter(
    (request) => request.status !== "denied" && coversDate(request, date),
  );
  const weekly = recurring.find((entry) => entry.day === dayKeyOf(date));
  const closed = isClosedDay(dayKeyOf(date));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-details-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-t-2xl border border-border bg-background shadow-xl outline-none sm:rounded-2xl"
      >
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="flex-1">
            <p className="text-xs font-bold tracking-widest text-brand uppercase">
              {date === todayISO ? "Today" : weekday}
            </p>
            <h2 id="day-details-title" className="font-heading text-xl font-bold">
              {weekday}, {formatOrdinalDate(date)}
              <span className="text-base font-normal text-muted-foreground"> {year}</span>
            </h2>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </header>

        <div className="space-y-4 px-5 py-4 pb-8 sm:pb-5">
          {shifts.length > 0 ? (
            shifts.map((shift) => (
              <div
                key={`${shift.start}-${shift.end}`}
                className="space-y-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
              >
                <p className="flex items-center gap-2.5 text-lg font-bold tabular-nums">
                  <Clock aria-hidden className="size-4 shrink-0 text-emerald-700" />
                  {formatRange(shift)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {formatHours(rangeHours([shift]))} h
                  </span>
                </p>
                <p className="flex items-center gap-2.5 text-sm">
                  <Tag aria-hidden className="size-4 shrink-0 text-emerald-700" />
                  <span className="text-muted-foreground">Role</span>
                  {shift.role ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        roleColorClasses(shift.role.color).pill
                      }`}
                    >
                      {shift.role.name}
                    </span>
                  ) : (
                    <span className="font-semibold">No role assigned</span>
                  )}
                </p>
              </div>
            ))
          ) : (
            <p className="rounded-xl bg-muted px-4 py-4 text-base font-semibold text-muted-foreground">
              {closed ? "The restaurant is closed." : "You're not scheduled to work."}
            </p>
          )}

          {requests.map((request) => (
            <div
              key={request.id}
              className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 text-sm"
            >
              <CalendarOff aria-hidden className="mt-0.5 size-4 shrink-0 text-red-600" />
              <div className="min-w-0">
                <p className="font-semibold">
                  Requested off{" "}
                  <span className="font-normal text-muted-foreground">
                    · {TIME_OFF_STATUS_LABELS[request.status]}
                  </span>
                </p>
                {request.reason && (
                  <p className="text-xs break-words text-muted-foreground">{request.reason}</p>
                )}
              </div>
            </div>
          ))}

          {weekly && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 text-sm">
              <Repeat aria-hidden className="mt-0.5 size-4 shrink-0 text-red-600" />
              <div className="min-w-0">
                <p className="font-semibold">Off every {weekday}</p>
                {weekly.reason && (
                  <p className="text-xs break-words text-muted-foreground">{weekly.reason}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
