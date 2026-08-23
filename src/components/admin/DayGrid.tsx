"use client";

import { useEffect, useState } from "react";
import { Copy, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { employeeColors } from "@/lib/employee-colors";
import {
  DAY_KEYS,
  DAY_LABELS,
  HOURS,
  POSITION_ROWS,
  SLOTS,
  SLOTS_PER_HOUR,
  SLOT_COUNT,
  coverageBySlot,
  formatHourBlock,
  formatShortDate,
  formatSlotBlock,
  isClosedDay,
  type DayKey,
  type DaySchedule,
  type Employee,
} from "@/lib/schedule";

/**
 * The heat map's five filled shades, coldest first, with the empty look at
 * index 0. Reds are kept out of the per-person palette so a busy half hour
 * never reads as somebody's shift.
 */
const HEAT_STYLES = [
  "border-dashed border-border bg-muted/40 text-muted-foreground",
  "border-transparent bg-orange-100 text-orange-900",
  "border-transparent bg-orange-200 text-orange-950",
  "border-transparent bg-orange-300 text-orange-950",
  "border-transparent bg-orange-400 text-orange-950",
  "border-transparent bg-red-500 text-white",
];

/**
 * Which shade a half hour gets, scaled against the busiest one of the week so
 * the days can be compared with each other. A stretch nobody is on is always 0.
 */
function heatLevel(count: number, peak: number): number {
  if (count <= 0) return 0;
  if (peak <= 0) return HEAT_STYLES.length - 1;
  return Math.min(HEAT_STYLES.length - 1, Math.max(1, Math.ceil((count / peak) * 5)));
}

/** Position names on the left, then two half columns per hour. */
const COLUMNS = `112px repeat(${SLOT_COUNT}, minmax(38px, 1fr))`;

/**
 * The position column stays put while the hours scroll past it, and the hour
 * header stays put while the positions scroll under it — so a cell in the
 * middle of the grid can always be read off both axes.
 */
const STUCK_COLUMN = "sticky left-0 z-10 bg-background";

/**
 * The day reads as a row of hour cells: a white spacer parts one hour from the
 * next, and nothing parts the two halves inside an hour. Filling a single half
 * is still how a 10:30 start is drawn — the halves are separate targets, they
 * just aren't drawn as separate boxes.
 *
 * The rows carry no grid `gap`: a gap would push the tracks apart on every
 * column, and the tracks have to line up between the header, the heat map and
 * the grid. Margins move a cell inside its track and leave the track alone.
 */
const HOUR_GUTTER_PX = 2;

function hourGutter(slotIndex: number): string {
  return slotIndex % SLOTS_PER_HOUR === 0 ? "ml-0.5" : "";
}

/**
 * An empty hour is one dashed box. Each half rounds at the hour's outer edge
 * and drops its border where the two meet, so no line runs down the middle.
 */
function emptyHalf(slotIndex: number): string {
  return slotIndex % SLOTS_PER_HOUR === 0
    ? "rounded-l-sm rounded-r-none border-r-0"
    : "rounded-r-sm rounded-l-none border-l-0";
}

/**
 * The heat map keeps both halves boxed and adds a hairline between them: unlike
 * a shift, its two halves are separate numbers and would otherwise run together.
 */
function heatHalf(slotIndex: number): string {
  const [shape, gutter] =
    slotIndex % SLOTS_PER_HOUR === 0
      ? ["rounded-l-sm rounded-r-none", "ml-0.5"]
      : ["rounded-r-sm rounded-l-none", "ml-px"];
  return `${shape} ${gutter}`;
}

type Props = {
  day: DayKey;
  date: Date;
  schedule: DaySchedule;
  employees: Employee[];
  /** Busiest half hour of the whole week — the top of the heat map's scale. */
  peak: number;
  /** The block currently being edited, when it belongs to this day. */
  selection: CellRange | null;
  onEditRange: (range: CellRange, anchor: HTMLElement) => void;
  onCopyToDays: (from: DayKey, targets: DayKey[]) => void;
};

/** Inclusive rectangle of cells, always stored lowest-first. */
export type CellRange = { rowStart: number; rowEnd: number; slotStart: number; slotEnd: number };

function within(value: number, start: number, end: number): boolean {
  return value >= start && value <= end;
}

function inRange(range: CellRange | null, row: number, slot: number): boolean {
  return (
    range !== null &&
    within(row, range.rowStart, range.rowEnd) &&
    within(slot, range.slotStart, range.slotEnd)
  );
}

/** Build a normalised range from the two corners the user dragged between. */
function rangeBetween(
  a: { row: number; slot: number },
  b: { row: number; slot: number },
): CellRange {
  return {
    rowStart: Math.min(a.row, b.row),
    rowEnd: Math.max(a.row, b.row),
    slotStart: Math.min(a.slot, b.slot),
    slotEnd: Math.max(a.slot, b.slot),
  };
}

/** How many cells forward the same person keeps going, counting this one. */
function runLength(cells: (string | null)[], from: number): number {
  const id = cells[from];
  let length = 1;
  while (from + length < SLOT_COUNT && cells[from + length] === id) length++;
  return length;
}

/**
 * How far a name written at `from` may spill: to the end of its hour, or the end
 * of the shift. A half-hour cell has no room for a name, so each one is written
 * across the hour it starts in — and written again at the top of the next hour,
 * so scrolling into the middle of a long shift never shows a nameless bar.
 */
function labelSpan(cells: (string | null)[], from: number): number {
  return Math.min(SLOTS_PER_HOUR - (from % SLOTS_PER_HOUR), runLength(cells, from));
}

type Drag = {
  anchor: { row: number; slot: number };
  head: { row: number; slot: number };
  headEl: HTMLElement;
};

export function DayGrid({
  day,
  date,
  schedule,
  employees,
  peak,
  selection,
  onEditRange,
  onCopyToDays,
}: Props) {
  const [copyOpen, setCopyOpen] = useState(false);
  const [targets, setTargets] = useState<DayKey[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const closed = isClosedDay(day);
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const colorById = employeeColors(employees);
  const coverage = coverageBySlot(schedule);

  // Finish the drag wherever the pointer is released — including outside the
  // grid, so a stray release can't leave the day stuck in selection mode.
  useEffect(() => {
    if (!drag) return;

    const finish = () => {
      const { anchor, head, headEl } = drag;
      setDrag(null);
      // A press and release on one cell is a plain click, not a drag — leave
      // single cells to double-click so clicking around doesn't open the menu.
      if (anchor.row !== head.row || anchor.slot !== head.slot) {
        onEditRange(rangeBetween(anchor, head), headEl);
      }
    };

    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [drag, onEditRange]);

  // While dragging, show the live rectangle; otherwise show what's being edited.
  const highlight = drag ? rangeBetween(drag.anchor, drag.head) : selection;

  // You can't paste onto a day the store is closed, or onto the source day.
  const copyTargets = DAY_KEYS.filter((key) => key !== day && !isClosedDay(key));

  const toggleTarget = (key: DayKey) => {
    setTargets((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  };

  const applyCopy = () => {
    onCopyToDays(day, targets);
    setTargets([]);
    setCopyOpen(false);
  };

  return (
    <section className="rounded-xl border border-border bg-background shadow-sm">
      <header className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="font-heading text-base font-bold">
          {DAY_LABELS[day]}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {formatShortDate(date)}
          </span>
        </h3>
        {closed && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            Closed — everyone off
          </span>
        )}
      </header>

      {closed ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          The store is closed on {DAY_LABELS[day]}s, so no shifts can be scheduled.
        </p>
      ) : (
        // Scrolls on both axes so the pinned hour header and position column
        // have a scrollport of their own to stay put against. The cap is high
        // enough that a whole day fits outright on a normal screen, and only
        // short ones scroll the day inside its own card.
        <div className="max-h-[80vh] overflow-auto">
          {/* select-none so dragging across cells doesn't smear a text selection. */}
          <div className="min-w-max py-2 select-none">
            <div className="sticky top-0 z-20 mb-1.5 border-b border-border bg-background pb-1.5">
              {/* Hour header — each label sits over the two halves of its hour. */}
              <div className="grid" style={{ gridTemplateColumns: COLUMNS }}>
                <div aria-hidden className={STUCK_COLUMN} />
                {HOURS.map((hour, hourIndex) => {
                  // Lit up while a block covering any part of this hour is being
                  // dragged out, so the selection can be read off the axis.
                  const picked =
                    highlight !== null &&
                    highlight.slotStart <= hourIndex * SLOTS_PER_HOUR + SLOTS_PER_HOUR - 1 &&
                    highlight.slotEnd >= hourIndex * SLOTS_PER_HOUR;
                  return (
                    <div
                      key={hour}
                      style={{ gridColumn: `span ${SLOTS_PER_HOUR}` }}
                      className={`px-1 pb-1 text-center text-[0.65rem] font-bold tracking-wide uppercase ${
                        picked ? "rounded bg-brand/15 text-brand" : "text-muted-foreground"
                      }`}
                    >
                      {formatHourBlock(hour)}
                    </div>
                  );
                })}
              </div>

              {/* Heat map: how many people are on in each half hour. */}
              <div
                aria-label={`People on each half hour on ${DAY_LABELS[day]}`}
                className="grid"
                style={{ gridTemplateColumns: COLUMNS }}
              >
                <div
                  className={`flex items-center justify-center text-muted-foreground ${STUCK_COLUMN}`}
                  title="How many people are on in each half hour"
                >
                  <Users className="size-3.5" />
                </div>
                {SLOTS.map((minute, slotIndex) => {
                  const count = coverage[slotIndex] ?? 0;
                  const picked =
                    highlight !== null &&
                    within(slotIndex, highlight.slotStart, highlight.slotEnd);
                  return (
                    <div
                      key={minute}
                      title={`${count === 1 ? "1 person" : `${count} people`} on ${formatSlotBlock(slotIndex)}`}
                      className={`flex h-5 items-center justify-center border text-[0.65rem] font-bold tabular-nums ${heatHalf(slotIndex)} ${HEAT_STYLES[heatLevel(count, peak)]} ${
                        picked ? "ring-2 ring-brand ring-inset" : ""
                      }`}
                    >
                      {count}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* One row per position. */}
            {POSITION_ROWS.map((position, rowIndex) => (
              <div
                key={position.label}
                className={`grid ${
                  // A hairline between stations, so the five line spots read as
                  // one block rather than running into the fryers below them.
                  position.firstOfGroup && rowIndex > 0 ? "mt-1 border-t border-border pt-1" : ""
                }`}
                style={{ gridTemplateColumns: COLUMNS }}
              >
                <div
                  className={`flex items-center truncate pr-2 pl-2 text-[0.7rem] font-semibold ${STUCK_COLUMN} ${
                    highlight !== null && within(rowIndex, highlight.rowStart, highlight.rowEnd)
                      ? "text-brand"
                      : "text-muted-foreground"
                  }`}
                >
                  {position.label}
                </div>
                {SLOTS.map((minute, slotIndex) => {
                  const cells = schedule[rowIndex] ?? [];
                  const employeeId = cells[slotIndex] ?? null;
                  const employee = employeeId ? employeeById.get(employeeId) : undefined;
                  const selected = inRange(highlight, rowIndex, slotIndex);
                  const cell = { row: rowIndex, slot: slotIndex };

                  // A shift is drawn as one bar: square off the joins between
                  // its cells, and name it at its start and each hour after.
                  const startsRun = employeeId !== null && cells[slotIndex - 1] !== employeeId;
                  const endsRun = employeeId !== null && cells[slotIndex + 1] !== employeeId;
                  const named =
                    employeeId !== null && (startsRun || slotIndex % SLOTS_PER_HOUR === 0);
                  const span = named ? labelSpan(cells, slotIndex) : 1;

                  return (
                    <button
                      key={minute}
                      type="button"
                      title={`${DAY_LABELS[day]} ${formatSlotBlock(slotIndex)} · ${position.label} — double-click to assign, or drag across cells`}
                      onPointerDown={(event) => {
                        // Left button only; ignore right-click and middle-click.
                        if (event.button !== 0) return;
                        // Touch implicitly captures the pointer to this button,
                        // which would stop the cells we drag over from seeing it.
                        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                          event.currentTarget.releasePointerCapture(event.pointerId);
                        }
                        setDrag({ anchor: cell, head: cell, headEl: event.currentTarget });
                      }}
                      onPointerMove={(event) => {
                        const target = event.currentTarget;
                        setDrag((current) => {
                          if (!current) return null;
                          // Same cell as last time — return the identical object
                          // so React skips the re-render.
                          if (current.head.row === cell.row && current.head.slot === cell.slot) {
                            return current;
                          }
                          return { ...current, head: cell, headEl: target };
                        });
                      }}
                      onDoubleClick={(event) =>
                        onEditRange(rangeBetween(cell, cell), event.currentTarget)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onEditRange(rangeBetween(cell, cell), event.currentTarget);
                        }
                      }}
                      className={`relative h-8 border px-1 text-left text-xs font-semibold transition-colors ${
                        hourGutter(slotIndex)
                      } ${
                        employee
                          ? `border-transparent ${
                              colorById.get(employee.id)?.cell ?? "bg-muted"
                            } ${
                              // A shift is one bar: only its two ends are rounded.
                              startsRun ? "rounded-l-md" : "rounded-l-none"
                            } ${endsRun ? "rounded-r-md" : "rounded-r-none"}`
                          : `border-dashed border-border bg-muted/40 hover:bg-muted ${emptyHalf(slotIndex)}`
                      } ${selected ? "z-[2] ring-2 ring-brand ring-inset" : ""}`}
                    >
                      {named && employee && (
                        // Positioned so a name can spill over the other half of
                        // its hour; the 1px grid gap is added back in.
                        <span
                          style={{
                            width: `calc(${span * 100}% + ${
                              (span - 1) * HOUR_GUTTER_PX
                            }px - 0.5rem)`,
                          }}
                          className="pointer-events-none absolute inset-y-0 left-1 z-[1] truncate leading-8"
                        >
                          {employee.name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {!closed && (
        <footer className="relative border-t border-border px-4 py-2.5">
          <Button variant="outline" size="sm" onClick={() => setCopyOpen((open) => !open)}>
            <Copy data-icon="inline-start" />
            Copy {DAY_LABELS[day]} to…
          </Button>

          {copyOpen && (
            <div className="absolute bottom-full left-4 z-40 mb-2 w-60 rounded-lg border border-border bg-popover p-3 shadow-lg">
              <p className="mb-2 text-xs text-muted-foreground">
                Replace these days with {DAY_LABELS[day]}:
              </p>
              <ul className="space-y-1">
                {copyTargets.map((key) => (
                  <li key={key}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={targets.includes(key)}
                        onChange={() => toggleTarget(key)}
                        className="size-4 accent-brand"
                      />
                      {DAY_LABELS[key]}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={applyCopy} disabled={targets.length === 0}>
                  Replace {targets.length || ""}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTargets([]);
                    setCopyOpen(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </footer>
      )}
    </section>
  );
}
