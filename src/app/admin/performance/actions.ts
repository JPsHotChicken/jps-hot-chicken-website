"use server";

import { assertISODate, assertNumber, assertText, assertUuid, requireAdmin } from "@/lib/admin-guard";
import * as repo from "@/lib/performance-repo";
import {
  METRIC_DIRECTIONS,
  METRIC_FREQUENCIES,
  METRIC_SCOPES,
  METRIC_TYPES,
  PERFORMANCE_ROLES,
  type Metric,
  type MetricDraft,
  type MetricDirection,
  type MetricFrequency,
  type MetricScope,
  type MetricType,
  type PerformanceData,
  type PerformanceRole,
  type Station,
} from "@/lib/performance";

/**
 * Server Actions behind the performance sheet builder.
 *
 * Every one re-checks the admin session and validates its own arguments — see
 * `admin-guard.ts` for why being reachable only from a protected page isn't the
 * same as being protected.
 */

/* --------------------------------------------------------------- validation */

/** One of a fixed set of strings, checked against the list the database has. */
function assertOneOf<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
): T {
  if (!allowed.includes(value as T)) throw new Error(`Unknown ${field} "${value}".`);
  return value as T;
}

/**
 * A figure typed into a target or cutoff box.
 *
 * Empty is a real answer here rather than a missing one — a metric with no
 * target prints without one — so null passes straight through. Negatives are
 * allowed: a target can be a variance either side of zero.
 */
function assertOptionalNumber(value: number | null, field: string): number | null {
  if (value === null) return null;
  return assertNumber(value, field, { min: -1_000_000, max: 1_000_000 });
}

function assertRoles(roles: string[]): PerformanceRole[] {
  if (roles.length > PERFORMANCE_ROLES.length) throw new Error("Too many roles.");
  return [...new Set(roles.map((role) => assertOneOf(role, PERFORMANCE_ROLES, "role")))];
}

/** The set list is small enough to hand over whole; this is the ceiling on it. */
const MAX_STATIONS = 200;
const MAX_METRICS = 500;

function assertStationIds(ids: string[]): string[] {
  if (ids.length > MAX_STATIONS) throw new Error("That is more stations than this page handles.");
  return [...new Set(ids.map((id) => assertUuid(id, "Station")))];
}

function assertDraft(draft: MetricDraft): MetricDraft {
  const type = assertOneOf<MetricType>(draft.type, METRIC_TYPES, "metric type");
  const scope = assertOneOf<MetricScope>(draft.scope, METRIC_SCOPES, "scope");
  const direction = assertOneOf<MetricDirection>(draft.direction, METRIC_DIRECTIONS, "direction");
  const frequency = assertOneOf<MetricFrequency>(draft.frequency, METRIC_FREQUENCIES, "frequency");

  return {
    name: assertText(draft.name, "Name", { max: 120, required: true }),
    description: assertText(draft.description, "Description", { max: 500 }),
    type,
    unit: assertText(draft.unit, "Unit", { max: 24 }),
    scope,
    direction,
    target: assertOptionalNumber(draft.target, "Target"),
    targetMin: assertOptionalNumber(draft.targetMin, "Range minimum"),
    targetMax: assertOptionalNumber(draft.targetMax, "Range maximum"),
    greenAt: assertOptionalNumber(draft.greenAt, "Green cutoff"),
    amberAt: assertOptionalNumber(draft.amberAt, "Amber cutoff"),
    // Zero is allowed: a metric can be tracked without counting toward the
    // score, which is how a new one gets watched before it is judged on.
    weight: assertNumber(draft.weight, "Weight", { min: 0, max: 100 }),
    frequency,
    lagging: Boolean(draft.lagging),
    category: assertText(draft.category, "Category", { max: 60 }),
    archived: Boolean(draft.archived),
    roles: assertRoles(draft.roles),
    stationIds: assertStationIds(draft.stationIds),
  };
}

/* -------------------------------------------------------------------- reads */

/**
 * Re-read everything. The page applies its edits optimistically, so this is how
 * it gets back in step with the database when a write fails.
 */
export async function reloadPerformanceAction(): Promise<PerformanceData> {
  await requireAdmin();
  return repo.loadPerformanceData();
}

/* ------------------------------------------------------------------ metrics */

export async function addMetricAction(draft: MetricDraft): Promise<Metric> {
  await requireAdmin();
  return repo.insertMetric(assertDraft(draft));
}

export async function updateMetricAction(id: string, draft: MetricDraft): Promise<Metric> {
  await requireAdmin();
  return repo.updateMetric(assertUuid(id, "Metric"), assertDraft(draft));
}

export async function deleteMetricAction(id: string): Promise<void> {
  await requireAdmin();
  await repo.deleteMetric(assertUuid(id, "Metric"));
}

export async function setMetricArchivedAction(id: string, archived: boolean): Promise<void> {
  await requireAdmin();
  await repo.setMetricArchived(assertUuid(id, "Metric"), Boolean(archived));
}

export async function reorderMetricsAction(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length > MAX_METRICS) throw new Error("That is more metrics than this page handles.");
  await repo.reorderMetrics(ids.map((id) => assertUuid(id, "Metric")));
}

/**
 * Copy one role's or station's metric set onto another.
 *
 * The caller works out which metrics are missing — see `cloneRoleAssignment` —
 * and this only has to add them, so cloning twice does nothing the second time.
 */
export async function cloneToRoleAction(metricIds: string[], role: string): Promise<void> {
  await requireAdmin();
  if (metricIds.length > MAX_METRICS) throw new Error("That is more metrics than this page handles.");
  await repo.assignMetricsToRole(
    metricIds.map((id) => assertUuid(id, "Metric")),
    assertOneOf(role, PERFORMANCE_ROLES, "role"),
  );
}

export async function cloneToStationAction(metricIds: string[], stationId: string): Promise<void> {
  await requireAdmin();
  if (metricIds.length > MAX_METRICS) throw new Error("That is more metrics than this page handles.");
  await repo.assignMetricsToStation(
    metricIds.map((id) => assertUuid(id, "Metric")),
    assertUuid(stationId, "Station"),
  );
}

/* ----------------------------------------------------------------- stations */

export async function addStationAction(name: string): Promise<Station> {
  await requireAdmin();
  return repo.insertStation(assertText(name, "Station name", { max: 60, required: true }));
}

export async function renameStationAction(id: string, name: string): Promise<void> {
  await requireAdmin();
  await repo.renameStation(
    assertUuid(id, "Station"),
    assertText(name, "Station name", { max: 60, required: true }),
  );
}

export async function deleteStationAction(id: string): Promise<void> {
  await requireAdmin();
  await repo.deleteStation(assertUuid(id, "Station"));
}

export async function reorderStationsAction(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length > MAX_STATIONS) throw new Error("That is more stations than this page handles.");
  await repo.reorderStations(ids.map((id) => assertUuid(id, "Station")));
}

/* ------------------------------------------------------------------- roster */

export async function updateEmployeeAction(
  id: string,
  details: { role: string; hireDate: string | null; active: boolean },
): Promise<void> {
  await requireAdmin();
  await repo.updateEmployeeDetails(assertUuid(id, "Employee"), {
    role: assertOneOf(details.role, PERFORMANCE_ROLES, "role"),
    hireDate:
      details.hireDate === null || details.hireDate === ""
        ? null
        : assertISODate(details.hireDate, "Hire date"),
    active: Boolean(details.active),
  });
}

export async function setCertificationsAction(
  employeeId: string,
  stationIds: string[],
): Promise<void> {
  await requireAdmin();
  await repo.setEmployeeStations(assertUuid(employeeId, "Employee"), assertStationIds(stationIds));
}
