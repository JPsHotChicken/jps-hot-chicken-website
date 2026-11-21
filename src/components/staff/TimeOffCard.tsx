"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarOff, Pencil, Send, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  deleteTimeOffRequestAction,
  myRequestsAction,
  requestTimeOffAction,
  updateTimeOffRequestAction,
} from "@/app/staff/actions";
import {
  DAY_LABELS,
  TIME_OFF_STATUS_LABELS,
  compareTimeOff,
  coversDate,
  dayKeyOf,
  formatDateRange,
  formatOrdinalDate,
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

const FIELD =
  "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-[invalid=true]:border-destructive sm:text-sm";

type Props = {
  requests: TimeOffRequest[];
  onRequestsChange: (requests: TimeOffRequest[]) => void;
  /** Days this person is on, for the green dots. */
  scheduledDates: string[];
  onRangeChange?: (fromISO: string, toISO: string) => void;
};

/* ----------------------------------------------------------------- popup */

/** One existing request, shown in the popup, with its reason editable. */
function ExistingRequest({
  request,
  todayISO,
  startEditing = false,
  onSaved,
  onDeleted,
}: {
  request: TimeOffRequest;
  todayISO: string;
  /** Open with the reason already being edited — from the list's Edit button. */
  startEditing?: boolean;
  onSaved: (message: string) => Promise<void>;
  onDeleted: (message: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(startEditing && request.endDate >= todayISO);
  const [reason, setReason] = useState(request.reason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const range = formatDateRange(request.startDate, request.endDate);
  const days = requestDayCount(request);
  // Something that has already ended is history, and the server won't change it.
  const changeable = request.endDate >= todayISO;

  const save = async () => {
    if (!reason.trim()) {
      setError("Please give a reason.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await updateTimeOffRequestAction(request.id, {
        startDate: request.startDate,
        endDate: request.endDate,
        reason,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await onSaved(`Request for ${range} updated. Your manager will review it again.`);
    } catch (cause) {
      console.error("[staff] Could not change a request:", cause);
      setError("Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete your request for ${range}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deleteTimeOffRequestAction(request.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await onDeleted(`Request for ${range} deleted.`);
    } catch (cause) {
      console.error("[staff] Could not delete a request:", cause);
      setError("Couldn't delete that. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/60 p-4">
      <div className="flex items-start gap-2">
        <CalendarOff aria-hidden className="mt-0.5 size-4 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {range}
            <span className="font-normal text-muted-foreground">
              {" · "}
              {days} {days === 1 ? "day" : "days"}
            </span>
          </p>
          {!editing && request.reason && (
            <p className="text-xs break-words text-muted-foreground">{request.reason}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${STATUS_BADGE[request.status]}`}
        >
          {TIME_OFF_STATUS_LABELS[request.status]}
        </span>
      </div>

      {editing ? (
        <div className="space-y-2">
          <label htmlFor={`reason-${request.id}`} className="block text-xs font-semibold">
            Reason <span className="font-normal text-muted-foreground">(required)</span>
          </label>
          <input
            id={`reason-${request.id}`}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
            maxLength={200}
            aria-invalid={error ? true : undefined}
            className={FIELD}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void save()} disabled={busy || !reason.trim()}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setReason(request.reason);
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        changeable && (
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
              <Pencil data-icon="inline-start" />
              Edit reason
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void remove()}
              disabled={busy}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </div>
        )
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The popup for one day: ask for it off, or — when it's already asked for —
 * see that request and change its reason or delete it.
 */
function DayOffDialog({
  date,
  todayISO,
  requests,
  editId,
  onRequestsChange,
  onDone,
  onClose,
}: {
  date: string;
  todayISO: string;
  requests: TimeOffRequest[];
  /** A request to open straight into editing. */
  editId?: string | null;
  onRequestsChange: (requests: TimeOffRequest[]) => void;
  onDone: (message: string) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const weekday = DAY_LABELS[dayKeyOf(date)];
  const onDay = requests.filter((request) => coversDate(request, date));
  // A declined request means they're working, so the day can be asked for again.
  const alreadyAsked = onDay.some((request) => request.status !== "denied");
  const past = date < todayISO;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const refreshAndClose = async (message: string) => {
    onRequestsChange(await myRequestsAction());
    onDone(message);
  };

  const submit = async () => {
    if (!reason.trim()) {
      setError("Please give a reason for your request.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestTimeOffAction({ startDate: date, endDate: date, reason });
      await refreshAndClose(
        `Request sent for ${weekday}, ${formatOrdinalDate(date)}. Your manager will review it.`,
      );
    } catch (cause) {
      console.error("[staff] Could not file a request:", cause);
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Couldn't send that request. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-off-title"
        tabIndex={-1}
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-background shadow-xl outline-none sm:rounded-2xl"
      >
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="flex-1">
            <p className="text-xs font-bold tracking-widest text-brand uppercase">
              {alreadyAsked ? "Your request" : "Request time off"}
            </p>
            <h2 id="day-off-title" className="font-heading text-xl font-bold">
              {weekday}, {formatOrdinalDate(date)}
            </h2>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </header>

        <div className="space-y-4 px-5 py-4 pb-8 sm:pb-5">
          {onDay.map((request) => (
            <ExistingRequest
              key={request.id}
              request={request}
              todayISO={todayISO}
              startEditing={request.id === editId}
              onSaved={refreshAndClose}
              onDeleted={refreshAndClose}
            />
          ))}

          {!alreadyAsked && !past && (
            <div className="space-y-2">
              <label htmlFor="day-off-reason" className="block text-sm font-semibold">
                Reason <span className="font-normal text-muted-foreground">(required)</span>
              </label>
              <input
                id="day-off-reason"
                value={reason}
                autoFocus
                onChange={(event) => {
                  setReason(event.target.value);
                  setError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder="Why do you need this day off?"
                maxLength={200}
                aria-invalid={error ? true : undefined}
                className={FIELD}
              />
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button
                className="w-full"
                onClick={() => void submit()}
                disabled={busy || !reason.trim()}
              >
                <Send data-icon="inline-start" />
                {busy ? "Sending…" : "Request this day off"}
              </Button>
            </div>
          )}

          {past && onDay.length === 0 && (
            <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
              This day has already gone.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ card */

/**
 * Request time off, on My schedule: a calendar with green dots on the days
 * they work and red crosses on the days they've asked off. Tapping a day opens
 * a popup to ask for it off (a reason is required) or to look after a request
 * already made. Their requests are listed underneath; tapping one opens it.
 */
export function TimeOffCard({ requests, onRequestsChange, scheduledDates, onRangeChange }: Props) {
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const open = (date: string, editRequestId: string | null = null) => {
    setConfirmation(null);
    setListError(null);
    setEditId(editRequestId);
    setOpenDay(date);
  };

  const removeFromList = async (request: TimeOffRequest) => {
    const range = formatDateRange(request.startDate, request.endDate);
    if (!confirm(`Delete your request for ${range}?`)) return;
    setDeleting(request.id);
    setConfirmation(null);
    setListError(null);
    try {
      const result = await deleteTimeOffRequestAction(request.id);
      if (!result.ok) {
        setListError(result.error);
        return;
      }
      onRequestsChange(await myRequestsAction());
      setConfirmation(`Request for ${range} deleted.`);
    } catch (cause) {
      console.error("[staff] Could not delete a request:", cause);
      setListError("Couldn't delete that request. Please try again.");
    } finally {
      setDeleting(null);
    }
  };
  const todayISO = restaurantTodayISO();
  const sorted = [...requests].sort(compareTimeOff);

  return (
    <section className="rounded-2xl border border-border bg-background shadow-sm">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-5 py-3.5">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <CalendarOff className="size-4 text-brand" />
          Request time off
        </h2>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
            Working
          </span>
          <span className="flex items-center gap-1.5">
            <X aria-hidden strokeWidth={3.5} className="size-3 text-red-600" />
            Requested off
          </span>
        </p>
      </header>

      <div className="space-y-4 p-5 sm:p-6">
        <TimeOffCalendar
          requests={requests}
          scheduledDates={scheduledDates}
          onDayClick={(iso) => open(iso)}
          onRangeChange={onRangeChange}
        />

        {confirmation && (
          <p
            role="status"
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          >
            {confirmation}
          </p>
        )}

        <div>
          <h3 className="mb-2 text-xs font-bold tracking-widest text-muted-foreground uppercase">
            My requests ({requests.length})
          </h3>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">Requested days off will appear here.</p>
          ) : (
            <ul className="space-y-2">
              {sorted.map((request) => {
                const range = formatDateRange(request.startDate, request.endDate);
                const days = requestDayCount(request);
                // Something that has already ended is history; it can be looked
                // at, not changed.
                const changeable = request.endDate >= todayISO;
                return (
                  <li key={request.id} className="rounded-lg border border-border px-3 py-2.5 text-sm">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => open(request.startDate)}
                        aria-haspopup="dialog"
                        aria-label={`Open your request for ${range}`}
                        className="min-w-0 flex-1 rounded text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <span className="block font-semibold">{range}</span>
                        <span className="block text-xs text-muted-foreground">
                          {days} {days === 1 ? "day" : "days"}
                          {request.reason ? ` · ${request.reason}` : ""}
                        </span>
                      </button>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${STATUS_BADGE[request.status]}`}
                      >
                        {TIME_OFF_STATUS_LABELS[request.status]}
                      </span>
                    </div>
                    {changeable && (
                      <div className="mt-2 flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => open(request.startDate, request.id)}
                          disabled={deleting === request.id}
                          aria-label={`Edit your request for ${range}`}
                        >
                          <Pencil data-icon="inline-start" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void removeFromList(request)}
                          disabled={deleting === request.id}
                          aria-label={`Delete your request for ${range}`}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 data-icon="inline-start" />
                          {deleting === request.id ? "Deleting…" : "Delete"}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {listError && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {listError}
            </p>
          )}
        </div>
      </div>

      {openDay && (
        <DayOffDialog
          date={openDay}
          todayISO={todayISO}
          requests={requests}
          editId={editId}
          onRequestsChange={onRequestsChange}
          onDone={(message) => {
            setConfirmation(message);
            setOpenDay(null);
          }}
          onClose={() => setOpenDay(null)}
        />
      )}
    </section>
  );
}
