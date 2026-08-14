"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  LoaderCircle,
  LogOut,
  Minus,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { logout } from "@/app/admin/actions";
import {
  addEmployeeAction,
  addRecurringTimeOffAction,
  addTimeOffAction,
  assignBlockAction,
  copyDayAction,
  copyWeekAction,
  loadWeekAction,
  publishStateAction,
  publishWeekAction,
  regenerateLoginCodeAction,
  reloadAction,
  removeEmployeeAction,
  removeRecurringTimeOffAction,
  removeTimeOffAction,
  setRowCountAction,
  setTimeOffStatusAction,
} from "@/app/admin/schedule-actions";
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
  type RecurringTimeOff,
  type ShiftGroup,
  type TimeOffRequest,
  type TimeOffStatus,
  type WeekSchedule,
} from "@/lib/schedule";
import { CellEditor } from "./CellEditor";
import { DayGrid, type CellRange } from "./DayGrid";
import { EmployeePanel } from "./EmployeePanel";
import { ExportMenu } from "./ExportMenu";
import { GoLiveButton, type PublishState } from "./GoLiveButton";
import {
  TimeOffPanel,
  type NewRecurringTimeOff,
  type NewTimeOffRequest,
} from "./TimeOffPanel";

type Editing = { day: DayKey; range: CellRange; el: HTMLElement };

export type SchedulerProps = {
  rowCount: number;
  employees: Employee[];
  timeOff: TimeOffRequest[];
  recurringTimeOff: RecurringTimeOff[];
  /** Monday of the week the page was opened on. */
  weekStart: string;
  week: WeekSchedule;
  /** Whether that week has been sent to staff, and whether it has drifted since. */
  publishState: PublishState;
};

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

/**
 * The schedule maker.
 *
 * Data lives in Supabase and is reached only through the Server Actions in
 * `schedule-actions.ts`. Edits are applied to local state first and saved in the
 * background — dragging across a row of cells has to feel instant, and waiting
 * on a round trip per cell would not. If a save fails, the banner says so and
 * the whole week is re-read from the database, so what's on screen is never
 * quietly out of step with what's stored.
 */
export function Scheduler({
  rowCount: initialRowCount,
  employees: initialEmployees,
  timeOff: initialTimeOff,
  recurringTimeOff: initialRecurring,
  weekStart: initialWeekStart,
  week: initialWeek,
  publishState: initialPublishState,
}: SchedulerProps) {
  const [rowCount, setRowCount] = useState(initialRowCount);
  const [employees, setEmployees] = useState(initialEmployees);
  const [timeOff, setTimeOff] = useState(initialTimeOff);
  const [recurring, setRecurring] = useState(initialRecurring);
  const [weeks, setWeeks] = useState<Record<string, WeekSchedule>>({
    [initialWeekStart]: initialWeek,
  });

  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [exporting, setExporting] = useState(false);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishState, setPublishState] = useState(initialPublishState);
  const [publishing, setPublishing] = useState(false);
  const weekPickerRef = useRef<HTMLInputElement>(null);
  const pendingWeek = useRef(initialWeekStart);

  const week = weeks[weekStart] ?? makeEmptyWeek(rowCount);
  const dates = useMemo(() => datesForWeek(weekStart), [weekStart]);

  /** Pull the database's version of everything back into state. */
  const reload = useCallback(async (forWeek: string) => {
    const fresh = await reloadAction(forWeek);
    setRowCount(fresh.rowCount);
    setEmployees(fresh.employees);
    setTimeOff(fresh.timeOff);
    setRecurring(fresh.recurringTimeOff);
    // Drop the rest of the cache: other weeks may have been touched too, and
    // they will be re-read when navigated to.
    setWeeks({ [forWeek]: fresh.week });
  }, []);

  /**
   * Run a save. On failure the optimistic edit is thrown away and the week is
   * re-read, so a rejected change never lingers on screen looking saved.
   */
  const save = useCallback(
    async (description: string, action: () => Promise<void>) => {
      try {
        await action();
      } catch (cause) {
        console.error(`[scheduler] Could not ${description}:`, cause);
        setError(`Couldn't ${description}. That change wasn't saved.`);
        try {
          await reload(weekStart);
        } catch (reloadCause) {
          console.error("[scheduler] Reload after a failed save also failed:", reloadCause);
          setError(
            `Couldn't ${description}, and reloading failed too. ` +
              "Check your connection and refresh the page.",
          );
        }
      }
    },
    [reload, weekStart],
  );

  /**
   * Any edit to the grid puts it ahead of what staff can see, so the Go Live
   * button has to stop claiming the week is up to date. Marking it dirty rather
   * than re-comparing against the database keeps editing free of round trips;
   * the exact comparison happens again whenever the week is (re)loaded.
   */
  const markDirty = useCallback(() => {
    setPublishState((current) =>
      current.hasUnpublishedChanges ? current : { ...current, hasUnpublishedChanges: true },
    );
  }, []);

  const refreshPublishState = useCallback(async (target: string) => {
    try {
      setPublishState(await publishStateAction(target));
    } catch (cause) {
      console.error(`[scheduler] Could not read publish state for ${target}:`, cause);
    }
  }, []);

  /**
   * Move to a week, reading it from the database the first time it's needed —
   * only the week the page opened on arrives with the page.
   *
   * `pendingWeek` tracks the most recent destination so a slow read for a week
   * the owner has already navigated away from can't clear the wrong spinner or
   * report a stale error.
   */
  const goToWeek = useCallback(
    async (target: string) => {
      setWeekStart(target);
      setEditing(null);
      void refreshPublishState(target);
      if (weeks[target]) return;

      pendingWeek.current = target;
      setLoadingWeek(true);
      try {
        const loaded = await loadWeekAction(target, rowCount);
        setWeeks((current) => ({ ...current, [target]: loaded }));
      } catch (cause) {
        console.error(`[scheduler] Could not load ${target}:`, cause);
        if (pendingWeek.current === target) {
          setError(`Couldn't load ${formatWeekRange(target)}.`);
        }
      } finally {
        if (pendingWeek.current === target) setLoadingWeek(false);
      }
    },
    [rowCount, weeks, refreshPublishState],
  );

  /** Apply a change to one week in the local cache. */
  const patchWeek = useCallback(
    (target: string, mutate: (current: WeekSchedule) => WeekSchedule) => {
      setWeeks((current) => ({
        ...current,
        [target]: mutate(current[target] ?? makeEmptyWeek(rowCount)),
      }));
    },
    [rowCount],
  );

  /** Assign (or clear, with `null`) every cell in a dragged block at once. */
  const setRange = useCallback(
    (day: DayKey, range: CellRange, employeeId: string | null) => {
      patchWeek(weekStart, (current) => ({
        ...current,
        [day]: current[day].map((cells, rowIndex) =>
          rowIndex >= range.rowStart && rowIndex <= range.rowEnd
            ? cells.map((cell, hourIndex) =>
                hourIndex >= range.hourStart && hourIndex <= range.hourEnd ? employeeId : cell,
              )
            : cells,
        ),
      }));
      markDirty();
      void save("save that shift", () => assignBlockAction(weekStart, day, range, employeeId));
    },
    [markDirty, patchWeek, save, weekStart],
  );

  const copyDay = useCallback(
    (from: DayKey, targets: DayKey[]) => {
      patchWeek(weekStart, (current) => {
        const source = current[from];
        const next = { ...current };
        // Deep copy so the days don't share row arrays.
        for (const target of targets) next[target] = source.map((row) => [...row]);
        return next;
      });
      markDirty();
      void save("copy that day", () => copyDayAction(weekStart, from, targets));
    },
    [markDirty, patchWeek, save, weekStart],
  );

  const addEmployee = useCallback(
    (name: string, group: ShiftGroup) => {
      void save("add that employee", async () => {
        const employee = await addEmployeeAction(name, group);
        setEmployees((current) => [...current, employee]);
      });
    },
    [save],
  );

  const removeEmployee = useCallback(
    (id: string) => {
      setEmployees((current) => current.filter((employee) => employee.id !== id));
      // Their shifts and time off cascade away in the database; clear the local
      // copies too so nothing on screen points at somebody who is gone.
      setTimeOff((current) => current.filter((request) => request.employeeId !== id));
      setRecurring((current) => current.filter((entry) => entry.employeeId !== id));
      setWeeks((current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, value]) => [
            key,
            Object.fromEntries(
              DAY_KEYS.map((day) => [
                day,
                value[day].map((row) => row.map((cell) => (cell === id ? null : cell))),
              ]),
            ) as WeekSchedule,
          ]),
        ),
      );
      markDirty();
      void save("remove that employee", () => removeEmployeeAction(id));
    },
    [markDirty, save],
  );

  /** Issue a fresh sign-in code, e.g. when somebody forgets theirs. */
  const regenerateCode = useCallback(
    (id: string) => {
      void save("issue a new code", async () => {
        const loginCode = await regenerateLoginCodeAction(id);
        setEmployees((current) =>
          current.map((employee) => (employee.id === id ? { ...employee, loginCode } : employee)),
        );
      });
    },
    [save],
  );

  const changeRowCount = useCallback(
    (delta: number) => {
      const next = Math.max(MIN_ROW_COUNT, Math.min(MAX_ROW_COUNT, rowCount + delta));
      if (next === rowCount) return;
      setRowCount(next);
      setWeeks((current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, value]) => [key, resizeWeek(value, next)]),
        ),
      );
      markDirty();
      void save("change the row count", async () => {
        await setRowCountAction(next);
      });
    },
    [markDirty, rowCount, save],
  );

  /** Send the visible week to every employee's `/staff` schedule. */
  const publish = async () => {
    setPublishing(true);
    try {
      const publishedAt = await publishWeekAction(weekStart);
      setPublishState({ publishedAt, hasUnpublishedChanges: false });
    } catch (cause) {
      console.error("[scheduler] Could not publish the week:", cause);
      setError("Couldn't send that week to your staff. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  const shiftWeek = (deltaWeeks: number) => {
    void goToWeek(toISODate(addDays(fromISODate(weekStart), deltaWeeks * 7)));
  };

  /**
   * Duplicate the whole visible week into the one after it, then follow it
   * there. Overwriting a week that already has shifts on it asks first — that
   * is somebody's schedule, and there is no undo.
   */
  const copyWeekToNext = async () => {
    const target = toISODate(addDays(fromISODate(weekStart), 7));

    let existing = weeks[target];
    if (!existing) {
      // Has to be checked against the database, not just the cache — otherwise
      // an unvisited week would look empty and get overwritten without asking.
      try {
        existing = await loadWeekAction(target, rowCount);
      } catch (cause) {
        console.error(`[scheduler] Could not check ${target} before copying:`, cause);
        setError(`Couldn't check whether ${formatWeekRange(target)} is empty. Nothing was copied.`);
        return;
      }
    }

    const occupied = DAY_KEYS.some((day) =>
      existing[day]?.some((row) => row.some((cell) => cell !== null)),
    );
    if (
      occupied &&
      !confirm(
        `${formatWeekRange(target)} already has shifts on it.\n\n` +
          "Replace that week with this one?",
      )
    ) {
      return;
    }

    const source = weeks[weekStart] ?? makeEmptyWeek(rowCount);
    // Deep copy, or the two weeks would share row arrays and edit together.
    const copy = Object.fromEntries(
      DAY_KEYS.map((day) => [day, (source[day] ?? []).map((row) => [...row])]),
    ) as WeekSchedule;

    setWeeks((current) => ({ ...current, [target]: copy }));
    setWeekStart(target);
    await save("copy the week", () => copyWeekAction(weekStart, target));
    // The week we've landed on has its own publish history, not this one's.
    await refreshPublishState(target);
  };

  /* -------------------------------------------------------------- time off */

  const addTimeOffRequest = useCallback(
    (input: NewTimeOffRequest) => {
      void save("add that request", async () => {
        const request = await addTimeOffAction(input);
        setTimeOff((current) => [...current, request]);
      });
    },
    [save],
  );

  const setTimeOffStatus = useCallback(
    (id: string, status: TimeOffStatus) => {
      setTimeOff((current) =>
        current.map((request) => (request.id === id ? { ...request, status } : request)),
      );
      void save("update that request", () => setTimeOffStatusAction(id, status));
    },
    [save],
  );

  const removeTimeOffRequest = useCallback(
    (id: string) => {
      setTimeOff((current) => current.filter((request) => request.id !== id));
      void save("delete that request", () => removeTimeOffAction(id));
    },
    [save],
  );

  const addRecurringTimeOff = useCallback(
    (input: NewRecurringTimeOff) => {
      void save("add that recurring time off", async () => {
        const entry = await addRecurringTimeOffAction(input);
        // Adding a weekday somebody already has updates it in place rather than
        // inserting a second row, so match on id instead of always appending.
        setRecurring((current) =>
          current.some((existing) => existing.id === entry.id)
            ? current.map((existing) => (existing.id === entry.id ? entry : existing))
            : [...current, entry],
        );
      });
    },
    [save],
  );

  const removeRecurringTimeOff = useCallback(
    (id: string) => {
      setRecurring((current) => current.filter((entry) => entry.id !== id));
      void save("remove that recurring time off", () => removeRecurringTimeOffAction(id));
    },
    [save],
  );

  /* ---------------------------------------------------------------- export */

  const handleExport = async (scope: ExportScope) => {
    setExporting(true);
    try {
      await exportSchedulePdf({ week, employees, rowCount, weekStartISO: weekStart, scope });
    } catch (cause) {
      console.error("[scheduler] PDF export failed:", cause);
      setError("The export didn't finish. Please try again.");
    } finally {
      setExporting(false);
    }
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

  /** Selected cells drive the ticked entry in the editor. */
  const selectedCells = editing ? cellsIn(week, editing.day, editing.range) : [];

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
                {loadingWeek ? (
                  <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <CalendarDays className="size-3.5 text-muted-foreground" />
                )}
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
                  void goToWeek(toISODate(mondayOf(fromISODate(event.target.value))));
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

          <Button
            variant="outline"
            size="sm"
            onClick={copyWeekToNext}
            title="Copy every shift on this week into the following week, and go there"
          >
            <CopyPlus data-icon="inline-start" />
            Copy to next week
          </Button>

          {/* Rows per day */}
          <div className="flex items-center gap-1 rounded-lg border border-border p-1">
            <span className="px-1.5 text-xs text-muted-foreground">Rows</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Remove a row"
              onClick={() => changeRowCount(-1)}
              disabled={rowCount <= MIN_ROW_COUNT}
            >
              <Minus />
            </Button>
            <span className="w-5 text-center text-sm font-semibold">{rowCount}</span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Add a row"
              onClick={() => changeRowCount(1)}
              disabled={rowCount >= MAX_ROW_COUNT}
            >
              <Plus />
            </Button>
          </div>

          <ExportMenu employees={employees} exporting={exporting} onExport={handleExport} />

          <GoLiveButton state={publishState} publishing={publishing} onPublish={publish} />

          <form action={logout}>
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
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss"
              onClick={() => setError(null)}
            >
              <X />
            </Button>
          </div>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:px-6 lg:flex-row-reverse lg:items-start">
        {/* Sidebar: employees, then time off to its right once there's room. */}
        <div className="flex w-full shrink-0 flex-col gap-4 lg:w-72 xl:w-[33rem] xl:flex-row xl:items-start">
          <EmployeePanel
            employees={employees}
            week={week}
            onAdd={addEmployee}
            onRemove={removeEmployee}
            onRegenerateCode={regenerateCode}
          />

          <TimeOffPanel
            employees={employees}
            requests={timeOff}
            recurring={recurring}
            weekStart={weekStart}
            onAddRequest={addTimeOffRequest}
            onSetRequestStatus={setTimeOffStatus}
            onRemoveRequest={removeTimeOffRequest}
            onAddRecurring={addRecurringTimeOff}
            onRemoveRecurring={removeRecurringTimeOff}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {DAY_KEYS.map((day) => (
            <DayGrid
              key={day}
              day={day}
              date={dates[day]}
              schedule={week[day] ?? makeEmptyDay(rowCount)}
              rowCount={rowCount}
              employees={employees}
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
          employees={employees}
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
