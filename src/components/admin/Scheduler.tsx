"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  LoaderCircle,
  LogOut,
  Menu,
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
  regenerateSetupCodeAction,
  reloadAction,
  removeEmployeeAction,
  removeRecurringTimeOffAction,
  removeTimeOffAction,
  restoreTimeOffAction,
  setStaffPasswordAction,
  setTimeOffStatusAction,
} from "@/app/admin/schedule-actions";
import { exportSchedulePdf, type ExportScope } from "@/lib/schedule-pdf";
import {
  DAY_KEYS,
  addDays,
  datesForWeek,
  formatWeekRange,
  fromISODate,
  makeEmptyDay,
  makeEmptyWeek,
  mondayOf,
  offOnDay,
  peakCoverage,
  toISODate,
  type DayKey,
  type DayOff,
  type DeletedTimeOffRequest,
  type Employee,
  type RecurringTimeOff,
  type ShiftGroup,
  type TimeOffRequest,
  type TimeOffStatus,
  type WeekSchedule,
} from "@/lib/schedule";
import { CellEditor } from "./CellEditor";
import { DayGrid, type CellRange } from "./DayGrid";
import { AdminDrawer, type SchedulerView } from "./AdminDrawer";
import { EmployeePanel } from "./EmployeePanel";
import { ExportMenu } from "./ExportMenu";
import { GoLiveButton, type PublishState } from "./GoLiveButton";
import { StaffManagement } from "./StaffManagement";
import { forgetPayrollNameAction } from "@/app/admin/pay-stubs/actions";
import {
  TimeOffPanel,
  type NewRecurringTimeOff,
  type NewTimeOffRequest,
} from "./TimeOffPanel";

type Editing = { day: DayKey; range: CellRange; el: HTMLElement };

export type SchedulerProps = {
  employees: Employee[];
  /** How payroll spells each person, learned when a pay stub was assigned. */
  payrollNames?: { employeeId: string; payrollName: string }[];
  timeOff: TimeOffRequest[];
  /** Requests that were deleted, kept so a delete can be undone. */
  deletedTimeOff: DeletedTimeOffRequest[];
  recurringTimeOff: RecurringTimeOff[];
  /** Monday of the week the page was opened on. */
  weekStart: string;
  week: WeekSchedule;
  /** Whether that week has been sent to staff, and whether it has drifted since. */
  publishState: PublishState;
  /** Which half of the dashboard to open on — `/admin?view=staff` picks staff. */
  initialView?: SchedulerView;
};

/** Every cell id inside an inclusive range, row-major. */
function cellsIn(week: WeekSchedule, day: DayKey, range: CellRange): (string | null)[] {
  const cells: (string | null)[] = [];
  for (let row = range.rowStart; row <= range.rowEnd; row++) {
    for (let slot = range.slotStart; slot <= range.slotEnd; slot++) {
      cells.push(week[day]?.[row]?.[slot] ?? null);
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
  employees: initialEmployees,
  timeOff: initialTimeOff,
  deletedTimeOff: initialDeletedTimeOff,
  recurringTimeOff: initialRecurring,
  weekStart: initialWeekStart,
  week: initialWeek,
  publishState: initialPublishState,
  payrollNames: initialPayrollNames = [],
  initialView = "scheduler",
}: SchedulerProps) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [payrollNames, setPayrollNames] = useState(initialPayrollNames);
  const [timeOff, setTimeOff] = useState(initialTimeOff);
  const [deletedTimeOff, setDeletedTimeOff] = useState(initialDeletedTimeOff);
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
  const [view, setView] = useState<SchedulerView>(initialView);
  const [menuOpen, setMenuOpen] = useState(false);
  const weekPickerRef = useRef<HTMLInputElement>(null);
  const pendingWeek = useRef(initialWeekStart);
  const toolbarRef = useRef<HTMLElement>(null);
  // How far down the sticky sidebar has to start. Measured rather than assumed:
  // the toolbar wraps to two rows on a narrow window, and the error banner sits
  // inside it, so its height is not a constant.
  const [toolbarHeight, setToolbarHeight] = useState(0);

  const week = weeks[weekStart] ?? makeEmptyWeek();
  const dates = useMemo(() => datesForWeek(weekStart), [weekStart]);
  // One scale for every day's heat map, so Friday lunch and Monday lunch shade
  // the same way when they are staffed the same.
  const peak = useMemo(() => peakCoverage(week), [week]);
  // Who is away on each day of the week on screen, for the badges in the day
  // headers. Time off is week-wide, so it is worked out here once rather than
  // handing all of it to all seven days.
  const offByDay = useMemo(
    () =>
      Object.fromEntries(
        DAY_KEYS.map((day) => [
          day,
          offOnDay(employees, timeOff, recurring, day, toISODate(dates[day])),
        ]),
      ) as Record<DayKey, DayOff[]>,
    [employees, timeOff, recurring, dates],
  );

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    // `offsetHeight` rather than the entry's box, so the bottom border counts.
    const measure = () => setToolbarHeight(toolbar.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);

  /** Pull the database's version of everything back into state. */
  const reload = useCallback(async (forWeek: string) => {
    const fresh = await reloadAction(forWeek);
    setEmployees(fresh.employees);
    setTimeOff(fresh.timeOff);
    setDeletedTimeOff(fresh.deletedTimeOff);
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
        const loaded = await loadWeekAction(target);
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
    [weeks, refreshPublishState],
  );

  /** Apply a change to one week in the local cache. */
  const patchWeek = useCallback(
    (target: string, mutate: (current: WeekSchedule) => WeekSchedule) => {
      setWeeks((current) => ({
        ...current,
        [target]: mutate(current[target] ?? makeEmptyWeek()),
      }));
    },
    [],
  );

  /** Assign (or clear, with `null`) every cell in a dragged block at once. */
  const setRange = useCallback(
    (day: DayKey, range: CellRange, employeeId: string | null) => {
      patchWeek(weekStart, (current) => ({
        ...current,
        [day]: current[day].map((cells, rowIndex) =>
          rowIndex >= range.rowStart && rowIndex <= range.rowEnd
            ? cells.map((cell, slotIndex) =>
                slotIndex >= range.slotStart && slotIndex <= range.slotEnd ? employeeId : cell,
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
      setDeletedTimeOff((current) => current.filter((request) => request.employeeId !== id));
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

  /**
   * Set an employee's password for them. A refusal is thrown rather than
   * swallowed into the banner: Staff management shows it against the row it
   * belongs to, so "that password is taken" appears next to the person it's
   * about.
   */
  const savePassword = useCallback(async (id: string, password: string) => {
    const result = await setStaffPasswordAction(id, password);
    if (!result.ok) throw new Error(result.error);
    setEmployees((current) =>
      current.map((employee) =>
        employee.id === id
          ? { ...employee, password: result.password, passwordSetAt: result.passwordSetAt }
          : employee,
      ),
    );
  }, []);

  const regenerateSetupCode = useCallback(async (id: string) => {
    const setupCode = await regenerateSetupCodeAction(id);
    setEmployees((current) =>
      current.map((employee) => (employee.id === id ? { ...employee, setupCode } : employee)),
    );
  }, []);

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
        existing = await loadWeekAction(target);
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

    const source = weeks[weekStart] ?? makeEmptyWeek();
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

  /**
   * Deleting moves the request to the deleted list rather than dropping it: the
   * row is only stamped in the database, so it can be put back. The stamp used
   * here is the local clock — the database's own is read back on the next load,
   * and a few milliseconds' difference changes nothing that is shown.
   */
  const removeTimeOffRequest = useCallback(
    (id: string) => {
      const request = timeOff.find((entry) => entry.id === id);
      if (!request) return;
      setTimeOff((current) => current.filter((entry) => entry.id !== id));
      setDeletedTimeOff((current) => [
        { ...request, deletedAt: new Date().toISOString() },
        ...current,
      ]);
      void save("delete that request", async () => {
        await removeTimeOffAction(id);
      });
    },
    [save, timeOff],
  );

  const restoreTimeOffRequest = useCallback(
    (id: string) => {
      const deleted = deletedTimeOff.find((entry) => entry.id === id);
      if (!deleted) return;
      setDeletedTimeOff((current) => current.filter((entry) => entry.id !== id));
      // Back exactly as it was — same status, same dates — minus the stamp that
      // marked it deleted.
      setTimeOff((current) => [
        ...current,
        {
          id: deleted.id,
          employeeId: deleted.employeeId,
          startDate: deleted.startDate,
          endDate: deleted.endDate,
          reason: deleted.reason,
          status: deleted.status,
          requestedAt: deleted.requestedAt,
        },
      ]);
      void save("restore that request", () => restoreTimeOffAction(id));
    },
    [deletedTimeOff, save],
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
      await exportSchedulePdf({ week, employees, weekStartISO: weekStart, scope });
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
      <header
        ref={toolbarRef}
        className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur"
      >
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>

          <div className="mr-auto">
            <h1 className="font-heading text-lg font-bold tracking-tight">
              {view === "scheduler" ? "Schedule maker" : "Staff management"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {view === "scheduler" ? "Monday – Sunday" : "Your team and their sign-in codes"}
            </p>
          </div>

          {/* Everything from here to Sign out is about building a week, so it
              only belongs on the scheduler. */}
          {view === "scheduler" && (
            <>
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

          <ExportMenu employees={employees} exporting={exporting} onExport={handleExport} />

          <GoLiveButton state={publishState} publishing={publishing} onPublish={publish} />
            </>
          )}

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

      <AdminDrawer
        open={menuOpen}
        view={view}
        onOpenChange={setMenuOpen}
        onSelect={(next) => {
          setView(next);
          setEditing(null);
        }}
      />

      {view === "staff" ? (
        <StaffManagement
          employees={employees}
          payrollNames={payrollNames}
          onSavePassword={savePassword}
          onRegenerateSetupCode={regenerateSetupCode}
          onAdd={addEmployee}
          onRemove={removeEmployee}
          onForgetPayrollName={async (payrollName) => {
            await forgetPayrollNameAction(payrollName);
            setPayrollNames((names) => names.filter((n) => n.payrollName !== payrollName));
          }}
        />
      ) : (
      <div className="flex flex-1 flex-col gap-4 p-4 sm:px-6 lg:flex-row-reverse lg:items-start">
        {/*
          Sidebar: employees, then time off to its right once there's room.

          From `lg` up — where it sits beside the grid rather than above it — it
          sticks under the toolbar, so the time-off list and everyone's hours
          stay on screen while scrolling down through the week. Taller than the
          viewport, it scrolls within itself instead of running off the bottom.
        */}
        <div
          // Left unset until measured, so the fallback in the classes below —
          // not a stray `0px` — is what the first paint sticks to.
          style={
            toolbarHeight
              ? ({ "--toolbar-h": `${toolbarHeight}px` } as React.CSSProperties)
              : undefined
          }
          className="flex w-full shrink-0 flex-col gap-4 lg:sticky lg:top-[calc(var(--toolbar-h,4rem)+1rem)] lg:max-h-[calc(100dvh-var(--toolbar-h,4rem)-2rem)] lg:w-72 lg:self-start lg:overflow-y-auto xl:w-[33rem] xl:flex-row xl:items-start">
          <EmployeePanel
            employees={employees}
            week={week}
            onManageStaff={() => {
              setView("staff");
              setEditing(null);
            }}
          />

          <TimeOffPanel
            employees={employees}
            requests={timeOff}
            deletedRequests={deletedTimeOff}
            recurring={recurring}
            weekStart={weekStart}
            onAddRequest={addTimeOffRequest}
            onSetRequestStatus={setTimeOffStatus}
            onRemoveRequest={removeTimeOffRequest}
            onRestoreRequest={restoreTimeOffRequest}
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
              schedule={week[day] ?? makeEmptyDay()}
              employees={employees}
              off={offByDay[day]}
              peak={peak}
              selection={editing?.day === day ? editing.range : null}
              onEditRange={(range, el) => setEditing({ day, range, el })}
              onCopyToDays={copyDay}
            />
          ))}
        </div>
      </div>
      )}

      {editing && view === "scheduler" && (
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
