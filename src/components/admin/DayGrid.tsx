"use client";

import { useState } from "react";
import { Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DAY_KEYS,
  DAY_LABELS,
  HOURS,
  formatHour,
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
  editingCell: { row: number; hour: number } | null;
  onEditCell: (row: number, hour: number, cell: HTMLElement) => void;
  onCopyToDays: (from: DayKey, targets: DayKey[]) => void;
};

export function DayGrid({
  day,
  date,
  schedule,
  rowCount,
  employees,
  editingCell,
  onEditCell,
  onCopyToDays,
}: Props) {
  const [copyOpen, setCopyOpen] = useState(false);
  const [targets, setTargets] = useState<DayKey[]>([]);
  const closed = isClosedDay(day);
  const employeeById = new Map(employees.map((e) => [e.id, e]));

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
          <div className="min-w-max p-2">
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
                  {formatHour(hour)}
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
                  const isEditing =
                    editingCell?.row === rowIndex && editingCell?.hour === hourIndex;

                  return (
                    <button
                      key={hour}
                      type="button"
                      title={`${DAY_LABELS[day]} ${formatHour(hour)} — double-click to assign`}
                      onDoubleClick={(event) => onEditCell(rowIndex, hourIndex, event.currentTarget)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onEditCell(rowIndex, hourIndex, event.currentTarget);
                        }
                      }}
                      className={`h-8 truncate rounded border px-1 text-xs font-semibold transition-colors ${
                        employee
                          ? `border-transparent ${GROUP_CELL_STYLES[employee.group]}`
                          : "border-dashed border-border bg-muted/40 hover:bg-muted"
                      } ${isEditing ? "ring-2 ring-ring" : ""}`}
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
