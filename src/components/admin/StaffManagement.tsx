"use client";

import { useState } from "react";
import {
  Check,
  Dices,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Plus,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { STAFF_PASSWORD_MIN_LENGTH } from "@/lib/staff-auth";
import {
  SHIFT_GROUPS,
  SHIFT_GROUP_LABELS,
  employeesByGroup,
  type Employee,
  type ShiftGroup,
} from "@/lib/schedule";

const GROUP_DOT: Record<ShiftGroup, string> = {
  morning: "bg-amber-400",
  night: "bg-indigo-400",
  other: "bg-emerald-400",
};

type Props = {
  employees: Employee[];
  /** How payroll spells each person, learned when a pay stub was assigned. */
  payrollNames?: { employeeId: string; payrollName: string }[];
  onForgetPayrollName?: (payrollName: string) => Promise<void>;
  /** Rejects with a message worth showing against the row. */
  onSavePassword: (id: string, password: string) => Promise<void>;
  onRegenerateSetupCode: (id: string) => Promise<void>;
  onAdd: (name: string, group: ShiftGroup) => void;
  onRemove: (id: string) => void;
};

/** Hire somebody: a name and which shift they belong to. */
function AddEmployeeForm({ onAdd }: { onAdd: (name: string, group: ShiftGroup) => void }) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState<ShiftGroup>("morning");

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, group);
    setName("");
  };

  return (
    <div className="border-b border-border px-4 py-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <UserPlus className="size-4 text-muted-foreground" />
        Add someone to the team
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label htmlFor="employee-name" className="sr-only">
          Employee name
        </label>
        <input
          id="employee-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Employee name"
          className="min-w-40 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <label htmlFor="employee-group" className="sr-only">
          Shift group
        </label>
        <select
          id="employee-group"
          value={group}
          onChange={(event) => setGroup(event.target.value as ShiftGroup)}
          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {SHIFT_GROUPS.map((value) => (
            <option key={value} value={value}>
              {SHIFT_GROUP_LABELS[value]}
            </option>
          ))}
        </select>
        <Button onClick={submit} disabled={!name.trim()}>
          <Plus data-icon="inline-start" />
          Add employee
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        They show up on the schedule maker straight away, with a five digit code to read out so they
        can set their own password.
      </p>
    </div>
  );
}

/**
 * One employee row: their name, the code that gets them started, and the
 * password they ended up with.
 *
 * The password is covered until it is asked for. Not because the owner
 * shouldn't see it — being able to read one back is exactly why it is stored
 * legibly — but because Staff management is opened in front of other people,
 * and a screen full of everybody's passwords is a different thing from looking
 * one up.
 */
function EmployeeRow({
  employee,
  payrollNames = [],
  onSavePassword,
  onRegenerateSetupCode,
  onForgetPayrollName,
  onRemove,
}: {
  employee: Employee;
  payrollNames?: string[];
  onSavePassword: (id: string, password: string) => Promise<void>;
  onRegenerateSetupCode: (id: string) => Promise<void>;
  onForgetPayrollName?: (payrollName: string) => Promise<void>;
  onRemove: (id: string) => void;
}) {
  const saved = employee.password ?? "";

  const [revealed, setRevealed] = useState(false);
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Re-sync when the stored password changes underneath the row — a dashboard
  // reload after a failed write, say — so the box never shows a value that
  // isn't the one in the database.
  const [lastSeen, setLastSeen] = useState(saved);
  if (lastSeen !== saved) {
    setLastSeen(saved);
    setDraft(saved);
  }

  const dirty = draft !== saved;
  const valid = draft.length >= STAFF_PASSWORD_MIN_LENGTH;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1800);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  };

  const savePassword = () =>
    run(async () => {
      await onSavePassword(employee.id, draft);
    });

  const regenerate = () =>
    run(async () => {
      await onRegenerateSetupCode(employee.id);
    });

  /** Letting somebody go takes their shifts and time off with them. */
  const remove = () => {
    if (
      !confirm(
        `Remove ${employee.name}?\n\n` +
          "Every shift they're on and all of their time off goes with them. This can't be undone.",
      )
    ) {
      return;
    }
    onRemove(employee.id);
  };

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{employee.name}</p>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {saved
                ? "Signs in at /staff with their password"
                : "Hasn't set a password yet — read them the code"}
            </p>
          )}

          {payrollNames.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {payrollNames.map((payrollName) => (
                <li
                  key={payrollName}
                  className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
                  title="Pay stubs printed with this name go to this person"
                >
                  <span className="capitalize">{payrollName}</span>
                  {onForgetPayrollName && (
                    <button
                      type="button"
                      onClick={() => void onForgetPayrollName(payrollName)}
                      aria-label={`Stop matching "${payrollName}" to ${employee.name}`}
                      className="rounded-full p-0.5 hover:bg-background"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={remove}
          aria-label={`Remove ${employee.name}`}
          title="Remove this person, and everything they're scheduled for"
        >
          <Trash2 className="text-destructive" />
        </Button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className="mb-1 text-[0.65rem] font-bold tracking-widest text-muted-foreground uppercase">
            Setup code
          </p>
          <div className="flex items-center gap-1.5">
            <span
              className="rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-base tracking-[0.25em]"
              aria-label={`Setup code for ${employee.name}`}
            >
              {employee.setupCode ?? "—————"}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={regenerate}
              disabled={busy}
              aria-label={`Pick a new setup code for ${employee.name}`}
              title="Pick a new code. Their password is left alone."
            >
              <Dices />
            </Button>
          </div>
        </div>

        <div className="min-w-56 flex-1">
          <p className="mb-1 text-[0.65rem] font-bold tracking-widest text-muted-foreground uppercase">
            Password
          </p>
          <div className="flex items-center gap-1.5">
            <label htmlFor={`password-${employee.id}`} className="sr-only">
              Password for {employee.name}
            </label>
            <input
              id={`password-${employee.id}`}
              type={revealed ? "text" : "password"}
              value={draft}
              readOnly={!revealed}
              onChange={(event) => {
                setDraft(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && dirty && valid) {
                  event.preventDefault();
                  void savePassword();
                }
              }}
              placeholder={saved ? "" : "Not set yet"}
              autoComplete="off"
              aria-invalid={draft.length > 0 && !valid}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-sm outline-none read-only:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-[invalid=true]:border-destructive"
            />

            <Button
              variant="outline"
              size="sm"
              onClick={() => setRevealed((shown) => !shown)}
              aria-pressed={revealed}
              title={revealed ? "Cover it back up" : "Show it, and let it be edited"}
            >
              {revealed ? <EyeOff data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
              {revealed ? "Hide" : "View password"}
            </Button>

            {revealed && (
              <Button
                size="sm"
                onClick={savePassword}
                disabled={busy || !dirty || !valid}
                title={
                  !valid && draft.length > 0
                    ? `A password has to be at least ${STAFF_PASSWORD_MIN_LENGTH} characters`
                    : "Save this password"
                }
              >
                {busy ? (
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                ) : justSaved && !dirty ? (
                  <Check data-icon="inline-start" />
                ) : null}
                {busy ? "Saving…" : justSaved && !dirty ? "Saved" : "Save"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/**
 * Staff management: who works here and what they type in to see their schedule.
 * Hiring, letting go, codes and passwords all live here rather than on the
 * scheduler's employee card, which is for dragging shifts, not admin.
 */
export function StaffManagement({
  employees,
  payrollNames = [],
  onSavePassword,
  onRegenerateSetupCode,
  onForgetPayrollName,
  onAdd,
  onRemove,
}: Props) {
  const grouped = employeesByGroup(employees);
  const namesFor = (employeeId: string) =>
    payrollNames.filter((entry) => entry.employeeId === employeeId).map((e) => e.payrollName);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:px-6">
      <div className="rounded-xl border border-border bg-background shadow-sm">
        <header className="border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold">
            <Users className="size-4 text-brand" />
            Staff management
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {employees.length} {employees.length === 1 ? "person" : "people"} · each signs in at{" "}
            <span className="font-mono">/staff</span> with their own password
          </p>
        </header>

        <AddEmployeeForm onAdd={onAdd} />

        {employees.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No employees yet. Add your first one above.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {SHIFT_GROUPS.filter((group) => grouped[group].length > 0).map((group) => (
              <section key={group}>
                <h3 className="flex items-center gap-2 bg-muted/50 px-4 py-1.5 text-[0.65rem] font-bold tracking-widest text-muted-foreground uppercase">
                  <span className={`size-2 rounded-full ${GROUP_DOT[group]}`} />
                  {SHIFT_GROUP_LABELS[group]}
                </h3>
                <ul className="divide-y divide-border">
                  {grouped[group].map((employee) => (
                    <EmployeeRow
                      key={employee.id}
                      employee={employee}
                      payrollNames={namesFor(employee.id)}
                      onSavePassword={onSavePassword}
                      onRegenerateSetupCode={onRegenerateSetupCode}
                      onForgetPayrollName={onForgetPayrollName}
                      onRemove={onRemove}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <footer className="flex items-start gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <KeyRound className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Read somebody their five digit code and they set their own password at{" "}
            <span className="font-mono">/staff</span>. The password is the whole sign-in — there is
            no name alongside it — so no two people can share one.
          </p>
        </footer>
      </div>
    </div>
  );
}
