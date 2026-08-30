"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import {
  calendarGrid,
  calendarStart,
  coversDate,
  monthGridStart,
  toISODate,
  type TimeOffRequest,
} from "@/lib/schedule";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

type Props = {
  /** Existing requests, drawn on the calendar so conflicts are obvious. */
  requests: TimeOffRequest[];
  /** Days this person is on, from the schedule the owner has published. */
  scheduledDates: string[];
  selection: { start: string; end: string } | null;
  onSelect: (selection: { start: string; end: string } | null) => void;
  /** The span now on screen, so days outside what's loaded can be fetched. */
  onRangeChange?: (fromISO: string, toISO: string) => void;
};

/** "August 2026", or "Aug – Sep 2026" when the six rows straddle two months. */
function spanLabel(first: Date, last: Date): string {
  const sameYear = first.getFullYear() === last.getFullYear();
  if (sameYear && first.getMonth() === last.getMonth()) {
    return first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  const start = first.toLocaleDateString(
    "en-US",
    sameYear ? { month: "short" } : { month: "short", year: "numeric" },
  );
  return `${start} – ${last.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
}

export function TimeOffCalendar({
  requests,
  scheduledDates,
  selection,
  onSelect,
  onRangeChange,
}: Props) {
  /**
   * The Monday the six rows start on. It opens two weeks before this one, which
   * leaves the current week in the middle and three weeks of what's coming
   * after it, rather than starting wherever the month happens to.
   */
  const [start, setStart] = useState(() => calendarStart());
  /** Null while that rolling window is showing; a month once they page away. */
  const [month, setMonth] = useState<Date | null>(null);
  /** First click of a range; the second click completes it. */
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const todayISO = toISODate(new Date());
  const days = useMemo(() => calendarGrid(start), [start]);
  const scheduled = useMemo(() => new Set(scheduledDates), [scheduledDates]);

  const firstISO = toISODate(days[0]);
  const lastISO = toISODate(days[days.length - 1]);

  // Paging to a month nobody has looked at yet needs its shifts fetching.
  useEffect(() => {
    onRangeChange?.(firstISO, lastISO);
  }, [firstISO, lastISO, onRangeChange]);

  // While picking, preview the range under the cursor.
  const preview =
    anchor && hovered
      ? { start: anchor <= hovered ? anchor : hovered, end: anchor <= hovered ? hovered : anchor }
      : selection;

  const inSelection = (iso: string) => Boolean(preview && iso >= preview.start && iso <= preview.end);

  /**
   * A declined request is not a day off — they are working it — so only the
   * ones still standing get a cross, the same rule the owner's grid follows.
   */
  const isRequestedOff = (iso: string) =>
    requests.some((request) => request.status !== "denied" && coversDate(request, iso));

  const handleClick = (iso: string) => {
    if (!anchor) {
      setAnchor(iso);
      onSelect({ start: iso, end: iso });
      return;
    }
    const start = anchor <= iso ? anchor : iso;
    const end = anchor <= iso ? iso : anchor;
    setAnchor(null);
    setHovered(null);
    onSelect({ start, end });
  };

  const stepMonth = (delta: number) => {
    const today = new Date();
    const base = month ?? new Date(today.getFullYear(), today.getMonth(), 1);
    const next = new Date(base.getFullYear(), base.getMonth() + delta, 1);
    setMonth(next);
    setStart(monthGridStart(next));
  };

  const backToThisWeek = () => {
    setMonth(null);
    setStart(calendarStart());
  };

  const label = month
    ? month.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : spanLabel(days[0], days[days.length - 1]);

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => stepMonth(-1)}
          aria-label="Previous month"
          className="rounded-md p-1.5 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ChevronLeft className="size-4" />
        </button>

        <p aria-live="polite" className="flex-1 text-center font-heading text-sm font-bold">
          {label}
        </p>

        {/* Only worth offering once they have paged off the current week. */}
        {month && (
          <button
            type="button"
            onClick={backToThisWeek}
            className="rounded-md px-2 py-1 font-heading text-xs font-bold text-brand hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Today
          </button>
        )}

        <button
          type="button"
          onClick={() => stepMonth(1)}
          aria-label="Next month"
          className="rounded-md p-1.5 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAY_INITIALS.map((initial, index) => (
          <div
            key={`${initial}-${index}`}
            aria-hidden
            className="pb-1 text-center text-[0.65rem] font-bold text-muted-foreground"
          >
            {initial}
          </div>
        ))}

        {days.map((date) => {
          const iso = toISODate(date);
          // Nothing is out of month while the rolling window is showing: half
          // the grid would be greyed out for no reason anybody would recognise.
          const otherMonth = month !== null && date.getMonth() !== month.getMonth();
          const past = iso < todayISO;
          const working = scheduled.has(iso);
          const requestedOff = isRequestedOff(iso);
          const selected = inSelection(iso);
          const isToday = iso === todayISO;

          const dayLabel = date.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          });

          return (
            <button
              key={iso}
              type="button"
              disabled={past}
              onClick={() => handleClick(iso)}
              onPointerEnter={() => anchor && setHovered(iso)}
              aria-pressed={selected}
              aria-label={
                dayLabel +
                (working ? ", scheduled to work" : "") +
                (requestedOff ? ", day off requested" : "")
              }
              className={`flex h-11 flex-col items-center justify-center rounded-md text-sm transition-colors ${
                selected
                  ? "bg-brand font-bold text-white"
                  : past
                    ? "text-muted-foreground/40"
                    : otherMonth
                      ? "text-muted-foreground/50 hover:bg-muted"
                      : "hover:bg-muted"
              } ${isToday && !selected ? "ring-1 ring-brand ring-inset" : ""} ${
                past ? "cursor-not-allowed" : ""
              }`}
            >
              <span className="leading-none">{date.getDate()}</span>
              {/* Always here, empty or not, so no row of days sits higher than
                  the one above it. */}
              <span aria-hidden className="mt-1 flex h-3 items-center justify-center gap-0.5">
                {working && (
                  <span
                    className={`size-1.5 rounded-full ${selected ? "bg-white" : "bg-orange-500"}`}
                  />
                )}
                {requestedOff && (
                  <X
                    strokeWidth={3.5}
                    className={`size-3 ${selected ? "text-white" : "text-red-600"}`}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {anchor
          ? "Now pick the last day — or click the same day again for a single day off."
          : "Click a day, then click the last day to ask for a range."}
      </p>
    </div>
  );
}
