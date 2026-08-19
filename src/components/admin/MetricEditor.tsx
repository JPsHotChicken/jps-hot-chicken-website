"use client";

import { useMemo, useState } from "react";
import { Check, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FIELD_CLASS, LABEL_CLASS } from "./field";
import {
  DEFAULT_CATEGORIES,
  DIRECTION_LABELS,
  FREQUENCY_LABELS,
  METRIC_DIRECTIONS,
  METRIC_FREQUENCIES,
  METRIC_SCOPES,
  METRIC_TYPES,
  METRIC_TYPE_LABELS,
  PERFORMANCE_ROLES,
  RATING_MAX,
  ROLE_LABELS,
  SCOPE_LABELS,
  formatBands,
  formatDuration,
  formatTarget,
  parseDuration,
  type MetricDraft,
  type MetricDirection,
  type MetricFrequency,
  type MetricScope,
  type MetricType,
  type PerformanceRole,
  type Station,
} from "@/lib/performance";

type Props = {
  draft: MetricDraft;
  stations: Station[];
  /** Every category already in use, so the datalist offers them back. */
  categories: string[];
  saving: boolean;
  onSave: (draft: MetricDraft) => void;
  onCancel: () => void;
};

/** Metrics that are simply true or false have no target and no direction. */
const isBoolean = (type: MetricType) => type === "pass_fail";

/**
 * Read one of the numeric boxes.
 *
 * Duration is the exception worth having: a window time is written `3:00` on
 * every report it comes off, and making somebody convert that to 180 in their
 * head is how the wrong number gets typed.
 */
function readNumber(text: string, type: MetricType): number | null {
  const cleaned = text.trim();
  if (!cleaned) return null;
  if (type === "duration") return parseDuration(cleaned);
  const value = Number(cleaned.replace(/[$,%\s]/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** Write one back out, in whatever form it was typed. */
function showNumber(value: number | null, type: MetricType): string {
  if (value === null) return "";
  return type === "duration" ? formatDuration(value) : String(value);
}

/**
 * The form behind one metric.
 *
 * It is long because a metric genuinely has that many parts, so the thing that
 * keeps it usable is the preview at the bottom: it shows the exact line that
 * will be printed on the sheet, which turns "what does amber mean here" from a
 * question about this form into something the owner can just read.
 */
export function MetricEditor({ draft, stations, categories, saving, onSave, onCancel }: Props) {
  const [form, setForm] = useState<MetricDraft>(draft);
  const [error, setError] = useState<string | null>(null);

  const patch = (changes: Partial<MetricDraft>) => setForm((current) => ({ ...current, ...changes }));

  /**
   * A metric shaped like this one, for the preview. `formatTarget` and
   * `formatBands` want a whole `Metric`, and the two extra fields are the ones
   * that have no bearing on how a row reads.
   */
  const preview = useMemo(() => ({ ...form, id: "preview", sortOrder: 0 }), [form]);

  const boolean = isBoolean(form.type);
  const ranged = form.direction === "range" && !boolean;
  const showsUnit = ["number", "count", "duration"].includes(form.type);

  const save = () => {
    if (!form.name.trim()) {
      setError("Give the metric a name.");
      return;
    }
    if (form.scope === "station" && form.stationIds.length === 0) {
      setError("A station metric needs at least one station.");
      return;
    }
    if (form.scope !== "station" && form.roles.length === 0) {
      setError("Pick at least one role this is measured for.");
      return;
    }
    setError(null);
    onSave({ ...form, name: form.name.trim() });
  };

  const toggleRole = (role: PerformanceRole) =>
    patch({
      roles: form.roles.includes(role)
        ? form.roles.filter((value) => value !== role)
        : [...form.roles, role],
    });

  const toggleStation = (id: string) =>
    patch({
      stationIds: form.stationIds.includes(id)
        ? form.stationIds.filter((value) => value !== id)
        : [...form.stationIds, id],
    });

  return (
    <div className="space-y-3 rounded-xl border border-brand/40 bg-background p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="metric-name" className={LABEL_CLASS}>
            Name
          </label>
          <input
            id="metric-name"
            value={form.name}
            onChange={(event) => patch({ name: event.target.value })}
            maxLength={120}
            placeholder="Order accuracy"
            className={`mt-1 ${FIELD_CLASS}`}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="metric-description" className={LABEL_CLASS}>
            Description <span className="font-normal">(optional)</span>
          </label>
          <input
            id="metric-description"
            value={form.description}
            onChange={(event) => patch({ description: event.target.value })}
            maxLength={500}
            placeholder="Tickets with no remake, off the POS report"
            className={`mt-1 ${FIELD_CLASS}`}
          />
        </div>

        <div>
          <label htmlFor="metric-type" className={LABEL_CLASS}>
            Type
          </label>
          <select
            id="metric-type"
            value={form.type}
            onChange={(event) => {
              const type = event.target.value as MetricType;
              // Pass/fail has no target to keep, and a rating is always 1–5, so
              // switching to either clears numbers that would now be nonsense.
              patch({
                type,
                ...(isBoolean(type) && { target: null, targetMin: null, targetMax: null }),
                ...(type === "rating" && { direction: "higher" as MetricDirection }),
              });
            }}
            className={`mt-1 ${FIELD_CLASS}`}
          >
            {METRIC_TYPES.map((type) => (
              <option key={type} value={type}>
                {METRIC_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="metric-scope" className={LABEL_CLASS}>
            Scope
          </label>
          <select
            id="metric-scope"
            value={form.scope}
            onChange={(event) => patch({ scope: event.target.value as MetricScope })}
            className={`mt-1 ${FIELD_CLASS}`}
          >
            {METRIC_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {SCOPE_LABELS[scope]}
              </option>
            ))}
          </select>
        </div>

        {!boolean && (
          <div>
            <label htmlFor="metric-direction" className={LABEL_CLASS}>
              Goal
            </label>
            <select
              id="metric-direction"
              value={form.direction}
              onChange={(event) => patch({ direction: event.target.value as MetricDirection })}
              className={`mt-1 ${FIELD_CLASS}`}
            >
              {METRIC_DIRECTIONS.map((direction) => (
                <option key={direction} value={direction}>
                  {DIRECTION_LABELS[direction]}
                </option>
              ))}
            </select>
          </div>
        )}

        {showsUnit && (
          <div>
            <label htmlFor="metric-unit" className={LABEL_CLASS}>
              Unit
            </label>
            <input
              id="metric-unit"
              value={form.unit}
              onChange={(event) => patch({ unit: event.target.value })}
              maxLength={24}
              placeholder={form.type === "duration" ? "sec" : "tickets"}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </div>
        )}

        {!boolean && !ranged && (
          <div>
            <label htmlFor="metric-target" className={LABEL_CLASS}>
              Target
              {form.type === "rating" && ` (1–${RATING_MAX})`}
              {form.type === "duration" && " (m:ss)"}
            </label>
            <input
              id="metric-target"
              value={showNumber(form.target, form.type)}
              onChange={(event) => patch({ target: readNumber(event.target.value, form.type) })}
              inputMode={form.type === "duration" ? "text" : "decimal"}
              placeholder={form.type === "duration" ? "3:00" : "98"}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </div>
        )}

        {ranged && (
          <>
            <div>
              <label htmlFor="metric-min" className={LABEL_CLASS}>
                Range from
              </label>
              <input
                id="metric-min"
                value={showNumber(form.targetMin, form.type)}
                onChange={(event) =>
                  patch({ targetMin: readNumber(event.target.value, form.type) })
                }
                className={`mt-1 ${FIELD_CLASS}`}
              />
            </div>
            <div>
              <label htmlFor="metric-max" className={LABEL_CLASS}>
                Range to
              </label>
              <input
                id="metric-max"
                value={showNumber(form.targetMax, form.type)}
                onChange={(event) =>
                  patch({ targetMax: readNumber(event.target.value, form.type) })
                }
                className={`mt-1 ${FIELD_CLASS}`}
              />
            </div>
          </>
        )}

        <div>
          <label htmlFor="metric-frequency" className={LABEL_CLASS}>
            Measured
          </label>
          <select
            id="metric-frequency"
            value={form.frequency}
            onChange={(event) => patch({ frequency: event.target.value as MetricFrequency })}
            className={`mt-1 ${FIELD_CLASS}`}
          >
            {METRIC_FREQUENCIES.map((frequency) => (
              <option key={frequency} value={frequency}>
                {FREQUENCY_LABELS[frequency]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="metric-weight" className={LABEL_CLASS}>
            Weight
          </label>
          <input
            id="metric-weight"
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={form.weight}
            onChange={(event) => patch({ weight: Number(event.target.value) || 0 })}
            className={`mt-1 ${FIELD_CLASS}`}
          />
        </div>

        <div>
          <label htmlFor="metric-category" className={LABEL_CLASS}>
            Category
          </label>
          <input
            id="metric-category"
            list="metric-categories"
            value={form.category}
            onChange={(event) => patch({ category: event.target.value })}
            maxLength={60}
            className={`mt-1 ${FIELD_CLASS}`}
          />
          <datalist id="metric-categories">
            {[...new Set([...categories, ...DEFAULT_CATEGORIES])].map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </div>

        <div>
          <span className={LABEL_CLASS}>Kind</span>
          <div className="mt-1 flex gap-3 text-sm">
            {[
              { value: false, label: "Leading" },
              { value: true, label: "Lagging" },
            ].map((option) => (
              <label key={String(option.value)} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="metric-lagging"
                  checked={form.lagging === option.value}
                  onChange={() => patch({ lagging: option.value })}
                  className="size-4 accent-brand"
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/*
        The band boxes stay empty for most metrics — the derived cutoffs under
        them are what will print, and typing over them is for the metric where a
        tenth either side of target isn't the right shoulder.
      */}
      {!boolean && (
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">
            Band cutoffs — leave blank to work them out from the target
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {form.direction !== "range" && form.direction !== "exact" && (
              <div>
                <label htmlFor="metric-green" className={LABEL_CLASS}>
                  Green at
                </label>
                <input
                  id="metric-green"
                  value={showNumber(form.greenAt, form.type)}
                  onChange={(event) => patch({ greenAt: readNumber(event.target.value, form.type) })}
                  className={`mt-1 ${FIELD_CLASS}`}
                />
              </div>
            )}
            <div>
              <label htmlFor="metric-amber" className={LABEL_CLASS}>
                {form.direction === "range"
                  ? "Amber shoulder (± either side)"
                  : form.direction === "exact"
                    ? "Amber tolerance (±)"
                    : "Amber at"}
              </label>
              <input
                id="metric-amber"
                value={showNumber(form.amberAt, form.type)}
                onChange={(event) => patch({ amberAt: readNumber(event.target.value, form.type) })}
                className={`mt-1 ${FIELD_CLASS}`}
              />
            </div>
          </div>
        </fieldset>
      )}

      {form.scope === "station" ? (
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">
            Printed on these station sheets
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {stations.map((station) => (
              <label key={station.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.stationIds.includes(station.id)}
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
      ) : (
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-xs font-semibold text-muted-foreground">
            Printed on these people&apos;s sheets
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {PERFORMANCE_ROLES.map((role) => (
              <label key={role} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.roles.includes(role)}
                  onChange={() => toggleRole(role)}
                  className="size-4 accent-brand"
                />
                {ROLE_LABELS[role]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="rounded-lg bg-muted px-3 py-2.5">
        <p className="text-xs font-semibold text-muted-foreground">On the printed sheet</p>
        <p className="mt-1 font-semibold">{form.name || "Untitled metric"}</p>
        <p className="text-xs text-muted-foreground">
          {formatBands(preview) || "No target set — the row prints without bands"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Target <span className="font-semibold text-foreground">{formatTarget(preview)}</span> ·
          weight {form.weight} · {FREQUENCY_LABELS[form.frequency].toLowerCase()}
        </p>
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
          <TriangleAlert className="size-4" />
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X data-icon="inline-start" />
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          <Check data-icon="inline-start" />
          {saving ? "Saving…" : "Save metric"}
        </Button>
      </div>
    </div>
  );
}
