"use client";

import { Users } from "lucide-react";

import { employeeColors } from "@/lib/employee-colors";
import {
  SHIFT_GROUPS,
  SHIFT_GROUP_LABELS,
  employeeWeek,
  employeesByGroup,
  formatHours,
  type Employee,
  type WeekSchedule,
} from "@/lib/schedule";

type Props = {
  employees: Employee[];
  /** The week on screen, so each person can show their hours for it. */
  week: WeekSchedule;
  /** Jump to Staff management, where people are hired and let go. */
  onManageStaff?: () => void;
};

/**
 * The roster beside the grid: who can be dropped into a shift, what colour they
 * are drawn in, and how many hours the week already gives them.
 *
 * Read only by design — adding and removing people lives in Staff management,
 * so a click while building a week can't delete somebody's shifts.
 */
export function EmployeePanel({ employees, week, onManageStaff }: Props) {
  const grouped = employeesByGroup(employees);
  // This list doubles as the grid's key: the dot beside a name is the colour
  // their shifts are drawn in.
  const colorById = employeeColors(employees);
  const hoursById = new Map(
    employees.map((employee) => [employee.id, employeeWeek(week, employee.id).totalHours]),
  );

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

      {/* Grouped list */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {employees.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nobody on the roster yet
            {onManageStaff ? (
              <>
                {" — add your team in "}
                <button
                  type="button"
                  onClick={onManageStaff}
                  className="font-semibold text-brand underline underline-offset-2 hover:no-underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  Staff management
                </button>
                .
              </>
            ) : (
              "."
            )}
          </p>
        )}

        {SHIFT_GROUPS.map((value) => (
          <div key={value}>
            <h3 className="text-[0.65rem] font-bold tracking-widest text-muted-foreground uppercase">
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
                      className="flex items-center gap-2 rounded-md px-2 py-1 text-sm"
                    >
                      <span
                        aria-hidden
                        className={`size-2.5 shrink-0 rounded-full ${
                          colorById.get(employee.id)?.dot ?? "bg-muted"
                        }`}
                      />
                      <span className="min-w-0 flex-1 truncate">{employee.name}</span>
                      <span
                        title={`${formatHours(hours)} scheduled ${hours === 1 ? "hour" : "hours"} this week`}
                        className={`shrink-0 text-xs font-semibold tabular-nums ${
                          hours > 0 ? "text-muted-foreground" : "text-muted-foreground/50"
                        }`}
                      >
                        {formatHours(hours)}h
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>

      {employees.length > 0 && onManageStaff && (
        <footer className="border-t border-border px-4 py-2.5">
          <button
            type="button"
            onClick={onManageStaff}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Add or remove people in Staff management
          </button>
        </footer>
      )}
    </aside>
  );
}
