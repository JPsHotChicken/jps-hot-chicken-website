"use client";

import { useEffect, useState } from "react";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DAY_KEYS,
  DAY_LABELS,
  HOURS,
  formatHourBlock,
  formatShortDate,
  isClosedDay,
  type DayKey,
  type DaySchedule,
  type Employee,
  type ShiftGroup,
} from "@/lib/schedule";

/** Cell tint by shift group, so the week reads at a glance. */
const GROUP_CELL_STYLES: Record<ShiftGroup, string> = {
  morning: "bg-amber-100 text-amber-950 hover:bg-amber-200",
  night: "bg-indigo-100 text-indigo-950 hover:bg-indigo-200",
  other: "bg-emerald-100 text-emerald-950 hover:bg-emerald-200",
};

type Props = {
  day: DayKey;
  date: Date;
  schedule: DaySchedule;
  rowCount: number;
  employees: Employee[];
  /** The block currently being edited, when it belongs to this day. */
  selection: CellRange | null;
  onEditRange: (range: CellRange, anchor: HTMLElement) => void;
  onCopyToDays: (from: DayKey, targets: DayKey[]) => void;
};

/** Inclusive rectangle of cells, always stored lowest-first. */
export type CellRange = { rowStart: number; rowEnd: number; hourStart: number; hourEnd: number };

function within(value: number, start: number, end: number): boolean {
  return value >= start && value <= end;
}

function inRange(range: CellRange | null, row: number, hour: number): boolean {
  return (
    range !== null &&
    within(row, range.rowStart, range.rowEnd) &&
    within(hour, range.hourStart, range.hourEnd)
  );
}

/** Build a normalised range from the two corners the user dragged between. */
function rangeBetween(
  a: { row: number; hour: number },
  b: { row: number; hour: number },
): CellRange {
  return {
    rowStart: Math.min(a.row, b.row),
    rowEnd: Math.max(a.row, b.row),
    hourStart: Math.min(a.hour, b.hour),
    hourEnd: Math.max(a.hour, b.hour),
  };
}

type Drag = {
  anchor: { row: number; hour: number };
  head: { row: number; hour: number };
  headEl: HTMLElement;
};

export function DayGrid({
  day,
  date,
  schedule,
  rowCount,
  employees,
  selection,
  onEditRange,
  onCopyToDays,
}: Props) {
  const [copyOpen, setCopyOpen] = useState(false);
  const [targets, setTargets] = useState<DayKey[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const closed = isClosedDay(day);
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  // Finish the drag wherever the pointer is released — including outside the
  // grid, so a stray release can't leave the day stuck in selection mode.
  useEffect(() => {
    if (!drag) return;

    const finish = () => {
      const { anchor, head, headEl } = drag;
      setDrag(null);
      // A press and release on one cell is a plain click, not a drag — leave
      // single cells to double-click so clicking around doesn't open the menu.
      if (anchor.row !== head.row || anchor.hour !== head.hour) {
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
        <div className="overflow-x-auto">
          {/* select-none so dragging across cells doesn't smear a text selection. */}
          <div className="min-w-max p-2 select-none">
            {/* Hour header */}
            <div
              className="grid gap-px"
              style={{ gridTemplateColumns: `36px repeat(${HOURS.length}, minmax(68px, 1fr))` }}
            >
              <div aria-hidden />
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="px-1 pb-1 text-center text-[0.65rem] font-bold tracking-wide text-muted-foreground uppercase"
                >
                  {formatHourBlock(hour)}
                </div>
              ))}
            </div>

            {/* Rows */}
            {Array.from({ length: rowCount }, (_, rowIndex) => (
              <div
                key={rowIndex}
                className="grid gap-px"
                style={{ gridTemplateColumns: `36px repeat(${HOURS.length}, minmax(68px, 1fr))` }}
              >
                <div className="flex items-center justify-center text-xs font-semibold text-muted-foreground">
                  {rowIndex + 1}
                </div>
                {HOURS.map((hour, hourIndex) => {
                  const employeeId = schedule[rowIndex]?.[hourIndex] ?? null;
                  const employee = employeeId ? employeeById.get(employeeId) : undefined;
                  const selected = inRange(highlight, rowIndex, hourIndex);
                  const cell = { row: rowIndex, hour: hourIndex };

                  return (
                    <button
                      key={hour}
                      type="button"
                      title={`${DAY_LABELS[day]} ${formatHourBlock(hour)} — double-click to assign, or drag across cells`}
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
                          if (current.head.row === cell.row && current.head.hour === cell.hour) {
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
                      className={`h-8 truncate rounded border px-1 text-xs font-semibold transition-colors ${
                        employee
                          ? `border-transparent ${GROUP_CELL_STYLES[employee.group]}`
                          : "border-dashed border-border bg-muted/40 hover:bg-muted"
                      } ${selected ? "ring-2 ring-brand ring-inset" : ""}`}
                    >
                      {employee?.name ?? ""}
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
