"use client";

import { useCallback, useMemo, useState } from "react";
import { ClipboardCheck, LogOut, MapPin, Menu, Printer, Ruler, TriangleAlert, UserRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { logout } from "@/app/admin/actions";
import { AdminDrawer } from "./AdminDrawer";
import { MetricLibrary } from "./MetricLibrary";
import { RosterPanel } from "./RosterPanel";
import { SheetComposer } from "./SheetComposer";
import { StationPanel } from "./StationPanel";
import {
  type Metric,
  type MetricDraft,
  type PerformanceData,
  type PerformanceRole,
  type Sheet,
  type SheetPeriod,
} from "@/lib/performance";
import {
  addMetricAction,
  addStationAction,
  cloneToRoleAction,
  cloneToStationAction,
  deleteMetricAction,
  deleteStationAction,
  reloadPerformanceAction,
  renameStationAction,
  reorderStationsAction,
  setCertificationsAction,
  setMetricArchivedAction,
  updateEmployeeAction,
  updateMetricAction,
} from "@/app/admin/performance/actions";

const TABS = [
  { id: "print", label: "Print sheets", icon: <Printer className="size-4" /> },
  { id: "metrics", label: "Metrics", icon: <Ruler className="size-4" /> },
  { id: "stations", label: "Stations", icon: <MapPin className="size-4" /> },
  { id: "roster", label: "Roster", icon: <UserRound className="size-4" /> },
] as const;

type Tab = (typeof TABS)[number]["id"];

/**
 * The performance sheet builder.
 *
 * The order of the tabs is the order of the work: printing is what happens
 * every week and comes first, and the three that define what gets printed sit
 * behind it because they are touched once and then left alone for a season.
 *
 * Edits are applied here first and sent afterwards, which keeps a checkbox from
 * feeling like a page load. When a write fails the page re-reads everything
 * rather than trying to undo the one change — the database is the thing that
 * was right, and guessing at a rollback is how a screen ends up showing a state
 * that never existed anywhere.
 */
export function PerformanceSheets({ initial }: { initial: PerformanceData }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>("print");
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Run a write, and fall back to the database's version if it fails. */
  const commit = useCallback(
    async (optimistic: (current: PerformanceData) => PerformanceData, write: () => Promise<void>) => {
      setData(optimistic);
      setError(null);
      try {
        await write();
      } catch (cause) {
        console.error("[performance] write failed:", cause);
        setError(
          cause instanceof Error ? cause.message : "That didn't save. Nothing has been changed.",
        );
        try {
          setData(await reloadPerformanceAction());
        } catch {
          // Offline as well as failed — leave what's on screen and let the
          // banner explain, rather than blanking the page.
        }
      }
    },
    [],
  );

  /* ------------------------------------------------------------- metrics */

  const saveMetric = useCallback(
    async (id: string | null, draft: MetricDraft) => {
      if (id) {
        // The saved metric keeps its place in the list; only its fields change.
        await commit(
          (current) => ({
            ...current,
            metrics: current.metrics.map((metric) =>
              metric.id === id ? { ...metric, ...draft } : metric,
            ),
          }),
          async () => {
            const saved = await updateMetricAction(id, draft);
            setData((current) => ({
              ...current,
              metrics: current.metrics.map((metric) => (metric.id === id ? saved : metric)),
            }));
          },
        );
        return;
      }

      // A new metric has no id until the database gives it one, so it goes on
      // the list only once it comes back rather than under a made-up id.
      setError(null);
      try {
        const saved: Metric = await addMetricAction(draft);
        setData((current) => ({ ...current, metrics: [...current.metrics, saved] }));
      } catch (cause) {
        console.error("[performance] could not add a metric:", cause);
        setError(cause instanceof Error ? cause.message : "That metric couldn't be saved.");
      }
    },
    [commit],
  );

  const archiveMetric = useCallback(
    (id: string, archived: boolean) =>
      commit(
        (current) => ({
          ...current,
          metrics: current.metrics.map((metric) =>
            metric.id === id ? { ...metric, archived } : metric,
          ),
        }),
        () => setMetricArchivedAction(id, archived),
      ),
    [commit],
  );

  const deleteMetric = useCallback(
    (id: string) =>
      commit(
        (current) => ({
          ...current,
          metrics: current.metrics.filter((metric) => metric.id !== id),
        }),
        () => deleteMetricAction(id),
      ),
    [commit],
  );

  const cloneToRole = useCallback(
    (metricIds: string[], role: PerformanceRole) =>
      commit(
        (current) => ({
          ...current,
          metrics: current.metrics.map((metric) =>
            metricIds.includes(metric.id) && !metric.roles.includes(role)
              ? { ...metric, roles: [...metric.roles, role] }
              : metric,
          ),
        }),
        () => cloneToRoleAction(metricIds, role),
      ),
    [commit],
  );

  const cloneToStation = useCallback(
    (metricIds: string[], stationId: string) =>
      commit(
        (current) => ({
          ...current,
          metrics: current.metrics.map((metric) =>
            metricIds.includes(metric.id) && !metric.stationIds.includes(stationId)
              ? { ...metric, stationIds: [...metric.stationIds, stationId] }
              : metric,
          ),
        }),
        () => cloneToStationAction(metricIds, stationId),
      ),
    [commit],
  );

  /* ------------------------------------------------------------ stations */

  const addStation = useCallback(async (name: string) => {
    setError(null);
    try {
      const station = await addStationAction(name);
      setData((current) => ({ ...current, stations: [...current.stations, station] }));
    } catch (cause) {
      console.error("[performance] could not add a station:", cause);
      setError(cause instanceof Error ? cause.message : "That station couldn't be added.");
    }
  }, []);

  const renameStation = useCallback(
    (id: string, name: string) =>
      commit(
        (current) => ({
          ...current,
          stations: current.stations.map((station) =>
            station.id === id ? { ...station, name } : station,
          ),
        }),
        () => renameStationAction(id, name),
      ),
    [commit],
  );

  /**
   * Deleting a station has to clear it out of everything pointing at it, the
   * same way the database's cascade does — otherwise the cross-training index
   * on screen keeps counting a station that is gone.
   */
  const deleteStation = useCallback(
    (id: string) =>
      commit(
        (current) => ({
          stations: current.stations.filter((station) => station.id !== id),
          metrics: current.metrics.map((metric) => ({
            ...metric,
            stationIds: metric.stationIds.filter((stationId) => stationId !== id),
          })),
          employees: current.employees.map((employee) => ({
            ...employee,
            stationIds: employee.stationIds.filter((stationId) => stationId !== id),
          })),
        }),
        () => deleteStationAction(id),
      ),
    [commit],
  );

  const reorderStations = useCallback(
    (ids: string[]) =>
      commit(
        (current) => ({
          ...current,
          stations: ids
            .map((id, index) => {
              const station = current.stations.find((value) => value.id === id);
              return station ? { ...station, sortOrder: index } : null;
            })
            .filter((station): station is NonNullable<typeof station> => station !== null),
        }),
        () => reorderStationsAction(ids),
      ),
    [commit],
  );

  /* -------------------------------------------------------------- roster */

  const updateEmployee = useCallback(
    (
      id: string,
      details: { role: PerformanceRole; hireDate: string | null; active: boolean },
    ) =>
      commit(
        (current) => ({
          ...current,
          employees: current.employees.map((employee) =>
            employee.id === id ? { ...employee, ...details } : employee,
          ),
        }),
        () => updateEmployeeAction(id, details),
      ),
    [commit],
  );

  const setCertifications = useCallback(
    (id: string, stationIds: string[]) =>
      commit(
        (current) => ({
          ...current,
          employees: current.employees.map((employee) =>
            employee.id === id ? { ...employee, stationIds } : employee,
          ),
        }),
        () => setCertificationsAction(id, stationIds),
      ),
    [commit],
  );

  /* --------------------------------------------------------------- print */

  /**
   * jsPDF is a big dependency and this is the only thing on the page that needs
   * it, so it is fetched on the click rather than with the page.
   */
  const print = useCallback(async (sheets: Sheet[], period: SheetPeriod) => {
    setError(null);
    try {
      const { exportPerformancePdf } = await import("@/lib/performance-pdf");
      await exportPerformancePdf(sheets, period);
    } catch (cause) {
      console.error("[performance] could not build the sheets:", cause);
      setError("The sheets couldn't be built. Try again, or print fewer at once.");
    }
  }, []);

  const metricCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const metric of data.metrics) {
      if (metric.archived) continue;
      for (const id of metric.stationIds) counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [data.metrics]);

  const activeCount = data.employees.filter((employee) => employee.active).length;
  const liveMetrics = data.metrics.filter((metric) => !metric.archived).length;

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>

          <div className="mr-auto">
            <h1 className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight">
              <ClipboardCheck className="size-4 text-brand" />
              Performance sheets
            </h1>
            <p className="text-xs text-muted-foreground">
              {liveMetrics} metric{liveMetrics === 1 ? "" : "s"} · {activeCount} active ·{" "}
              {data.stations.length} station{data.stations.length === 1 ? "" : "s"}
            </p>
          </div>

          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </form>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 sm:px-6" aria-label="Sections">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-current={tab === entry.id ? "page" : undefined}
              onClick={() => setTab(entry.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                tab === entry.id ? "bg-brand/10 text-brand" : "hover:bg-muted"
              }`}
            >
              {entry.icon}
              {entry.label}
            </button>
          ))}
        </nav>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive sm:px-6"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="flex-1">{error}</p>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss"
              onClick={() => setError(null)}
            >
              <X />
            </Button>
          </div>
        )}
      </header>

      <AdminDrawer open={menuOpen} view="performance" onOpenChange={setMenuOpen} />

      <main className="flex-1 p-4 sm:px-6">
        {tab === "print" && <SheetComposer data={data} onPrint={print} />}

        {tab === "metrics" && (
          <MetricLibrary
            metrics={data.metrics}
            stations={data.stations}
            onSave={saveMetric}
            onArchive={archiveMetric}
            onDelete={deleteMetric}
            onCloneToRole={cloneToRole}
            onCloneToStation={cloneToStation}
          />
        )}

        {tab === "stations" && (
          <StationPanel
            stations={data.stations}
            employees={data.employees}
            metricCounts={metricCounts}
            onAdd={addStation}
            onRename={renameStation}
            onDelete={deleteStation}
            onReorder={reorderStations}
          />
        )}

        {tab === "roster" && (
          <RosterPanel
            employees={data.employees}
            stations={data.stations}
            onUpdate={updateEmployee}
            onCertifications={setCertifications}
          />
        )}
      </main>
    </div>
  );
}
