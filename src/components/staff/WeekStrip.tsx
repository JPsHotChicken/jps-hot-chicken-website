"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  HOME_WEEKS_AHEAD,
  HOME_WEEKS_BACK,
  addDays,
  formatShortDate,
  fromISODate,
  sundayWeekOf,
  toISODate,
  type DayKey,
  type TimeOffRequest,
} from "@/lib/schedule";
import { WeekLegend, WeekRow, useDayMarks } from "./WeekRow";

/** How many weeks either side of this one can be swiped to. */
export const WEEKS_BACK = HOME_WEEKS_BACK;
export const WEEKS_AHEAD = HOME_WEEKS_AHEAD;

type Props = {
  /** Today at the restaurant, `YYYY-MM-DD`. */
  todayISO: string;
  /** Every date this person has a published shift on. */
  workDates: string[];
  /** Their time-off requests; days still asked for (not declined) get a red ring. */
  timeOff?: TimeOffRequest[];
  /** Weekdays they have off every week — ringed red like a request. */
  recurringDays?: DayKey[];
  /**
   * Asked for the span of dates the strip can show, so the page can fetch any
   * work days it doesn't already have.
   */
  onRangeChange?: (fromISO: string, toISO: string) => void;
  /** When given, tapping a day hands it over, for a popup to show its shift. */
  onSelectDay?: (iso: string) => void;
};

/** "This week", "Last week", "Next week", or the dates for anything further. */
function weekLabel(offset: number, days: string[]): string {
  if (offset === 0) return "This week";
  if (offset === -1) return "Last week";
  if (offset === 1) return "Next week";
  return `${formatShortDate(fromISODate(days[0]))} – ${formatShortDate(fromISODate(days[6]))}`;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Sunday-to-Saturday weeks, one page each, swiped sideways. Opens on this
 * week. Every day is ringed green when they work it and gray when they don't;
 * today also gets a smaller solid blue circle inside its ring.
 *
 * Swiping is plain horizontal scrolling with snap points, so it feels native on
 * a phone and works with a trackpad; the arrows and dots do the same for a
 * mouse or keyboard, and say where you are.
 */
export function WeekStrip({
  todayISO,
  workDates,
  timeOff = [],
  recurringDays = [],
  onRangeChange,
  onSelectDay,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(WEEKS_BACK);
  // Hidden until it has been scrolled to this week, so it never flashes the
  // first page on the way.
  const [ready, setReady] = useState(false);

  const weeks = useMemo(
    () =>
      Array.from({ length: WEEKS_BACK + 1 + WEEKS_AHEAD }, (_, i) => {
        const offset = i - WEEKS_BACK;
        const days = sundayWeekOf(toISODate(addDays(fromISODate(todayISO), offset * 7)));
        return { offset, days, label: weekLabel(offset, days) };
      }),
    [todayISO],
  );
  const marks = useDayMarks(workDates, timeOff, recurringDays);

  useEffect(() => {
    onRangeChange?.(weeks[0].days[0], weeks[weeks.length - 1].days[6]);
  }, [onRangeChange, weeks]);

  // Land on this week before the first paint, and stay on whichever week is
  // showing if the card changes width.
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const settle = () => {
      el.scrollLeft = indexRef.current * el.clientWidth;
    };
    settle();
    setReady(true);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(settle);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== index) setIndex(Math.max(0, Math.min(weeks.length - 1, next)));
  };

  const goTo = useCallback(
    (target: number) => {
      const el = scroller.current;
      const clamped = Math.max(0, Math.min(weeks.length - 1, target));
      setIndex(clamped);
      el?.scrollTo?.({
        left: clamped * el.clientWidth,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    },
    [weeks.length],
  );

  const current = weeks[index];

  return (
    <div className="mt-5 border-t border-border pt-4">
      {/* Where you are, with arrows either side. */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          aria-label="Previous week"
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="size-5" />
        </button>
        <p aria-live="polite" className="text-sm font-bold">
          {current.label}
        </p>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={index === weeks.length - 1}
          aria-label="Next week"
          className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div
        ref={scroller}
        onScroll={onScroll}
        className={`flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          ready ? "" : "invisible"
        }`}
      >
        {weeks.map((week, weekIndex) => (
          <WeekRow
            key={week.days[0]}
            days={week.days}
            todayISO={todayISO}
            marks={marks}
            label={week.label}
            hidden={weekIndex !== index}
            onSelectDay={onSelectDay}
            className="w-full shrink-0 snap-start snap-always"
          />
        ))}
      </div>

      {/* One dot per week; the long one is the week on screen. */}
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {weeks.map((week, weekIndex) => (
          <button
            key={week.days[0]}
            type="button"
            onClick={() => goTo(weekIndex)}
            aria-label={`Show ${Math.abs(week.offset) <= 1 ? week.label.toLowerCase() : `the week of ${week.label}`}`}
            aria-current={weekIndex === index ? "true" : undefined}
            className={`h-1.5 rounded-full transition-all ${
              weekIndex === index
                ? "w-5 bg-foreground/70"
                : week.offset === 0
                  ? "w-1.5 bg-blue-600/60"
                  : "w-1.5 bg-gray-300 hover:bg-gray-400"
            }`}
          />
        ))}
      </div>

      <WeekLegend className="mt-3" />
    </div>
  );
}
