"use client";

import { useState } from "react";
import { CalendarRange, Info, Plus, Repeat, Settings2, Shapes, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  addRecurringDayOffAction,
  removeRecurringDayOffAction,
  setRolePreferenceAction,
} from "@/app/staff/actions";
import {
  DAY_KEYS,
  DAY_LABELS,
  addDays,
  dayKeyOf,
  formatHours,
  formatOrdinalDate,
  formatRange,
  formatShortDate,
  fromISODate,
  isClosedDay,
  rangeHours,
  sundayWeekOf,
  toISODate,
  type DayKey,
  type RolePreference,
  type ShiftRole,
  type RecurringTimeOff,
  type StaffShiftDay,
  type TimeOffRequest,
} from "@/lib/schedule";
import { DayDetails } from "./DayDetails";
import { TimeOffCard } from "./TimeOffCard";
import { WeekLegend, WeekRow, useDayMarks, type DayMarks } from "./WeekRow";

type Props = {
  todayISO: string;
  /** Published shifts, from this week's Sunday on. */
  shiftDays: StaffShiftDay[];
  /** Every date they have a published shift on, for the rings. */
  workDates: string[];
  timeOff: TimeOffRequest[];
  /** Re-read requests after one is filed, changed or deleted. */
  onTimeOffChange?: (requests: TimeOffRequest[]) => void;
  /** Fetch work days for months the calendar pages to. */
  onLoadDates?: (fromISO: string, toISO: string) => void;
  recurring: RecurringTimeOff[];
  onRecurringChange: (recurring: RecurringTimeOff[]) => void;
  preferences: RolePreference[];
  onPreferencesChange: (preferences: RolePreference[]) => void;
  /** The owner's roles — the list a preference is picked from. */
  roles?: ShiftRole[];
};

const FIELD =
  "rounded-lg border border-border bg-background px-2.5 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm";

/** "Mon, Nov 23rd" */
function shortDay(iso: string): string {
  return `${DAY_LABELS[dayKeyOf(iso)].slice(0, 3)}, ${formatOrdinalDate(iso)}`;
}

/* ------------------------------------------------------------ two weeks */

function WeekBlock({
  label,
  days,
  todayISO,
  marks,
  shiftDays,
  onSelectDay,
}: {
  label: string;
  days: string[];
  todayISO: string;
  marks: DayMarks;
  shiftDays: StaffShiftDay[];
  onSelectDay: (iso: string) => void;
}) {
  const inWeek = shiftDays.filter((entry) => days.includes(entry.date));
  const hours = inWeek.reduce((total, entry) => total + rangeHours(entry.shifts), 0);

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-heading text-base font-bold">
          {label}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            {formatShortDate(fromISODate(days[0]))} – {formatShortDate(fromISODate(days[6]))}
          </span>
        </h3>
        {hours > 0 && (
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold tabular-nums">
            {formatHours(hours)} hours
          </span>
        )}
      </div>

      <WeekRow
        days={days}
        todayISO={todayISO}
        marks={marks}
        label={label}
        size="lg"
        onSelectDay={onSelectDay}
      />
    </div>
  );
}

/* ------------------------------------------------------------- settings */

function RecurringSettings({
  recurring,
  onChange,
}: {
  recurring: RecurringTimeOff[];
  onChange: (recurring: RecurringTimeOff[]) => void;
}) {
  const taken = new Set(recurring.map((entry) => entry.day));
  const open = DAY_KEYS.filter((day) => !isClosedDay(day) && !taken.has(day));
  const [day, setDay] = useState<DayKey | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    if (!day) {
      setError("Pick a day.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await addRecurringDayOffAction(day);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChange(result.recurring);
      setDay("");
    } catch (cause) {
      console.error("[staff] Could not add a day off every week:", cause);
      setError("Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: RecurringTimeOff) => {
    if (!confirm(`Stop having every ${DAY_LABELS[entry.day]} off?`)) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await removeRecurringDayOffAction(entry.id));
    } catch (cause) {
      console.error("[staff] Could not remove a day off every week:", cause);
      setError("Couldn't remove that. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 className="flex items-center gap-2 font-heading text-sm font-bold">
        <Repeat className="size-4 text-brand" />
        Days off every week
      </h3>
      {/* No reason to give: the day itself is the whole request, so the note
          says what picking one does instead. */}
      <p className="mt-2 flex items-start gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-sky-200">
        <Info aria-hidden className="mt-px size-3.5 shrink-0" />
        <span>If needed, you can pick a day that you would like to have off every week.</span>
      </p>

      {recurring.length > 0 && (
        <ul className="mt-3 space-y-2">
          {recurring.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Every {DAY_LABELS[entry.day]}</span>
                {entry.reason && (
                  <span className="block text-xs break-words text-muted-foreground">
                    {entry.reason}
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void remove(entry)}
                disabled={busy}
                aria-label={`Remove every ${DAY_LABELS[entry.day]} off`}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {open.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <label htmlFor="recurring-day" className="sr-only">
              Day
            </label>
            <select
              id="recurring-day"
              value={day}
              onChange={(event) => {
                setDay(event.target.value as DayKey | "");
                setError(null);
              }}
              className={`${FIELD} min-w-36`}
            >
              <option value="">Pick a day…</option>
              {open.map((key) => (
                <option key={key} value={key}>
                  Every {DAY_LABELS[key]}
                </option>
              ))}
            </select>
            <Button onClick={() => void add()} disabled={busy || !day}>
              <Plus data-icon="inline-start" />
              Add day off
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PreferenceSettings({
  todayISO,
  shiftDays,
  roles,
  preferences,
  onChange,
}: {
  todayISO: string;
  shiftDays: StaffShiftDay[];
  roles: ShiftRole[];
  preferences: RolePreference[];
  onChange: (preferences: RolePreference[]) => void;
}) {
  const lastDay = toISODate(addDays(fromISODate(sundayWeekOf(todayISO)[6]), 7));
  const coming = shiftDays.filter((entry) => entry.date >= todayISO && entry.date <= lastDay);
  const byDate = new Map(preferences.map((preference) => [preference.date, preference.roleId]));
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<{ date: string; message: string } | null>(null);

  const choose = async (date: string, roleId: string | null) => {
    const before = preferences;
    // Shown at once; put back if the save is refused.
    onChange([
      ...preferences.filter((preference) => preference.date !== date),
      ...(roleId ? [{ employeeId: "", date, roleId }] : []),
    ]);
    setSaving(date);
    setError(null);
    try {
      const result = await setRolePreferenceAction(date, roleId);
      if (!result.ok) {
        onChange(before);
        setError({ date, message: result.error });
      }
    } catch (cause) {
      console.error("[staff] Could not save a position preference:", cause);
      onChange(before);
      setError({ date, message: "Couldn't save that. Please try again." });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <h3 className="flex items-center gap-2 font-heading text-sm font-bold">
        <Shapes className="size-4 text-brand" />
        Position preferences
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Pick the role you&apos;d like on the days you&apos;re scheduled. Your manager sees it when
        building the schedule — it&apos;s a request, not a guarantee.
      </p>

      {coming.length > 0 && roles.length === 0 ? (
        <p className="mt-3 rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
          Your manager hasn&apos;t set up any roles yet.
        </p>
      ) : coming.length === 0 ? (
        <p className="mt-3 rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
          Once you&apos;re on the schedule this week or next, you can pick a role for each day
          here.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {coming.map((entry) => {
            const label = shortDay(entry.date);
            return (
              <li key={entry.date} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{label}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {entry.shifts.map((shift) => formatRange(shift)).join(", ")}
                    </span>
                  </span>
                  <label htmlFor={`preference-${entry.date}`} className="sr-only">
                    Preferred role on {label}
                  </label>
                  <select
                    id={`preference-${entry.date}`}
                    value={byDate.get(entry.date) ?? ""}
                    disabled={saving === entry.date}
                    onChange={(event) => void choose(entry.date, event.target.value || null)}
                    className={`${FIELD} min-w-40`}
                  >
                    <option value="">No preference</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
                {error?.date === entry.date && (
                  <p role="alert" className="mt-1.5 text-sm text-destructive">
                    {error.message}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- page */

/**
 * My schedule: this week and next at a glance, in the same rings as the home
 * page — tap a day for its hours and role — then a calendar for asking days
 * off, then the settings that shape future schedules: weekly days off and
 * position preferences.
 */
export function MySchedulePage({
  todayISO,
  shiftDays,
  workDates,
  timeOff,
  onTimeOffChange = () => {},
  onLoadDates,
  recurring,
  onRecurringChange,
  preferences,
  onPreferencesChange,
  roles = [],
}: Props) {
  const marks = useDayMarks(
    workDates,
    timeOff,
    recurring.map((entry) => entry.day),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const thisWeek = sundayWeekOf(todayISO);
  const nextWeek = sundayWeekOf(toISODate(addDays(fromISODate(todayISO), 7)));

  return (
    <>
      <section className="rounded-2xl border border-border bg-background shadow-sm">
        <header className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <CalendarRange className="size-4 text-brand" />
          <h2 className="font-heading text-base font-bold">Your next two weeks</h2>
        </header>
        <div className="space-y-7 p-5 sm:p-6">
          <WeekBlock
            label="This week"
            days={thisWeek}
            todayISO={todayISO}
            marks={marks}
            shiftDays={shiftDays}
            onSelectDay={setSelected}
          />
          <WeekBlock
            label="Next week"
            days={nextWeek}
            todayISO={todayISO}
            marks={marks}
            shiftDays={shiftDays}
            onSelectDay={setSelected}
          />
          <WeekLegend />
          <p className="-mt-4 text-center text-xs text-muted-foreground">
            Tap a day to see its details.
          </p>
        </div>
      </section>

      <TimeOffCard
        requests={timeOff}
        onRequestsChange={onTimeOffChange}
        scheduledDates={workDates}
        onRangeChange={onLoadDates}
      />

      <section className="rounded-2xl border border-border bg-background shadow-sm">
        <header className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <Settings2 className="size-4 text-brand" />
          <h2 className="font-heading text-base font-bold">Schedule settings</h2>
        </header>
        <div className="space-y-7 p-5 sm:p-6">
          <RecurringSettings recurring={recurring} onChange={onRecurringChange} />
          <div className="border-t border-border" />
          <PreferenceSettings
            todayISO={todayISO}
            shiftDays={shiftDays}
            roles={roles}
            preferences={preferences}
            onChange={onPreferencesChange}
          />
        </div>
      </section>

      {selected && (
        <DayDetails
          date={selected}
          todayISO={todayISO}
          shiftDay={shiftDays.find((entry) => entry.date === selected)}
          timeOff={timeOff}
          recurring={recurring}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
