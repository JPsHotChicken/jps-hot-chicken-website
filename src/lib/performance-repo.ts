import "server-only";

import { getDb } from "@/lib/supabase/server";
import {
  compareEmployees,
  compareMetrics,
  compareStations,
  type Metric,
  type MetricDraft,
  type PerformanceData,
  type PerformanceRole,
  type Station,
} from "@/lib/performance";

/**
 * Every read and write behind the performance sheet builder.
 *
 * There is no results table here, and that is the whole shape of this file: it
 * stores the definitions a sheet is printed from and nothing that gets written
 * on one. What it does own is the two join tables — which metrics belong to
 * which roles and stations, and which stations each person is signed off on —
 * and those are always rewritten wholesale rather than diffed, because the
 * editor hands over the complete set it wants and a partial update is how the
 * two halves drift apart.
 */

function fail(context: string, error: { message: string; code?: string } | null): never {
  throw new Error(`[performance] ${context}: ${error?.message ?? "unknown error"}`);
}

/** Postgres's duplicate-key error, which here only ever means a repeated name. */
const isDuplicate = (error: { code?: string } | null) => error?.code === "23505";

// One string literal each: `supabase-js` types a query off the literal it is
// given, so a column list stitched together with `+` comes back as `unknown`.
const METRIC_COLUMNS =
  "id, name, description, type, unit, scope, direction, target, target_min, target_max, green_at, amber_at, weight, frequency, lagging, category, sort_order, archived";
const STATION_COLUMNS = "id, name, sort_order";
const EMPLOYEE_COLUMNS = "id, name, performance_role, hire_date, active";

/* ------------------------------------------------------------------ shaping */

type MetricRow = {
  id: string;
  name: string;
  description: string;
  type: Metric["type"];
  unit: string;
  scope: Metric["scope"];
  direction: Metric["direction"];
  target: number | null;
  target_min: number | null;
  target_max: number | null;
  green_at: number | null;
  amber_at: number | null;
  weight: number;
  frequency: Metric["frequency"];
  lagging: boolean;
  category: string;
  sort_order: number;
  archived: boolean;
};

function toMetric(row: MetricRow, roles: PerformanceRole[], stationIds: string[]): Metric {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type,
    unit: row.unit,
    scope: row.scope,
    direction: row.direction,
    target: row.target,
    targetMin: row.target_min,
    targetMax: row.target_max,
    greenAt: row.green_at,
    amberAt: row.amber_at,
    weight: row.weight,
    frequency: row.frequency,
    lagging: row.lagging,
    category: row.category,
    sortOrder: row.sort_order,
    archived: row.archived,
    roles,
    stationIds,
  };
}

/** The metric's own columns, as the database spells them. */
function toRow(draft: MetricDraft) {
  return {
    name: draft.name,
    description: draft.description,
    type: draft.type,
    unit: draft.unit,
    scope: draft.scope,
    direction: draft.direction,
    target: draft.target,
    target_min: draft.targetMin,
    target_max: draft.targetMax,
    green_at: draft.greenAt,
    amber_at: draft.amberAt,
    weight: draft.weight,
    frequency: draft.frequency,
    lagging: draft.lagging,
    category: draft.category,
    archived: draft.archived,
  };
}

/** Collect `{ metric_id, x }` join rows into a lookup keyed by metric. */
function groupBy<T, K extends keyof T>(rows: readonly T[], key: K, value: keyof T) {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const id = String(row[key]);
    const existing = map.get(id);
    if (existing) existing.push(String(row[value]));
    else map.set(id, [String(row[value])]);
  }
  return map;
}

/* -------------------------------------------------------------------- reads */

/**
 * Everything the page needs, in one round trip.
 *
 * The five tables are read in parallel and stitched together here rather than
 * with nested selects — the join tables carry two columns each, so pulling them
 * whole costs almost nothing and keeps the shaping in plain TypeScript where it
 * can be read.
 */
export async function loadPerformanceData(): Promise<PerformanceData> {
  const db = getDb();

  const [metrics, stations, employees, metricRoles, metricStations, certifications] =
    await Promise.all([
      db.from("performance_metrics").select(METRIC_COLUMNS),
      db.from("performance_stations").select(STATION_COLUMNS),
      db.from("employees").select(EMPLOYEE_COLUMNS),
      db.from("performance_metric_roles").select("metric_id, role"),
      db.from("performance_metric_stations").select("metric_id, station_id"),
      db.from("employee_stations").select("employee_id, station_id"),
    ]);

  if (metrics.error) fail("loading metrics", metrics.error);
  if (stations.error) fail("loading stations", stations.error);
  if (employees.error) fail("loading the roster", employees.error);
  if (metricRoles.error) fail("loading role assignments", metricRoles.error);
  if (metricStations.error) fail("loading station assignments", metricStations.error);
  if (certifications.error) fail("loading certifications", certifications.error);

  const rolesByMetric = groupBy(metricRoles.data, "metric_id", "role");
  const stationsByMetric = groupBy(metricStations.data, "metric_id", "station_id");
  const stationsByEmployee = groupBy(certifications.data, "employee_id", "station_id");

  return {
    metrics: metrics.data
      .map((row) =>
        toMetric(
          row,
          (rolesByMetric.get(row.id) ?? []) as PerformanceRole[],
          stationsByMetric.get(row.id) ?? [],
        ),
      )
      .sort(compareMetrics),
    stations: stations.data
      .map((row) => ({ id: row.id, name: row.name, sortOrder: row.sort_order }))
      .sort(compareStations),
    employees: employees.data
      .map((row) => ({
        id: row.id,
        name: row.name,
        role: row.performance_role,
        hireDate: row.hire_date,
        active: row.active,
        stationIds: stationsByEmployee.get(row.id) ?? [],
      }))
      .sort(compareEmployees),
  };
}

/* ------------------------------------------------------------------ metrics */

/** Where a new row goes: on the end. */
async function nextSortOrder(table: "performance_metrics" | "performance_stations") {
  const { data, error } = await getDb()
    .from(table)
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) fail("finding the next position", error);
  return (data?.sort_order ?? -1) + 1;
}

/**
 * Replace a metric's role and station assignments with exactly this set.
 *
 * Delete-then-insert rather than a diff: the set is small, the editor always
 * knows the whole of it, and a diff is where an assignment survives a change
 * nobody meant it to survive.
 */
async function writeAssignments(
  metricId: string,
  roles: readonly PerformanceRole[],
  stationIds: readonly string[],
): Promise<void> {
  const db = getDb();

  const [clearedRoles, clearedStations] = await Promise.all([
    db.from("performance_metric_roles").delete().eq("metric_id", metricId),
    db.from("performance_metric_stations").delete().eq("metric_id", metricId),
  ]);
  if (clearedRoles.error) fail("clearing role assignments", clearedRoles.error);
  if (clearedStations.error) fail("clearing station assignments", clearedStations.error);

  if (roles.length > 0) {
    const { error } = await db
      .from("performance_metric_roles")
      .insert(roles.map((role) => ({ metric_id: metricId, role })));
    if (error) fail("assigning roles", error);
  }

  if (stationIds.length > 0) {
    const { error } = await db
      .from("performance_metric_stations")
      .insert(stationIds.map((station_id) => ({ metric_id: metricId, station_id })));
    if (error) fail("assigning stations", error);
  }
}

export async function insertMetric(draft: MetricDraft): Promise<Metric> {
  const sortOrder = await nextSortOrder("performance_metrics");

  const { data, error } = await getDb()
    .from("performance_metrics")
    .insert({ ...toRow(draft), sort_order: sortOrder })
    .select(METRIC_COLUMNS)
    .single();

  if (error) fail("adding a metric", error);
  await writeAssignments(data.id, draft.roles, draft.stationIds);
  return toMetric(data, [...draft.roles], [...draft.stationIds]);
}

export async function updateMetric(id: string, draft: MetricDraft): Promise<Metric> {
  const { data, error } = await getDb()
    .from("performance_metrics")
    .update(toRow(draft))
    .eq("id", id)
    .select(METRIC_COLUMNS)
    .single();

  if (error) fail("saving a metric", error);
  await writeAssignments(id, draft.roles, draft.stationIds);
  return toMetric(data, [...draft.roles], [...draft.stationIds]);
}

/** Deleting takes its assignments with it, via `on delete cascade`. */
export async function deleteMetric(id: string): Promise<void> {
  const { error } = await getDb().from("performance_metrics").delete().eq("id", id);
  if (error) fail("deleting a metric", error);
}

export async function setMetricArchived(id: string, archived: boolean): Promise<void> {
  const { error } = await getDb().from("performance_metrics").update({ archived }).eq("id", id);
  if (error) fail("archiving a metric", error);
}

export async function reorderMetrics(ids: readonly string[]): Promise<void> {
  const db = getDb();
  const results = await Promise.all(
    ids.map((id, index) =>
      db.from("performance_metrics").update({ sort_order: index }).eq("id", id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) fail("reordering metrics", failed.error);
}

/**
 * Add a role or a station to several metrics at once — how cloning lands.
 *
 * `upsert` with the join table's own primary key as the conflict target means
 * cloning onto a role that already has some of these metrics is a no-op for
 * those rows rather than a duplicate-key failure for the whole batch.
 */
export async function assignMetricsToRole(
  metricIds: readonly string[],
  role: PerformanceRole,
): Promise<void> {
  if (metricIds.length === 0) return;
  const { error } = await getDb()
    .from("performance_metric_roles")
    .upsert(
      metricIds.map((metric_id) => ({ metric_id, role })),
      { onConflict: "metric_id,role" },
    );
  if (error) fail("cloning a role's metrics", error);
}

export async function assignMetricsToStation(
  metricIds: readonly string[],
  stationId: string,
): Promise<void> {
  if (metricIds.length === 0) return;
  const { error } = await getDb()
    .from("performance_metric_stations")
    .upsert(
      metricIds.map((metric_id) => ({ metric_id, station_id: stationId })),
      { onConflict: "metric_id,station_id" },
    );
  if (error) fail("cloning a station's metrics", error);
}

/* ----------------------------------------------------------------- stations */

export async function insertStation(name: string): Promise<Station> {
  const sortOrder = await nextSortOrder("performance_stations");

  const { data, error } = await getDb()
    .from("performance_stations")
    .insert({ name, sort_order: sortOrder })
    .select(STATION_COLUMNS)
    .single();

  if (isDuplicate(error)) throw new Error(`There is already a station called "${name}".`);
  if (error) fail("adding a station", error);
  return { id: data.id, name: data.name, sortOrder: data.sort_order };
}

export async function renameStation(id: string, name: string): Promise<void> {
  const { error } = await getDb().from("performance_stations").update({ name }).eq("id", id);
  if (isDuplicate(error)) throw new Error(`There is already a station called "${name}".`);
  if (error) fail("renaming a station", error);
}

/**
 * Remove a station. Its metric assignments and everybody's certification for it
 * go with it via `on delete cascade`, which is what keeps the cross-training
 * index honest — a deleted station stops counting toward anyone's total the
 * moment it is gone.
 */
export async function deleteStation(id: string): Promise<void> {
  const { error } = await getDb().from("performance_stations").delete().eq("id", id);
  if (error) fail("deleting a station", error);
}

export async function reorderStations(ids: readonly string[]): Promise<void> {
  const db = getDb();
  const results = await Promise.all(
    ids.map((id, index) =>
      db.from("performance_stations").update({ sort_order: index }).eq("id", id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) fail("reordering stations", failed.error);
}

/* ----------------------------------------------------------------- roster */

export async function updateEmployeeDetails(
  id: string,
  details: { role: PerformanceRole; hireDate: string | null; active: boolean },
): Promise<void> {
  const { error } = await getDb()
    .from("employees")
    .update({
      performance_role: details.role,
      hire_date: details.hireDate,
      active: details.active,
    })
    .eq("id", id);
  if (error) fail("saving someone's details", error);
}

/** Replace one person's certifications with exactly this set. */
export async function setEmployeeStations(
  employeeId: string,
  stationIds: readonly string[],
): Promise<void> {
  const db = getDb();

  const cleared = await db.from("employee_stations").delete().eq("employee_id", employeeId);
  if (cleared.error) fail("clearing certifications", cleared.error);

  if (stationIds.length === 0) return;
  const { error } = await db
    .from("employee_stations")
    .insert(stationIds.map((station_id) => ({ employee_id: employeeId, station_id })));
  if (error) fail("saving certifications", error);
}
