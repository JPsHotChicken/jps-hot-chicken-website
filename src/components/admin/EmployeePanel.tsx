"use client";

import { useState } from "react";
import { KeyRound, Plus, RefreshCw, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  SHIFT_GROUPS,
  SHIFT_GROUP_LABELS,
  employeeWeek,
  employeesByGroup,
  type Employee,
  type ShiftGroup,
  type WeekSchedule,
} from "@/lib/schedule";

const GROUP_DOT: Record<ShiftGroup, string> = {
  morning: "bg-amber-400",
  night: "bg-indigo-400",
  other: "bg-emerald-400",
};

type Props = {
  employees: Employee[];
  /** The week on screen, so each person can show their hours for it. */
  week: WeekSchedule;
  onAdd: (name: string, group: ShiftGroup) => void;
  onRemove: (id: string) => void;
  onRegenerateCode: (id: string) => void;
};

export function EmployeePanel({
  employees,
  week,
  onAdd,
  onRemove,
  onRegenerateCode,
}: Props) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState<ShiftGroup>("morning");
  const grouped = employeesByGroup(employees);
  const hoursById = new Map(
    employees.map((employee) => [employee.id, employeeWeek(week, employee.id).totalHours]),
  );

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, group);
    setName("");
  };

  // Width comes from the sidebar wrapper — this sits beside the time-off card.
  return (
    <aside className="flex w-full flex-col rounded-xl border border-border bg-background shadow-sm xl:min-w-0 xl:flex-1">
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <Users className="size-4 text-brand" />
          Employees
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {employees.length} {employees.length === 1 ? "person" : "people"}
        </p>
      </header>

      {/* Add form */}
      <div className="space-y-2 border-b border-border p-4">
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
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <label htmlFor="employee-group" className="sr-only">
          Shift group
        </label>
        <select
          id="employee-group"
          value={group}
          onChange={(event) => setGroup(event.target.value as ShiftGroup)}
          className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {SHIFT_GROUPS.map((value) => (
            <option key={value} value={value}>
              {SHIFT_GROUP_LABELS[value]}
            </option>
          ))}
        </select>
        <Button onClick={submit} disabled={!name.trim()} className="w-full">
          <Plus data-icon="inline-start" />
          Add employee
        </Button>
      </div>

      {/* Grouped list */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {SHIFT_GROUPS.map((value) => (
          <div key={value}>
            <h3 className="flex items-center gap-2 text-[0.65rem] font-bold tracking-widest text-muted-foreground uppercase">
              <span className={`size-2 rounded-full ${GROUP_DOT[value]}`} />
              {SHIFT_GROUP_LABELS[value]}
            </h3>
            {grouped[value].length === 0 ? (
              <p className="mt-1.5 text-xs text-muted-foreground/70">None yet</p>
            ) : (
              <ul className="mt-1.5 space-y-0.5">
                {grouped[value].map((employee) => {
                  const hours = hoursById.get(employee.id) ?? 0;
                  return (
                    <li
                      key={employee.id}
                      className="group rounded-md px-2 py-1 text-sm hover:bg-muted"
                    >
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{employee.name}</span>
                        <span
                          title={`${hours} scheduled ${hours === 1 ? "hour" : "hours"} this week`}
                          className={`shrink-0 text-xs font-semibold tabular-nums ${
                            hours > 0 ? "text-muted-foreground" : "text-muted-foreground/50"
                          }`}
                        >
                          {hours}h
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${employee.name}`}
                          onClick={() => onRemove(employee.id)}
                        >
                          <Trash2 className="text-destructive" />
                        </Button>
                      </div>

                      {/* The code this person types in at /staff. Shown so it can
                          be read out to them; the refresh issues a new one. */}
                      <div className="flex items-center gap-1.5">
                        <KeyRound className="size-3 shrink-0 text-muted-foreground/60" />
                        <span className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
                          {employee.loginCode ?? "— — — —"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Issue a new sign-in code for ${employee.name}`}
                          title="Issue a new code"
                          onClick={() => onRegenerateCode(employee.id)}
                          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <RefreshCw />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
