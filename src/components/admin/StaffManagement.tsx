"use client";

import { useState } from "react";
import { Check, Dices, KeyRound, LoaderCircle, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  /** Resolves to the saved code, or rejects with a message worth showing. */
  onSaveCode: (id: string, code: string) => Promise<void>;
  onRandomCode: (id: string) => Promise<void>;
};

/** One employee row: their name, and the code they sign in with. */
function EmployeeRow({
  employee,
  payrollNames = [],
  onSaveCode,
  onRandomCode,
  onForgetPayrollName,
}: {
  employee: Employee;
  payrollNames?: string[];
  onSaveCode: (id: string, code: string) => Promise<void>;
  onRandomCode: (id: string) => Promise<void>;
  onForgetPayrollName?: (payrollName: string) => Promise<void>;
}) {
  const saved = employee.loginCode ?? "";
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // The row is only "dirty" against what's actually stored, so a code changed in
  // another tab (or by the dice) settles back to a clean state on its own.
  const dirty = draft !== saved;
  const valid = /^[0-9]{4}$/.test(draft);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1800);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save that code.");
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      await onSaveCode(employee.id, draft);
    });

  const randomise = () =>
    run(async () => {
      await onRandomCode(employee.id);
      setError(null);
    });

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{employee.name}</p>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {saved ? "Signs in at /staff with this code" : "No code yet — they can't sign in"}
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

      <div className="flex items-center gap-2">
        <label htmlFor={`code-${employee.id}`} className="sr-only">
          Sign-in code for {employee.name}
        </label>
        <input
          id={`code-${employee.id}`}
          value={draft}
          onChange={(event) => {
            // Digits only, never longer than four — the field can't hold
            // anything the database would reject.
            setDraft(event.target.value.replace(/\D/g, "").slice(0, 4));
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && dirty && valid) {
              event.preventDefault();
              void save();
            }
          }}
          inputMode="numeric"
          placeholder="––––"
          aria-invalid={draft.length > 0 && !valid}
          className="w-24 rounded-lg border border-border bg-background px-2.5 py-1.5 text-center font-mono text-base tracking-[0.3em] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-[invalid=true]:border-destructive"
        />

        <Button
          size="sm"
          onClick={save}
          disabled={busy || !dirty || !valid}
          title={
            !valid && draft.length > 0
              ? "A code has to be exactly four digits"
              : "Save this code"
          }
        >
          {busy ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" />
          ) : justSaved && !dirty ? (
            <Check data-icon="inline-start" />
          ) : null}
          {busy ? "Saving…" : justSaved && !dirty ? "Saved" : "Save"}
        </Button>

        <Button
          variant="outline"
          size="icon-sm"
          onClick={randomise}
          disabled={busy}
          aria-label={`Pick a random code for ${employee.name}`}
          title="Pick a random unused code"
        >
          <Dices />
        </Button>
      </div>
    </li>
  );
}

/**
 * Staff management: who works here and what they type in to see their schedule.
 * Codes live here rather than on the scheduler's employee card, which is for
 * dragging shifts, not admin.
 */
export function StaffManagement({
  employees,
  payrollNames = [],
  onSaveCode,
  onRandomCode,
  onForgetPayrollName,
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
            <span className="font-mono">/staff</span> with their four digit code
          </p>
        </header>

        {employees.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No employees yet. Add them from the schedule maker.
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
                      key={`${employee.id}-${employee.loginCode ?? "none"}`}
                      employee={employee}
                      payrollNames={namesFor(employee.id)}
                      onSaveCode={onSaveCode}
                      onRandomCode={onRandomCode}
                      onForgetPayrollName={onForgetPayrollName}
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
            Codes are shown so you can read them out. Two people can&apos;t share one — the code
            alone is what identifies who is signing in.
          </p>
        </footer>
      </div>
    </div>
  );
}
