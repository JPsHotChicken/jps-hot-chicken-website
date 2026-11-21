"use client";

import { useState } from "react";
import { CalendarDays, Pencil, Send, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  deleteTimeOffRequestAction,
  myRequestsAction,
  requestTimeOffAction,
  updateTimeOffRequestAction,
} from "@/app/staff/actions";
import {
  TIME_OFF_STATUS_LABELS,
  compareTimeOff,
  formatDateRange,
  requestDayCount,
  restaurantTodayISO,
  type TimeOffRequest,
  type TimeOffStatus,
} from "@/lib/schedule";
import { TimeOffCalendar } from "./TimeOffCalendar";

const STATUS_BADGE: Record<TimeOffStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  denied: "bg-rose-100 text-rose-900",
};

type Props = {
  requests: TimeOffRequest[];
  onRequestsChange: (requests: TimeOffRequest[]) => void;
  /** Days this person is on, for the dots on the calendar. */
  scheduledDates: string[];
  onRangeChange?: (fromISO: string, toISO: string) => void;
};

type Selection = { start: string; end: string };

/**
 * The Request Time Off page: pick days on the calendar, say why, send it. Every
 * request they have made is listed underneath, and any that hasn't already
 * ended can be changed or deleted. Changing one sends it back to "In review".
 */
export function TimeOffPage({ requests, onRequestsChange, scheduledDates, onRangeChange }: Props) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [reason, setReason] = useState("");
  /** The request being changed, when the form is editing rather than filing. */
  const [editing, setEditing] = useState<TimeOffRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const todayISO = restaurantTodayISO();
  const sorted = [...requests].sort(compareTimeOff);
  const selectedDays = selection
    ? requestDayCount({ startDate: selection.start, endDate: selection.end })
    : 0;

  const reset = () => {
    setSelection(null);
    setReason("");
    setEditing(null);
    setError(null);
  };

  const refresh = async () => onRequestsChange(await myRequestsAction());

  const submit = async () => {
    if (!selection) return;
    if (!reason.trim()) {
      setError("Please give a reason for your request.");
      return;
    }
    setBusy(true);
    setError(null);
    const input = { startDate: selection.start, endDate: selection.end, reason };
    const range = formatDateRange(selection.start, selection.end);
    try {
      if (editing) {
        const result = await updateTimeOffRequestAction(editing.id, input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setConfirmation(`Request changed to ${range}. Your manager will review it again.`);
      } else {
        await requestTimeOffAction(input);
        setConfirmation(`Request sent for ${range}. Your manager will review it.`);
      }
      await refresh();
      reset();
    } catch (cause) {
      console.error("[staff] Could not save a request:", cause);
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Couldn't send that request. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (request: TimeOffRequest) => {
    setEditing(request);
    setSelection({ start: request.startDate, end: request.endDate });
    setReason(request.reason);
    setError(null);
    setConfirmation(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (request: TimeOffRequest) => {
    const range = formatDateRange(request.startDate, request.endDate);
    if (!confirm(`Delete your request for ${range}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteTimeOffRequestAction(request.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (editing?.id === request.id) reset();
      setConfirmation(`Request for ${range} deleted.`);
      await refresh();
    } catch (cause) {
      console.error("[staff] Could not delete a request:", cause);
      setError("Couldn't delete that request. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="rounded-xl border border-border bg-background shadow-sm">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold">
            <CalendarDays className="size-4 text-brand" />
            {editing ? "Change your request" : "Pick your days"}
          </h2>
          {/* The same two marks the calendar draws, so the key and the grid
              can never say different things. */}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="size-1.5 rounded-full bg-orange-500" />
              Scheduled days
            </span>
            <span className="flex items-center gap-1.5">
              <X aria-hidden strokeWidth={3.5} className="size-3 text-red-600" />
              Requested days off
            </span>
          </p>
        </header>

        <div className="space-y-3 p-4">
          <TimeOffCalendar
            // The request being changed isn't drawn as taken: those are the
            // very days being moved.
            requests={editing ? requests.filter((entry) => entry.id !== editing.id) : requests}
            scheduledDates={scheduledDates}
            selection={selection}
            onSelect={(next) => {
              setSelection(next);
              setConfirmation(null);
            }}
            onRangeChange={onRangeChange}
          />

          {selection && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-sm">
                <span className="font-semibold">
                  {formatDateRange(selection.start, selection.end)}
                </span>
                <span className="text-muted-foreground">
                  {" · "}
                  {selectedDays} {selectedDays === 1 ? "day" : "days"}
                </span>
              </p>

              <label htmlFor="staff-reason" className="block text-xs font-semibold">
                Reason <span className="font-normal text-muted-foreground">(required)</span>
              </label>
              <input
                id="staff-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError(null);
                }}
                placeholder="Why do you need these days off?"
                required
                maxLength={200}
                aria-invalid={error ? true : undefined}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-[invalid=true]:border-destructive sm:text-sm"
              />

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                <Button onClick={submit} disabled={busy || !reason.trim()}>
                  <Send data-icon="inline-start" />
                  {busy ? "Saving…" : editing ? "Save changes" : "Send request"}
                </Button>
                <Button variant="ghost" onClick={reset} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {!selection && error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {confirmation && (
            <p
              role="status"
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
            >
              {confirmation}
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-background shadow-sm">
        <header className="border-b border-border px-4 py-3">
          <h2 className="font-heading text-base font-bold">
            My requests{" "}
            <span className="text-sm font-normal text-muted-foreground">({requests.length})</span>
          </h2>
        </header>

        <div className="p-4">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">Requested days off will appear here.</p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((request) => {
                const days = requestDayCount(request);
                const range = formatDateRange(request.startDate, request.endDate);
                const changeable = request.endDate >= todayISO;
                const beingEdited = editing?.id === request.id;
                return (
                  <li
                    key={request.id}
                    className={`rounded-lg border px-3 py-2.5 text-sm ${
                      beingEdited ? "border-brand bg-brand/5" : "border-border"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 font-semibold">{range}</span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${
                          STATUS_BADGE[request.status]
                        }`}
                      >
                        {TIME_OFF_STATUS_LABELS[request.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {days} {days === 1 ? "day" : "days"}
                      <span className="mx-1">·</span>
                      asked on {formatDateRange(request.requestedAt, request.requestedAt)}
                    </p>
                    {request.reason && (
                      <p className="mt-1 text-xs break-words text-foreground/80">
                        {request.reason}
                      </p>
                    )}
                    {changeable && (
                      <div className="mt-2 flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startEditing(request)}
                          disabled={busy || beingEdited}
                          aria-label={`Edit your request for ${range}`}
                        >
                          <Pencil data-icon="inline-start" />
                          {beingEdited ? "Editing" : "Edit"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void remove(request)}
                          disabled={busy}
                          aria-label={`Delete your request for ${range}`}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 data-icon="inline-start" />
                          Delete
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
