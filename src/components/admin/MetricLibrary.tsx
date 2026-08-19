"use client";

import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Copy, Pencil, Plus, Ruler, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FIELD_CLASS, LABEL_CLASS } from "./field";
import { MetricEditor } from "./MetricEditor";
import {
  FREQUENCY_LABELS,
  GENERAL_CATEGORY,
  PERFORMANCE_ROLES,
  ROLE_LABELS,
  SCOPE_LABELS,
  cloneRoleAssignment,
  cloneStationAssignment,
  compareMetrics,
  emptyMetric,
  formatBands,
  formatTarget,
  type Metric,
  type MetricDraft,
  type PerformanceRole,
  type Station,
} from "@/lib/performance";

type Props = {
  metrics: Metric[];
  stations: Station[];
  onSave: (id: string | null, draft: MetricDraft) => Promise<void>;
  onArchive: (id: string, archived: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCloneToRole: (metricIds: string[], role: PerformanceRole) => Promise<void>;
  onCloneToStation: (metricIds: string[], stationId: string) => Promise<void>;
};

/** A metric, stripped back to the fields the editor owns. */
function toDraft(metric: Metric): MetricDraft {
  const { id: _id, sortOrder: _sortOrder, ...draft } = metric;
  void _id;
  void _sortOrder;
  return draft;
}

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
    {children}
  </span>
);

/**
 * Copy one role's or station's metric set onto another.
 *
 * The button says how many metrics would actually move, and goes quiet when
 * that is none — cloning is additive, so running it on a target that already
 * has the lot is a no-op, and a button that claims otherwise is a lie.
 */
function ClonePanel({
  metrics,
  stations,
  onCloneToRole,
  onCloneToStation,
}: Pick<Props, "metrics" | "stations" | "onCloneToRole" | "onCloneToStation">) {
  const [mode, setMode] = useState<"role" | "station">("role");
  const [source, setSource] = useState<string>("crew");
  const [target, setTarget] = useState<string>("shift_lead");
  const [busy, setBusy] = useState(false);

  const options =
    mode === "role"
      ? PERFORMANCE_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))
      : stations.map((station) => ({ value: station.id, label: station.name }));

  const pending =
    mode === "role"
      ? cloneRoleAssignment(metrics, source as PerformanceRole, target as PerformanceRole)
      : cloneStationAssignment(metrics, source, target);

  const run = async () => {
    setBusy(true);
    try {
      if (mode === "role") await onCloneToRole(pending, target as PerformanceRole);
      else await onCloneToStation(pending, target);
    } finally {
      setBusy(false);
    }
  };

  const swap = (next: "role" | "station") => {
    setMode(next);
    if (next === "role") {
      setSource("crew");
      setTarget("shift_lead");
    } else {
      setSource(stations[0]?.id ?? "");
      setTarget(stations[1]?.id ?? "");
    }
  };

  return (
    <div className="border-t border-border px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Copy className="size-3.5" />
        Clone a metric set
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="clone-mode" className={LABEL_CLASS}>
            Between
          </label>
          <select
            id="clone-mode"
            value={mode}
            onChange={(event) => swap(event.target.value as "role" | "station")}
            className={`mt-1 ${FIELD_CLASS}`}
          >
            <option value="role">Roles</option>
            <option value="station">Stations</option>
          </select>
        </div>

        <div>
          <label htmlFor="clone-from" className={LABEL_CLASS}>
            From
          </label>
          <select
            id="clone-from"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className={`mt-1 ${FIELD_CLASS}`}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="clone-to" className={LABEL_CLASS}>
            To
          </label>
          <select
            id="clone-to"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className={`mt-1 ${FIELD_CLASS}`}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <Button size="sm" variant="outline" onClick={run} disabled={busy || pending.length === 0}>
          {pending.length === 0
            ? "Nothing to copy"
            : `Copy ${pending.length} metric${pending.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}

/**
 * The metric library.
 *
 * Everything measured anywhere lives in this one list, and what changes between
 * a crew sheet and a manager's is which of these are ticked for that role — not
 * a second list. That is why cloning exists at all: a shift lead is mostly a
 * crew member with four more things on the page, and building that by hand is
 * how the two quietly stop agreeing.
 */
export function MetricLibrary({
  metrics,
  stations,
  onSave,
  onArchive,
  onDelete,
  onCloneToRole,
  onCloneToStation,
}: Props) {
  const [editing, setEditing] = useState<{ id: string | null; draft: MetricDraft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const stationName = useMemo(
    () => new Map(stations.map((station) => [station.id, station.name])),
    [stations],
  );

  const categories = useMemo(
    () => [...new Set(metrics.map((metric) => metric.category).filter(Boolean))].sort(),
    [metrics],
  );

  const groups = useMemo(() => {
    const shown = showArchived ? metrics : metrics.filter((metric) => !metric.archived);
    const map = new Map<string, Metric[]>();
    for (const metric of [...shown].sort(compareMetrics)) {
      const category = metric.category.trim() || GENERAL_CATEGORY;
      const rows = map.get(category);
      if (rows) rows.push(metric);
      else map.set(category, [metric]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [metrics, showArchived]);

  const archivedCount = metrics.filter((metric) => metric.archived).length;

  const save = async (draft: MetricDraft) => {
    setSaving(true);
    try {
      await onSave(editing?.id ?? null, draft);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-background shadow-sm">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="mr-auto">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold">
            <Ruler className="size-4 text-brand" />
            Metrics
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What gets measured, what good looks like, and whose sheet it prints on.
          </p>
        </div>

        {archivedCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "Hide" : `Show ${archivedCount}`} archived
          </Button>
        )}

        <Button
          size="sm"
          onClick={() => setEditing({ id: null, draft: emptyMetric() })}
          disabled={editing !== null}
        >
          <Plus data-icon="inline-start" />
          New metric
        </Button>
      </header>

      {editing && (
        <div className="border-b border-border p-4">
          <MetricEditor
            draft={editing.draft}
            stations={stations}
            categories={categories}
            saving={saving}
            onSave={save}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {groups.map(([category, rows]) => (
        <div key={category}>
          <h3 className="bg-muted px-4 py-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {category}
          </h3>
          <ul className="divide-y divide-border">
            {rows.map((metric) => (
              <li
                key={metric.id}
                className={`flex flex-wrap items-start gap-3 px-4 py-3 ${
                  metric.archived ? "opacity-55" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {metric.name}
                    {metric.archived && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        Archived
                      </span>
                    )}
                  </p>
                  {metric.description && (
                    <p className="text-xs text-muted-foreground">{metric.description}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Target <span className="font-semibold">{formatTarget(metric)}</span>
                    {formatBands(metric) && ` · ${formatBands(metric)}`}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Chip>{SCOPE_LABELS[metric.scope]}</Chip>
                    <Chip>{FREQUENCY_LABELS[metric.frequency]}</Chip>
                    <Chip>weight {metric.weight}</Chip>
                    <Chip>{metric.lagging ? "lagging" : "leading"}</Chip>
                    {metric.scope === "station"
                      ? metric.stationIds.map((id) => (
                          <Chip key={id}>{stationName.get(id) ?? "Deleted station"}</Chip>
                        ))
                      : metric.roles.map((role) => <Chip key={role}>{ROLE_LABELS[role]}</Chip>)}
                  </div>
                </div>

                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${metric.name}`}
                    disabled={editing !== null}
                    onClick={() => setEditing({ id: metric.id, draft: toDraft(metric) })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={
                      metric.archived ? `Restore ${metric.name}` : `Archive ${metric.name}`
                    }
                    onClick={() => void onArchive(metric.id, !metric.archived)}
                  >
                    {metric.archived ? <ArchiveRestore /> : <Archive />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${metric.name}`}
                    onClick={() => {
                      if (window.confirm(`Delete "${metric.name}" for good?`)) {
                        void onDelete(metric.id);
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {groups.length === 0 && !editing && (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          No metrics yet. Add the first one and it will start appearing on sheets.
        </p>
      )}

      <ClonePanel
        metrics={metrics}
        stations={stations}
        onCloneToRole={onCloneToRole}
        onCloneToStation={onCloneToStation}
      />
    </section>
  );
}
