"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, LogOut, Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { logout } from "@/app/admin/actions";
import { getServerSnapshot, getSnapshot, subscribe, updateDoc } from "@/lib/schedule-storage";
import { exportSchedulePdf, type ExportScope } from "@/lib/schedule-pdf";
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
import { DayGrid, type CellRange } from "./DayGrid";
import { EmployeePanel } from "./EmployeePanel";
import { ExportMenu } from "./ExportMenu";

type Editing = { day: DayKey; range: CellRange; el: HTMLElement };

/** Every cell id inside an inclusive range, row-major. */
function cellsIn(week: WeekSchedule, day: DayKey, range: CellRange): (string | null)[] {
  const cells: (string | null)[] = [];
  for (let row = range.rowStart; row <= range.rowEnd; row++) {
    for (let hour = range.hourStart; hour <= range.hourEnd; hour++) {
      cells.push(week[day]?.[row]?.[hour] ?? null);
    }
  }
  return cells;
}

export function Scheduler() {
  // `null` on the server and for the first client render — the schedule lives
  // in localStorage, so rendering it any earlier would mismatch the SSR'd HTML.
  const doc = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [weekStart, setWeekStart] = useState(() => toISODate(mondayOf()));
  const [editing, setEditing] = useState<Editing | null>(null);
  const [exporting, setExporting] = useState(false);
  const weekPickerRef = useRef<HTMLInputElement>(null);

  const week: WeekSchedule = useMemo(
    () => doc?.weeks[weekStart] ?? makeEmptyWeek(doc?.rowCount ?? 0),
    [doc, weekStart],
  );

  const dates = useMemo(() => datesForWeek(weekStart), [weekStart]);

  /** Who currently occupies the block being edited — drives the ticked entry. */
  const selectedCells = useMemo(
    () => (editing ? cellsIn(week, editing.day, editing.range) : []),
    [editing, week],
  );

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

  /** Assign (or clear, with `null`) every cell in a dragged block at once. */
  const setRange = useCallback(
    (day: DayKey, range: CellRange, employeeId: string | null) => {
      updateWeek((current) => ({
        ...current,
        [day]: current[day].map((cells, rowIndex) =>
          rowIndex >= range.rowStart && rowIndex <= range.rowEnd
            ? cells.map((cell, hourIndex) =>
                hourIndex >= range.hourStart && hourIndex <= range.hourEnd ? employeeId : cell,
              )
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

  /**
   * Open the native date picker for the hidden input. It stays uncontrolled and
   * is re-seeded here, so picking a day inside the week already on screen (which
   * leaves `weekStart` unchanged) can't leave the two out of step.
   */
  const openWeekPicker = () => {
    const input = weekPickerRef.current;
    if (!input) return;
    input.value = weekStart;
    try {
      input.showPicker();
    } catch {
      // Older browsers, or a picker the browser refused to open on its own.
      input.focus();
      input.click();
    }
  };

  const handleExport = async (scope: ExportScope) => {
    if (!doc) return;
    setExporting(true);
    try {
      await exportSchedulePdf({
        week,
        employees: doc.employees,
        rowCount: doc.rowCount,
        weekStartISO: weekStart,
        scope,
      });
    } catch (error) {
      console.error("[scheduler] PDF export failed:", error);
      alert("Sorry — the export didn't finish. Please try again.");
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
            <p className="text-xs text-muted-foreground">Monday – Sunday</p>
          </div>

          {/* Week navigation — the control shows the whole week, not one date. */}
          <div className="flex items-center gap-1 rounded-lg border border-border p-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous week"
              onClick={() => shiftWeek(-1)}
            >
              <ChevronLeft />
            </Button>
            <div className="relative">
              <button
                type="button"
                onClick={openWeekPicker}
                aria-label={`Week of ${formatWeekRange(weekStart)} — pick a different week`}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold whitespace-nowrap hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <CalendarDays className="size-3.5 text-muted-foreground" />
                {formatWeekRange(weekStart)}
              </button>
              {/* The native picker itself: any day picked snaps to its Monday,
                  so the button above always reads as a whole week. */}
              <input
                ref={weekPickerRef}
                type="date"
                defaultValue={weekStart}
                onChange={(event) => {
                  if (!event.target.value) return;
                  setWeekStart(toISODate(mondayOf(fromISODate(event.target.value))));
                }}
                tabIndex={-1}
                aria-hidden
                className="pointer-events-none absolute inset-0 size-full opacity-0"
              />
            </div>
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

          <ExportMenu
            employees={doc.employees}
            exporting={exporting}
            onExport={handleExport}
          />

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
          week={week}
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
              selection={editing?.day === day ? editing.range : null}
              onEditRange={(range, el) => setEditing({ day, range, el })}
              onCopyToDays={copyDay}
            />
          ))}
        </div>
      </div>

      {editing && (
        <CellEditor
          anchorEl={editing.el}
          employees={doc.employees}
          cellCount={selectedCells.length}
          // `undefined` when the block holds a mix of people — nothing is ticked.
          selectedId={
            selectedCells.every((cell) => cell === selectedCells[0]) ? selectedCells[0] : undefined
          }
          onSelect={(employeeId) => {
            setRange(editing.day, editing.range, employeeId);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
