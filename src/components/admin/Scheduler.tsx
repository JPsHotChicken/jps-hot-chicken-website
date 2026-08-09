"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Download, LogOut, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { logout } from "@/app/admin/actions";
import { getServerSnapshot, getSnapshot, subscribe, updateDoc } from "@/lib/schedule-storage";
import { exportSchedulePdf } from "@/lib/schedule-pdf";
import {
  DAY_KEYS,
  MAX_ROW_COUNT,
  MIN_ROW_COUNT,
  addDays,
  datesForWeek,
  formatWeekRange,
  fromISODate,
  makeEmptyDay,
  makeEmptyWeek,
  mondayOf,
  resizeWeek,
  toISODate,
  type DayKey,
  type Employee,
  type ShiftGroup,
  type WeekSchedule,
} from "@/lib/schedule";
import { CellEditor } from "./CellEditor";
import { DayGrid } from "./DayGrid";
import { EmployeePanel } from "./EmployeePanel";

type EditingCell = { day: DayKey; row: number; hour: number; el: HTMLElement };

export function Scheduler() {
  // `null` on the server and for the first client render — the schedule lives
  // in localStorage, so rendering it any earlier would mismatch the SSR'd HTML.
  const doc = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [weekStart, setWeekStart] = useState(() => toISODate(mondayOf()));
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [exporting, setExporting] = useState(false);

  const week: WeekSchedule = useMemo(
    () => doc?.weeks[weekStart] ?? makeEmptyWeek(doc?.rowCount ?? 0),
    [doc, weekStart],
  );

  const dates = useMemo(() => datesForWeek(weekStart), [weekStart]);

  /** Apply a change to the currently-selected week. */
  const updateWeek = useCallback(
    (mutate: (current: WeekSchedule) => WeekSchedule) => {
      updateDoc((current) => {
        const existing = current.weeks[weekStart] ?? makeEmptyWeek(current.rowCount);
        return { ...current, weeks: { ...current.weeks, [weekStart]: mutate(existing) } };
      });
    },
    [weekStart],
  );

  const setCell = useCallback(
    (day: DayKey, row: number, hour: number, employeeId: string | null) => {
      updateWeek((current) => ({
        ...current,
        [day]: current[day].map((cells, rowIndex) =>
          rowIndex === row
            ? cells.map((cell, hourIndex) => (hourIndex === hour ? employeeId : cell))
            : cells,
        ),
      }));
    },
    [updateWeek],
  );

  const copyDay = useCallback(
    (from: DayKey, targets: DayKey[]) => {
      updateWeek((current) => {
        const source = current[from];
        const next = { ...current };
        for (const target of targets) {
          // Deep copy so the days don't share row arrays.
          next[target] = source.map((row) => [...row]);
        }
        return next;
      });
    },
    [updateWeek],
  );

  const addEmployee = useCallback((name: string, group: ShiftGroup) => {
    const employee: Employee = { id: crypto.randomUUID(), name, group };
    updateDoc((current) => ({ ...current, employees: [...current.employees, employee] }));
  }, []);

  const removeEmployee = useCallback((id: string) => {
    updateDoc((current) => {
      // Clear the person out of every week, not just the visible one, so no
      // stale ids are left behind pointing at a deleted employee.
      const weeks = Object.fromEntries(
        Object.entries(current.weeks).map(([key, value]) => [
          key,
          Object.fromEntries(
            DAY_KEYS.map((day) => [
              day,
              value[day].map((row) => row.map((cell) => (cell === id ? null : cell))),
            ]),
          ) as WeekSchedule,
        ]),
      );
      return {
        ...current,
        employees: current.employees.filter((employee) => employee.id !== id),
        weeks,
      };
    });
  }, []);

  const changeRowCount = useCallback((delta: number) => {
    updateDoc((current) => {
      const rowCount = Math.max(MIN_ROW_COUNT, Math.min(MAX_ROW_COUNT, current.rowCount + delta));
      if (rowCount === current.rowCount) return current;
      const weeks = Object.fromEntries(
        Object.entries(current.weeks).map(([key, value]) => [key, resizeWeek(value, rowCount)]),
      );
      return { ...current, rowCount, weeks };
    });
  }, []);

  const shiftWeek = (deltaWeeks: number) => {
    setWeekStart(toISODate(addDays(fromISODate(weekStart), deltaWeeks * 7)));
  };

  const handleExport = async () => {
    if (!doc) return;
    setExporting(true);
    try {
      await exportSchedulePdf({
        week,
        employees: doc.employees,
        rowCount: doc.rowCount,
        weekStartISO: weekStart,
      });
    } catch (error) {
      console.error("[scheduler] PDF export failed:", error);
      alert("Sorry — the PDF couldn't be generated. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  if (!doc) {
    return (
      <div className="p-8 text-sm text-muted-foreground" role="status">
        Loading schedule…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      {/* Toolbar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="mr-auto">
            <h1 className="font-heading text-lg font-bold tracking-tight">Schedule maker</h1>
            <p className="text-xs text-muted-foreground">{formatWeekRange(weekStart)}</p>
          </div>

          {/* Week navigation */}
          <div className="flex items-center gap-1 rounded-lg border border-border p-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous week"
              onClick={() => shiftWeek(-1)}
            >
              <ChevronLeft />
            </Button>
            <label htmlFor="week-start" className="sr-only">
              Week starting
            </label>
            <input
              id="week-start"
              type="date"
              value={weekStart}
              // Snap whatever date is picked back to that week's Monday.
              onChange={(event) =>
                event.target.value &&
                setWeekStart(toISODate(mondayOf(fromISODate(event.target.value))))
              }
              className="rounded-md bg-transparent px-1 text-sm outline-none"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next week"
              onClick={() => shiftWeek(1)}
            >
              <ChevronRight />
            </Button>
          </div>

          {/* Rows per day */}
          <div className="flex items-center gap-1 rounded-lg border border-border p-1">
            <span className="px-1.5 text-xs text-muted-foreground">Rows</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Remove a row"
              onClick={() => changeRowCount(-1)}
              disabled={doc.rowCount <= MIN_ROW_COUNT}
            >
              <Minus />
            </Button>
            <span className="w-5 text-center text-sm font-semibold">{doc.rowCount}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Add a row"
              onClick={() => changeRowCount(1)}
              disabled={doc.rowCount >= MAX_ROW_COUNT}
            >
              <Plus />
            </Button>
          </div>

          <Button onClick={handleExport} disabled={exporting}>
            <Download data-icon="inline-start" />
            {exporting ? "Exporting…" : "Export PDF"}
          </Button>

          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:px-6 lg:flex-row-reverse lg:items-start">
        <EmployeePanel
          employees={doc.employees}
          onAdd={addEmployee}
          onRemove={removeEmployee}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {DAY_KEYS.map((day) => (
            <DayGrid
              key={day}
              day={day}
              date={dates[day]}
              schedule={week[day] ?? makeEmptyDay(doc.rowCount)}
              rowCount={doc.rowCount}
              employees={doc.employees}
              editingCell={
                editing?.day === day ? { row: editing.row, hour: editing.hour } : null
              }
              onEditCell={(row, hour, el) => setEditing({ day, row, hour, el })}
              onCopyToDays={copyDay}
            />
          ))}
        </div>
      </div>

      {editing && (
        <CellEditor
          anchorEl={editing.el}
          employees={doc.employees}
          selectedId={week[editing.day]?.[editing.row]?.[editing.hour] ?? null}
          onSelect={(employeeId) => {
            setCell(editing.day, editing.row, editing.hour, employeeId);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
