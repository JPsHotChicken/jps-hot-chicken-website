"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  addDays,
  coversDate,
  toISODate,
  type TimeOffRequest,
  type TimeOffStatus,
} from "@/lib/schedule";

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];

/** Dot colour per status, matching the badges in the list below the calendar. */
const STATUS_DOT: Record<TimeOffStatus, string> = {
  pending: "bg-amber-500",
  approved: "bg-emerald-500",
  denied: "bg-rose-500",
};

type Props = {
  /** Existing requests, drawn on the calendar so conflicts are obvious. */
  requests: TimeOffRequest[];
  selection: { start: string; end: string } | null;
  onSelect: (selection: { start: string; end: string } | null) => void;
};

/** Every date shown for `month`, padded to whole Monday-start weeks. */
function gridFor(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // Monday-start offset.
  const start = addDays(first, -lead);
  // Six rows always, so the calendar doesn't jump height between months.
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function TimeOffCalendar({ requests, selection, onSelect }: Props) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  /** First click of a range; the second click completes it. */
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const todayISO = toISODate(new Date());
  const days = useMemo(() => gridFor(month), [month]);

  // While picking, preview the range under the cursor.
  const preview =
    anchor && hovered
      ? { start: anchor <= hovered ? anchor : hovered, end: anchor <= hovered ? hovered : anchor }
      : selection;

  const inSelection = (iso: string) => Boolean(preview && iso >= preview.start && iso <= preview.end);

  const requestOn = (iso: string) => requests.find((request) => coversDate(request, iso));

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

  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          aria-label="Previous month"
          className="rounded-md p-1.5 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ChevronLeft className="size-4" />
        </button>
        <p aria-live="polite" className="font-heading text-sm font-bold">
          {monthLabel}
        </p>
        <button
          type="button"
          onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
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
          const otherMonth = date.getMonth() !== month.getMonth();
          const past = iso < todayISO;
          const existing = requestOn(iso);
          const selected = inSelection(iso);
          const isToday = iso === todayISO;

          return (
            <button
              key={iso}
              type="button"
              disabled={past}
              onClick={() => handleClick(iso)}
              onPointerEnter={() => anchor && setHovered(iso)}
              aria-pressed={selected}
              aria-label={date.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              className={`relative flex h-10 flex-col items-center justify-center rounded-md text-sm transition-colors ${
                selected
                  ? "bg-brand font-bold text-white"
                  : past
                    ? "text-muted-foreground/30"
                    : otherMonth
                      ? "text-muted-foreground/50 hover:bg-muted"
                      : "hover:bg-muted"
              } ${isToday && !selected ? "ring-1 ring-brand ring-inset" : ""} ${
                past ? "cursor-not-allowed" : ""
              }`}
            >
              {date.getDate()}
              {existing && (
                <span
                  aria-hidden
                  className={`absolute bottom-1 size-1.5 rounded-full ${
                    selected ? "bg-white" : STATUS_DOT[existing.status]
                  }`}
                />
              )}
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
