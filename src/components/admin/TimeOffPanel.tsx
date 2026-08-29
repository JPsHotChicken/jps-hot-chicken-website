"use client";

import { useState } from "react";
import {
  CalendarOff,
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  Repeat,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DAY_KEYS,
  DAY_LABELS,
  TIME_OFF_STATUS_LABELS,
  compareDeletedTimeOff,
  compareEmployees,
  compareTimeOff,
  coversWeek,
  formatDateRange,
  requestDayCount,
  toISODate,
  type DayKey,
  type DeletedTimeOffRequest,
  type Employee,
  type RecurringTimeOff,
  type TimeOffRequest,
  type TimeOffStatus,
} from "@/lib/schedule";

const STATUS_BADGE: Record<TimeOffStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  denied: "bg-rose-100 text-rose-900",
};

const FIELD =
  "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export type NewTimeOffRequest = {
  employeeId: string;
  startDate: string;
  endDate: string;
  reason: string;
};

export type NewRecurringTimeOff = {
  employeeId: string;
  day: DayKey;
  reason: string;
};

type Props = {
  employees: Employee[];
  requests: TimeOffRequest[];
  /** Deleted requests, newest delete first, kept so a delete can be undone. */
  deletedRequests: DeletedTimeOffRequest[];
  recurring: RecurringTimeOff[];
  /** Monday of the week on screen, so overlapping requests can be flagged. */
  weekStart: string;
  onAddRequest: (input: NewTimeOffRequest) => void;
  onSetRequestStatus: (id: string, status: TimeOffStatus) => void;
  onRemoveRequest: (id: string) => void;
  onRestoreRequest: (id: string) => void;
  onAddRecurring: (input: NewRecurringTimeOff) => void;
  onRemoveRecurring: (id: string) => void;
};

/** "3:40 PM" for a delete today, "Aug 12, 3:40 PM" for an older one. */
function formatDeletedAt(iso: string): string {
  const when = new Date(iso);
  const time = when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const isToday = new Date().toDateString() === when.toDateString();
  return isToday
    ? `today at ${time}`
    : `${when.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

/** Section heading shared by both halves of the card. */
function SectionHeader({
  icon,
  title,
  count,
  open,
  onToggle,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <h3 className="flex flex-1 items-center gap-1.5 text-[0.65rem] font-bold tracking-widest text-muted-foreground uppercase">
        {icon}
        {title}
        <span className="font-semibold tracking-normal normal-case">({count})</span>
      </h3>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={open ? `Cancel adding to ${title}` : `Add to ${title}`}
        aria-expanded={open}
        disabled={disabled}
        onClick={onToggle}
      >
        {open ? <X /> : <Plus />}
      </Button>
    </div>
  );
}

export function TimeOffPanel({
  employees,
  requests,
  deletedRequests,
  recurring,
  weekStart,
  onAddRequest,
  onSetRequestStatus,
  onRemoveRequest,
  onRestoreRequest,
  onAddRecurring,
  onRemoveRecurring,
}: Props) {
  const today = toISODate(new Date());
  const [requestOpen, setRequestOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  // The list is about the week being built, so everything else is folded away
  // until asked for. The card's own subtitle still counts every request, so a
  // decision waiting on a later week can't go unnoticed.
  const [allRequests, setAllRequests] = useState(false);
  // Deleted requests are folded away for the same reason, only harder: they are
  // history, and only ever wanted when something was thrown away by mistake.
  const [deletedOpen, setDeletedOpen] = useState(false);

  const [reqEmployee, setReqEmployee] = useState("");
  const [reqStart, setReqStart] = useState(today);
  const [reqEnd, setReqEnd] = useState(today);
  const [reqReason, setReqReason] = useState("");

  const [recEmployee, setRecEmployee] = useState("");
  const [recDay, setRecDay] = useState<DayKey>("monday");
  const [recReason, setRecReason] = useState("");

  const sortedEmployees = [...employees].sort(compareEmployees);
  const nameById = new Map(employees.map((employee) => [employee.id, employee.name]));
  const noStaff = employees.length === 0;

  const sortedRequests = [...requests].sort(compareTimeOff);
  const weekRequests = sortedRequests.filter((request) => coversWeek(request, weekStart));
  const shownRequests = allRequests ? sortedRequests : weekRequests;
  const hiddenRequests = sortedRequests.length - weekRequests.length;
  const sortedRecurring = [...recurring].sort(
    (a, b) =>
      DAY_KEYS.indexOf(a.day) - DAY_KEYS.indexOf(b.day) ||
      (nameById.get(a.employeeId) ?? "").localeCompare(nameById.get(b.employeeId) ?? ""),
  );
  const sortedDeleted = [...deletedRequests].sort(compareDeletedTimeOff);
  const pendingCount = requests.filter((request) => request.status === "pending").length;

  const submitRequest = () => {
    if (!reqEmployee) return;
    // A backwards range is almost always a mis-click on the second picker —
    // treat it as a single day rather than silently storing nothing.
    const end = reqEnd < reqStart ? reqStart : reqEnd;
    onAddRequest({
      employeeId: reqEmployee,
      startDate: reqStart,
      endDate: end,
      reason: reqReason.trim(),
    });
    setReqEmployee("");
    setReqStart(today);
    setReqEnd(today);
    setReqReason("");
    setRequestOpen(false);
  };

  const submitRecurring = () => {
    if (!recEmployee) return;
    onAddRecurring({ employeeId: recEmployee, day: recDay, reason: recReason.trim() });
    setRecEmployee("");
    setRecReason("");
    setRecurringOpen(false);
  };

  return (
    <aside className="flex w-full flex-col rounded-xl border border-border bg-background shadow-sm xl:min-w-0 xl:flex-1">
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <CalendarOff className="size-4 text-brand" />
          Time off
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {pendingCount > 0
            ? `${pendingCount} awaiting a decision`
            : `${requests.length + recurring.length} on record`}
        </p>
      </header>

      {noStaff && (
        <p className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
          Add an employee first — time off is always tied to a person.
        </p>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* ------------------------------------------------------ requests */}
        <section>
          <SectionHeader
            icon={<CalendarOff className="size-3" />}
            title={allRequests ? "Requests" : "Requests this week"}
            count={shownRequests.length}
            open={requestOpen}
            disabled={noStaff}
            onToggle={() => setRequestOpen((open) => !open)}
          />

          {requestOpen && (
            <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/40 p-2.5">
              <label htmlFor="request-employee" className="sr-only">
                Employee
              </label>
              <select
                id="request-employee"
                value={reqEmployee}
                onChange={(event) => setReqEmployee(event.target.value)}
                className={FIELD}
              >
                <option value="">Who is asking?</option>
                {sortedEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>

              {/* Stacked, not side by side: the card is ~250px wide once it sits
                  beside the employee list, which truncates a native date input. */}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="request-start"
                  className="w-9 shrink-0 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  From
                </label>
                <input
                  id="request-start"
                  type="date"
                  value={reqStart}
                  onChange={(event) => {
                    const value = event.target.value || today;
                    setReqStart(value);
                    // Drag the end along so the range never inverts as you type.
                    setReqEnd((end) => (end < value ? value : end));
                  }}
                  className={FIELD}
                />
              </div>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="request-end"
                  className="w-9 shrink-0 text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  To
                </label>
                <input
                  id="request-end"
                  type="date"
                  value={reqEnd}
                  min={reqStart}
                  onChange={(event) => setReqEnd(event.target.value || reqStart)}
                  className={FIELD}
                />
              </div>

              <label htmlFor="request-reason" className="sr-only">
                Reason
              </label>
              <input
                id="request-reason"
                value={reqReason}
                onChange={(event) => setReqReason(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitRequest();
                  }
                }}
                placeholder="Reason (optional)"
                className={FIELD}
              />

              <Button onClick={submitRequest} disabled={!reqEmployee} className="w-full">
                <Plus data-icon="inline-start" />
                Add request
              </Button>
            </div>
          )}

          {shownRequests.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted-foreground/70">
              {sortedRequests.length === 0 ? "No requests yet" : "Nobody is off this week"}
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {shownRequests.map((request) => {
                const days = requestDayCount(request);
                return (
                  <li
                    key={request.id}
                    className="rounded-lg border border-border px-2.5 py-2 text-sm"
                  >
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {nameById.get(request.employeeId) ?? "Removed employee"}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] font-bold ${
                          STATUS_BADGE[request.status]
                        }`}
                      >
                        {TIME_OFF_STATUS_LABELS[request.status]}
                      </span>
                    </div>

                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDateRange(request.startDate, request.endDate)}
                      <span className="mx-1">·</span>
                      {days} {days === 1 ? "day" : "days"}
                      {/* Only worth saying when the list is showing other weeks
                          too. nowrap so the chip moves to the next line whole
                          rather than splitting its background across two. */}
                      {allRequests && coversWeek(request, weekStart) && (
                        <span className="ml-1.5 inline-block rounded bg-brand/15 px-1.5 py-0.5 font-semibold whitespace-nowrap text-brand">
                          This week
                        </span>
                      )}
                    </p>

                    {request.reason && (
                      <p className="mt-1 text-xs break-words text-foreground/80">
                        {request.reason}
                      </p>
                    )}

                    <div className="mt-1.5 flex items-center gap-1">
                      {request.status === "pending" ? (
                        <>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => onSetRequestStatus(request.id, "approved")}
                          >
                            <Check data-icon="inline-start" className="text-emerald-600" />
                            Approve
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => onSetRequestStatus(request.id, "denied")}
                          >
                            <X data-icon="inline-start" className="text-destructive" />
                            Deny
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => onSetRequestStatus(request.id, "pending")}
                        >
                          <RotateCcw data-icon="inline-start" />
                          Reopen
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Delete request for ${
                          nameById.get(request.employeeId) ?? "removed employee"
                        }`}
                        onClick={() => onRemoveRequest(request.id)}
                        className="ml-auto"
                      >
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {hiddenRequests > 0 && (
            <Button
              variant="ghost"
              size="xs"
              aria-expanded={allRequests}
              onClick={() => setAllRequests((open) => !open)}
              className="mt-2 w-full justify-center text-muted-foreground"
            >
              {allRequests ? (
                <>
                  <ChevronUp data-icon="inline-start" />
                  Show only this week
                </>
              ) : (
                <>
                  <ChevronDown data-icon="inline-start" />
                  Show all requests ({sortedRequests.length})
                </>
              )}
            </Button>
          )}

          {/* Deleting a request only sets it aside, so the ones thrown away are
              still here to be looked at and put back. Hidden entirely when
              nothing has been deleted — there would be nothing behind it. */}
          {sortedDeleted.length > 0 && (
            <div className="mt-2 border-t border-dashed border-border pt-2">
              <Button
                variant="ghost"
                size="xs"
                aria-expanded={deletedOpen}
                onClick={() => setDeletedOpen((open) => !open)}
                className="w-full justify-center text-muted-foreground"
              >
                {deletedOpen ? (
                  <>
                    <ChevronUp data-icon="inline-start" />
                    Hide deleted requests
                  </>
                ) : (
                  <>
                    <ChevronDown data-icon="inline-start" />
                    Show deleted requests ({sortedDeleted.length})
                  </>
                )}
              </Button>

              {deletedOpen && (
                <ul className="mt-2 space-y-2">
                  {sortedDeleted.map((request) => {
                    const name = nameById.get(request.employeeId) ?? "Removed employee";
                    const days = requestDayCount(request);
                    return (
                      <li
                        key={request.id}
                        className="rounded-lg border border-dashed border-border bg-muted/30 px-2.5 py-2 text-sm"
                      >
                        <div className="flex items-start gap-2">
                          <span className="min-w-0 flex-1 truncate font-semibold text-muted-foreground">
                            {name}
                          </span>
                          {/* Muted, not the live badge: what it was decided is
                              worth keeping, but it isn't in force any more. */}
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-bold text-muted-foreground">
                            {TIME_OFF_STATUS_LABELS[request.status]}
                          </span>
                        </div>

                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateRange(request.startDate, request.endDate)}
                          <span className="mx-1">·</span>
                          {days} {days === 1 ? "day" : "days"}
                        </p>

                        {request.reason && (
                          <p className="mt-1 text-xs break-words text-muted-foreground">
                            {request.reason}
                          </p>
                        )}

                        <div className="mt-1.5 flex items-center gap-2">
                          <p className="min-w-0 flex-1 truncate text-[0.7rem] text-muted-foreground/80">
                            Deleted {formatDeletedAt(request.deletedAt)}
                          </p>
                          <Button
                            size="xs"
                            variant="outline"
                            aria-label={`Undo deleting ${name}'s request`}
                            onClick={() => onRestoreRequest(request.id)}
                          >
                            <Undo2 data-icon="inline-start" />
                            Undo delete
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* ----------------------------------------------------- recurring */}
        <section className="border-t border-border pt-4">
          <SectionHeader
            icon={<Repeat className="size-3" />}
            title="Recurring"
            count={recurring.length}
            open={recurringOpen}
            disabled={noStaff}
            onToggle={() => setRecurringOpen((open) => !open)}
          />

          {recurringOpen && (
            <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/40 p-2.5">
              <label htmlFor="recurring-employee" className="sr-only">
                Employee
              </label>
              <select
                id="recurring-employee"
                value={recEmployee}
                onChange={(event) => setRecEmployee(event.target.value)}
                className={FIELD}
              >
                <option value="">Who is unavailable?</option>
                {sortedEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>

              <label htmlFor="recurring-day" className="sr-only">
                Day of the week
              </label>
              <select
                id="recurring-day"
                value={recDay}
                onChange={(event) => setRecDay(event.target.value as DayKey)}
                className={FIELD}
              >
                {DAY_KEYS.map((day) => (
                  <option key={day} value={day}>
                    Every {DAY_LABELS[day]}
                  </option>
                ))}
              </select>

              <label htmlFor="recurring-reason" className="sr-only">
                Reason
              </label>
              <input
                id="recurring-reason"
                value={recReason}
                onChange={(event) => setRecReason(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitRecurring();
                  }
                }}
                placeholder="Reason (optional)"
                className={FIELD}
              />

              <Button onClick={submitRecurring} disabled={!recEmployee} className="w-full">
                <Plus data-icon="inline-start" />
                Add recurring
              </Button>
            </div>
          )}

          {sortedRecurring.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted-foreground/70">Nothing recurring yet</p>
          ) : (
            <ul className="mt-2 space-y-0.5">
              {sortedRecurring.map((entry) => {
                const name = nameById.get(entry.employeeId) ?? "Removed employee";
                return (
                  <li
                    key={entry.id}
                    className="group flex items-start gap-2 rounded-md px-2 py-1 hover:bg-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-semibold">{name}</span>
                        <span className="text-muted-foreground"> · every {DAY_LABELS[entry.day]}</span>
                      </p>
                      {entry.reason && (
                        <p className="text-xs break-words text-muted-foreground">{entry.reason}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${name}'s recurring ${DAY_LABELS[entry.day]} time off`}
                      onClick={() => onRemoveRecurring(entry.id)}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}
