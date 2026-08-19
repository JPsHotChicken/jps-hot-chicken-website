"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, MapPin, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FIELD_CLASS, LABEL_CLASS } from "./field";
import type { PerformanceEmployee, Station } from "@/lib/performance";

type Props = {
  stations: Station[];
  employees: PerformanceEmployee[];
  /** How many live metrics point at each station, keyed by station id. */
  metricCounts: Record<string, number>;
  onAdd: (name: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (ids: string[]) => Promise<void>;
};

/**
 * The station list.
 *
 * Every station here is the owner's own — the six the database ships with are a
 * starting point that can be renamed or deleted like any other. Deleting one is
 * the destructive action on this page, because it takes its metric assignments
 * and everybody's certification for it along with it, so it says so first.
 */
export function StationPanel({
  stations,
  employees,
  metricCounts,
  onAdd,
  onRename,
  onDelete,
  onReorder,
}: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onAdd(trimmed);
      setName("");
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, delta: number) => {
    const next = [...stations];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void onReorder(next.map((station) => station.id));
  };

  return (
    <section className="rounded-xl border border-border bg-background shadow-sm">
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <MapPin className="size-4 text-brand" />
          Stations
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The places somebody can be signed off on. These drive station sheets and the
          cross-training index.
        </p>
      </header>

      <ul className="divide-y divide-border">
        {stations.map((station, index) => {
          const certified = employees.filter(
            (employee) => employee.active && employee.stationIds.includes(station.id),
          ).length;
          const metrics = metricCounts[station.id] ?? 0;

          return (
            <li key={station.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
              <div className="flex flex-col">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${station.name} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${station.name} down`}
                  disabled={index === stations.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ChevronDown />
                </Button>
              </div>

              <div className="min-w-0 flex-1">
                <label htmlFor={`station-${station.id}`} className="sr-only">
                  Station name
                </label>
                <input
                  id={`station-${station.id}`}
                  defaultValue={station.name}
                  maxLength={60}
                  // Saved on blur rather than on every keystroke: renaming is
                  // rare, and a write per character is a write per character.
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (value && value !== station.name) void onRename(station.id, value);
                    else event.target.value = station.name;
                  }}
                  className={FIELD_CLASS}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {metrics} metric{metrics === 1 ? "" : "s"} · {certified} certified
                </p>
              </div>

              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${station.name}`}
                onClick={() => {
                  const warning =
                    `Delete ${station.name}?\n\n` +
                    `Its ${metrics} metric assignment${metrics === 1 ? "" : "s"} and ` +
                    `${certified} certification${certified === 1 ? "" : "s"} go with it.`;
                  if (window.confirm(warning)) void onDelete(station.id);
                }}
              >
                <Trash2 />
              </Button>
            </li>
          );
        })}

        {stations.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            No stations yet. Add the first one below.
          </li>
        )}
      </ul>

      <div className="flex items-end gap-2 border-t border-border px-4 py-3">
        <div className="flex-1">
          <label htmlFor="new-station" className={LABEL_CLASS}>
            New station
          </label>
          <input
            id="new-station"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void add();
            }}
            maxLength={60}
            placeholder="Salad bar"
            className={`mt-1 ${FIELD_CLASS}`}
          />
        </div>
        <Button size="sm" onClick={add} disabled={busy || !name.trim()}>
          <Plus data-icon="inline-start" />
          Add
        </Button>
      </div>
    </section>
  );
}
