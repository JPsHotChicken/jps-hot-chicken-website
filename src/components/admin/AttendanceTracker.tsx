"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  CalendarCheck,
  Download,
  FileSpreadsheet,
  LogOut,
  Menu,
  Plus,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { logout } from "@/app/admin/actions";
import { addEntryAction, deleteEntryAction } from "@/app/admin/attendance/actions";
import {
  COMMON_REASONS,
  MAX_REASON,
  attendanceCsv,
  attendanceFilename,
  compareEntries,
  formatEntryDate,
  formatEntryTime,
  inRange,
  personKey,
  type AttendanceEmployee,
  type AttendanceEntry,
} from "@/lib/attendance";
import { AdminDrawer } from "./AdminDrawer";
import { FIELD_CLASS, LABEL_CLASS } from "./field";

type Props = {
  employees: AttendanceEmployee[];
  initialEntries: AttendanceEntry[];
};

/** Someone who can be filtered or exported: on the roster, or only in old entries. */
type Person = { key: string; name: string; count: number; onRoster: boolean };

const ALL = "all";

/** Today and now on this device's clock, as the inputs want them. */
function localNow(): { date: string; time: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

const noopSubscribe = () => () => {};
const readNow = () => {
  const now = localNow();
  return `${now.date}|${now.time}`;
};

function downloadText(text: string, filename: string) {
  // The byte order mark is what makes Excel read the file as UTF-8.
  const blob = new Blob(["﻿", text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The attendance tracker: write down a late, call-out or no-show as it happens,
 * then pull one person's record out as a PDF or CSV when it is needed.
 */
export function AttendanceTracker({ employees, initialEntries }: Props) {
  const [entries, setEntries] = useState(() => [...initialEntries].sort(compareEntries));
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The form. Date and time default to "now" on this device, read only in the
  // browser — the server's clock (UTC on Vercel) isn't the store's. Until the
  // owner picks one, the field follows that default.
  const nowStamp = useSyncExternalStore(noopSubscribe, readNow, () => "");
  const [nowDate = "", nowTime = ""] = nowStamp ? nowStamp.split("|") : [];
  const [employeeId, setEmployeeId] = useState("");
  const [pickedDate, setDate] = useState<string | null>(null);
  const [pickedTime, setTime] = useState<string | null>(null);
  const date = pickedDate ?? nowDate;
  const time = pickedTime ?? nowTime;
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // The list, which is also what gets exported.
  const [person, setPerson] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const active = employees.filter((e) => e.active);
  const inactive = employees.filter((e) => !e.active);

  const people = useMemo<Person[]>(() => {
    const counts = new Map<string, number>();
    const names = new Map<string, string>();
    for (const entry of entries) {
      const key = personKey(entry);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      names.set(key, entry.employeeName);
    }
    const roster = employees.map((e) => ({
      key: e.id,
      name: e.name,
      count: counts.get(e.id) ?? 0,
      onRoster: true,
    }));
    const removed = [...names]
      .filter(([key]) => !employees.some((e) => e.id === key))
      .map(([key, name]) => ({ key, name, count: counts.get(key) ?? 0, onRoster: false }));
    return [...roster, ...removed].sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, entries]);

  const selected = people.find((p) => p.key === person) ?? null;

  const visible = entries.filter(
    (entry) => (person === ALL || personKey(entry) === person) && inRange(entry, from, to),
  );

  async function addEntry(event: React.FormEvent) {
    event.preventDefault();
    if (!employeeId || !date || !time || !reason.trim()) {
      setError("Pick an employee, a date, a time and a reason.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const entry = await addEntryAction({ employeeId, date, time, reason });
      setEntries((list) => [...list, entry].sort(compareEntries));
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The entry could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(entry: AttendanceEntry) {
    const label = `${entry.employeeName}, ${formatEntryDate(entry.date)} at ${formatEntryTime(entry.time)}`;
    if (!window.confirm(`Delete this entry?\n\n${label}\n${entry.reason}`)) return;
    const before = entries;
    setEntries((list) => list.filter((e) => e.id !== entry.id));
    try {
      await deleteEntryAction(entry.id);
    } catch (err) {
      setEntries(before);
      setError(err instanceof Error ? err.message : "The entry could not be deleted.");
    }
  }

  async function exportPdf() {
    if (!selected) return;
    setExporting(true);
    setError(null);
    try {
      const { exportAttendancePdf } = await import("@/lib/attendance-pdf");
      await exportAttendancePdf({ name: selected.name, entries: visible, from, to });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The PDF could not be made.");
    } finally {
      setExporting(false);
    }
  }

  function exportCsv() {
    if (!selected) return;
    const oldestFirst = [...visible].reverse();
    downloadText(attendanceCsv(oldestFirst), attendanceFilename(selected.name, from, to, "csv"));
  }

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
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
            <h1 className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight">
              <CalendarCheck className="size-4 text-brand" />
              Attendance tracker
            </h1>
            <p className="text-xs text-muted-foreground">
              Lates, call-outs and no-shows, and each person&apos;s record
            </p>
          </div>

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
            <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={() => setError(null)}>
              <X />
            </Button>
          </div>
        )}
      </header>

      <AdminDrawer open={menuOpen} view="attendance" onOpenChange={setMenuOpen} />

      <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 lg:grid-cols-[22rem_1fr]">
        {/* ------------------------------------------------------- add entry */}
        <form
          onSubmit={addEntry}
          className="space-y-3 rounded-xl border border-border bg-background p-4 lg:sticky lg:top-24"
        >
          <h2 className="font-heading text-base font-bold">Add an entry</h2>

          <div className="space-y-1">
            <label htmlFor="att-employee" className={LABEL_CLASS}>
              Employee
            </label>
            <select
              id="att-employee"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className={FIELD_CLASS}
              required
            >
              <option value="">Select an employee…</option>
              {active.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
              {inactive.length > 0 && (
                <optgroup label="Inactive">
                  {inactive.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label htmlFor="att-date" className={LABEL_CLASS}>
                Date
              </label>
              <input
                id="att-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className={FIELD_CLASS}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="att-time" className={LABEL_CLASS}>
                Time
              </label>
              <input
                id="att-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className={FIELD_CLASS}
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="att-reason" className={LABEL_CLASS}>
              Reason
            </label>
            <textarea
              id="att-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={MAX_REASON}
              rows={3}
              placeholder="e.g. Late — clocked in 25 minutes after shift start"
              className={`${FIELD_CLASS} resize-y`}
              required
            />
            <div className="flex flex-wrap gap-1 pt-1">
              {COMMON_REASONS.map((common) => (
                <button
                  key={common}
                  type="button"
                  onClick={() => setReason(common)}
                  className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {common}
                </button>
              ))}
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            <Plus data-icon="inline-start" />
            {saving ? "Saving…" : "Add entry"}
          </Button>
        </form>

        {/* ------------------------------------------------- list + export */}
        <section className="min-w-0 rounded-xl border border-border bg-background">
          <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
            <div className="min-w-48 flex-1 space-y-1">
              <label htmlFor="att-person" className={LABEL_CLASS}>
                Staff member
              </label>
              <select
                id="att-person"
                value={person}
                onChange={(event) => setPerson(event.target.value)}
                className={FIELD_CLASS}
              >
                <option value={ALL}>All staff ({entries.length})</option>
                {people.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                    {p.onRoster ? "" : " (removed)"} ({p.count})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="att-from" className={LABEL_CLASS}>
                From
              </label>
              <input
                id="att-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
                className={FIELD_CLASS}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="att-to" className={LABEL_CLASS}>
                To
              </label>
              <input
                id="att-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
                className={FIELD_CLASS}
              />
            </div>
            {(from || to) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
              >
                Clear dates
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <p className="mr-auto text-sm text-muted-foreground">
              {selected ? (
                <>
                  Export <span className="font-semibold text-foreground">{selected.name}</span>
                  &apos;s {visible.length} entr{visible.length === 1 ? "y" : "ies"}
                  {from || to ? " in this date range" : ""}
                </>
              ) : (
                "Pick a staff member to export their record."
              )}
            </p>
            <Button variant="outline" size="sm" disabled={!selected || exporting} onClick={exportPdf}>
              <Download data-icon="inline-start" />
              {exporting ? "Making PDF…" : "PDF"}
            </Button>
            <Button variant="outline" size="sm" disabled={!selected} onClick={exportCsv}>
              <FileSpreadsheet data-icon="inline-start" />
              CSV
            </Button>
          </div>

          {visible.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {entries.length === 0 ? "No entries yet. Add the first one on the left." : "No entries match."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((entry) => (
                <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {person === ALL && (
                        <span className="font-semibold">{entry.employeeName} · </span>
                      )}
                      <span className="text-muted-foreground">
                        {formatEntryDate(entry.date)} at {formatEntryTime(entry.time)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{entry.reason}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete entry for ${entry.employeeName} on ${formatEntryDate(entry.date)}`}
                    onClick={() => removeEntry(entry)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
