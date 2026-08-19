"use client";

import { useState } from "react";
import { GraduationCap, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FIELD_CLASS, LABEL_CLASS } from "./field";
import {
  PERFORMANCE_ROLES,
  ROLE_LABELS,
  crossTrainingIndex,
  formatTenure,
  type PerformanceEmployee,
  type PerformanceRole,
  type Station,
} from "@/lib/performance";

type Props = {
  employees: PerformanceEmployee[];
  stations: Station[];
  onUpdate: (
    id: string,
    details: { role: PerformanceRole; hireDate: string | null; active: boolean },
  ) => Promise<void>;
  onCertifications: (id: string, stationIds: string[]) => Promise<void>;
};

/**
 * A little bar for the cross-training index.
 *
 * Drawn rather than written out because it is the one figure on this page that
 * is worth comparing at a glance down a column — who is one station away from
 * covering a shift on their own, and who has been on the same station for a
 * year.
 */
function TrainingBar({ percent }: { percent: number }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="presentation"
      aria-hidden
    >
      <div
        className="h-full rounded-full bg-brand transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function EmployeeCard({
  employee,
  stations,
  onUpdate,
  onCertifications,
}: {
  employee: PerformanceEmployee;
  stations: Station[];
  onUpdate: Props["onUpdate"];
  onCertifications: Props["onCertifications"];
}) {
  const [open, setOpen] = useState(false);
  const training = crossTrainingIndex(employee, stations);
  const tenure = formatTenure(employee.hireDate);

  const update = (changes: Partial<{ role: PerformanceRole; hireDate: string | null; active: boolean }>) =>
    void onUpdate(employee.id, {
      role: employee.role,
      hireDate: employee.hireDate,
      active: employee.active,
      ...changes,
    });

  const toggleStation = (stationId: string) => {
    const next = employee.stationIds.includes(stationId)
      ? employee.stationIds.filter((id) => id !== stationId)
      : [...employee.stationIds, stationId];
    void onCertifications(employee.id, next);
  };

  return (
    <li className={`px-4 py-3 ${employee.active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{employee.name}</p>
          <p className="text-xs text-muted-foreground">
            {ROLE_LABELS[employee.role]}
            {tenure && ` · ${tenure}`}
            {!employee.active && " · Inactive"}
          </p>
        </div>

        <div className="w-32">
          <label htmlFor={`role-${employee.id}`} className={LABEL_CLASS}>
            Role
          </label>
          <select
            id={`role-${employee.id}`}
            value={employee.role}
            onChange={(event) => update({ role: event.target.value as PerformanceRole })}
            className={`mt-1 ${FIELD_CLASS}`}
          >
            {PERFORMANCE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>

        <div className="w-36">
          <label htmlFor={`hired-${employee.id}`} className={LABEL_CLASS}>
            Hired
          </label>
          <input
            id={`hired-${employee.id}`}
            type="date"
            value={employee.hireDate ?? ""}
            onChange={(event) => update({ hireDate: event.target.value || null })}
            className={`mt-1 ${FIELD_CLASS}`}
          />
        </div>

        <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <input
            type="checkbox"
            checked={employee.active}
            onChange={(event) => update({ active: event.target.checked })}
            className="size-4 accent-brand"
          />
          Active
        </label>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <TrainingBar percent={training.percent} />
        </div>
        <p className="shrink-0 text-xs text-muted-foreground">
          Certified at {training.certified} of {training.total} · {training.percent}%
        </p>
        <Button variant="ghost" size="xs" aria-expanded={open} onClick={() => setOpen(!open)}>
          <GraduationCap data-icon="inline-start" />
          {open ? "Done" : "Stations"}
        </Button>
      </div>

      {open && (
        <fieldset className="mt-2 rounded-lg border border-border p-2.5">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">
            Signed off on
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {stations.map((station) => (
              <label key={station.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={employee.stationIds.includes(station.id)}
                  onChange={() => toggleStation(station.id)}
                  className="size-4 accent-brand"
                />
                {station.name}
              </label>
            ))}
            {stations.length === 0 && (
              <p className="text-sm text-muted-foreground">Add a station first.</p>
            )}
          </div>
        </fieldset>
      )}
    </li>
  );
}

/**
 * The roster.
 *
 * The names come from the scheduler rather than being typed again — there is
 * one list of who works here, and this page adds the three things it needs on
 * top of it. Somebody who has left is marked inactive rather than deleted,
 * because deleting them here would delete them from the schedule too.
 */
export function RosterPanel({ employees, stations, onUpdate, onCertifications }: Props) {
  const [showInactive, setShowInactive] = useState(false);
  const shown = showInactive ? employees : employees.filter((employee) => employee.active);
  const hidden = employees.length - shown.length;

  return (
    <section className="rounded-xl border border-border bg-background shadow-sm">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="mr-auto">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold">
            <UserRound className="size-4 text-brand" />
            Roster
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Role, hire date and which stations each person is signed off on.
          </p>
        </div>
        {hidden > 0 && !showInactive && (
          <Button variant="ghost" size="sm" onClick={() => setShowInactive(true)}>
            Show {hidden} inactive
          </Button>
        )}
        {showInactive && (
          <Button variant="ghost" size="sm" onClick={() => setShowInactive(false)}>
            Hide inactive
          </Button>
        )}
      </header>

      <ul className="divide-y divide-border">
        {shown.map((employee) => (
          <EmployeeCard
            key={employee.id}
            employee={employee}
            stations={stations}
            onUpdate={onUpdate}
            onCertifications={onCertifications}
          />
        ))}
        {shown.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nobody on the roster yet — add your team in Staff management first.
          </li>
        )}
      </ul>
    </section>
  );
}
