"use client";

import { Fragment, useMemo, useState } from "react";
import { FileText, LoaderCircle, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LABEL_CLASS } from "./field";
import {
  BAND_POINTS,
  METRIC_FREQUENCIES,
  PERIOD_LABELS,
  ROLE_LABELS,
  buildEmployeeSheet,
  buildLeadershipSheet,
  buildStationSheet,
  formatBands,
  formatTarget,
  type PerformanceData,
  type Sheet,
  type SheetPeriod,
} from "@/lib/performance";

type Props = {
  data: PerformanceData;
  onPrint: (sheets: Sheet[], period: SheetPeriod) => Promise<void>;
};

/** How one sheet is identified in the selection. */
type SheetKey = string;

const employeeKey = (id: string) => `employee:${id}`;
const stationKey = (id: string) => `station:${id}`;
const LEADERSHIP_KEY = "leadership";

/**
 * What the printed row will look like, in HTML.
 *
 * Deliberately a close copy of the PDF rather than a nicer screen version: the
 * point of the preview is to answer "is this the sheet I want to carry", and a
 * preview that reads better than the paper it stands for cannot answer that.
 */
function SheetPreview({ sheet }: { sheet: Sheet }) {
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      <header className="border-b border-border px-4 py-3">
        <p className="text-[0.7rem] font-bold tracking-wide text-brand uppercase">
          JP&apos;s Hot Chicken — Performance sheet
        </p>
        <h3 className="font-heading text-lg font-bold">{sheet.title}</h3>
        <p className="text-xs text-muted-foreground">{sheet.subtitle}</p>
      </header>

      {sheet.metricCount === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No metrics are assigned here yet — this sheet would print empty.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-foreground text-background">
                <th className="px-3 py-1.5 text-[0.7rem] font-bold tracking-wide uppercase">
                  Metric
                </th>
                <th className="px-2 py-1.5 text-[0.7rem] font-bold tracking-wide uppercase">
                  Target
                </th>
                <th className="px-2 py-1.5 text-center text-[0.7rem] font-bold tracking-wide uppercase">
                  Wt
                </th>
                {sheet.columns.map((column) => (
                  <th
                    key={column}
                    className="px-2 py-1.5 text-center text-[0.7rem] font-bold tracking-wide uppercase"
                  >
                    {column}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-center text-[0.7rem] font-bold tracking-wide uppercase">
                  G A R
                </th>
              </tr>
            </thead>
            <tbody>
              {sheet.groups.map((group) => (
                <Fragment key={group.category}>
                  <tr className="bg-muted">
                    <td
                      colSpan={4 + sheet.columns.length}
                      className="px-3 py-1 text-[0.7rem] font-bold tracking-wide uppercase"
                    >
                      {group.category}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.metric.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <p className="text-sm font-semibold">{row.metric.name}</p>
                        <p className="text-[0.7rem] text-muted-foreground">
                          {formatBands(row.metric)}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-sm whitespace-nowrap">
                        {formatTarget(row.metric)}
                      </td>
                      <td className="px-2 py-2 text-center text-xs text-muted-foreground">
                        {row.metric.weight}
                      </td>
                      {row.merged ? (
                        <td
                          colSpan={sheet.columns.length}
                          className="border-l border-border bg-muted/30"
                        />
                      ) : (
                        sheet.columns.map((column) => (
                          <td
                            key={column}
                            className="border-l border-border bg-muted/30"
                            style={{ minWidth: 36 }}
                          />
                        ))
                      )}
                      <td className="border-l border-border px-2 py-2 text-center text-xs text-muted-foreground">
                        G A R
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        {sheet.metricCount} metric{sheet.metricCount === 1 ? "" : "s"} · total weight{" "}
        {sheet.totalWeight} · G = {BAND_POINTS.green}, A = {BAND_POINTS.amber}, R ={" "}
        {BAND_POINTS.red}
      </footer>
    </article>
  );
}

/** One tickable sheet in the pick list. */
function Pick({
  checked,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  label: string;
  hint: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-brand"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Choosing what to print, and printing it.
 *
 * This is the screen the owner is actually on most weeks — everything else on
 * the page is setup that gets touched once a season. So it opens with the whole
 * active roster already ticked and a week selected, which is the Sunday-night
 * job, and the rest is there for the times it isn't.
 */
export function SheetComposer({ data, onPrint }: Props) {
  const [period, setPeriod] = useState<SheetPeriod>("weekly");
  const [printing, setPrinting] = useState(false);

  const active = useMemo(
    () => data.employees.filter((employee) => employee.active),
    [data.employees],
  );

  // Everyone on shift, ready to print, is the common case — so it is the state
  // the page starts in rather than one the owner has to build every time.
  const [selected, setSelected] = useState<Set<SheetKey>>(
    () => new Set(active.map((employee) => employeeKey(employee.id))),
  );

  const toggle = (key: SheetKey, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const setAll = (keys: SheetKey[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });

  const sheets = useMemo(() => {
    const built: Sheet[] = [];
    for (const employee of active) {
      if (selected.has(employeeKey(employee.id))) {
        built.push(buildEmployeeSheet(employee, data, period));
      }
    }
    for (const station of data.stations) {
      if (selected.has(stationKey(station.id))) {
        built.push(buildStationSheet(station, data, period));
      }
    }
    if (selected.has(LEADERSHIP_KEY)) built.push(buildLeadershipSheet(data, period));
    return built;
  }, [active, data, period, selected]);

  const print = async () => {
    setPrinting(true);
    try {
      await onPrint(sheets, period);
    } finally {
      setPrinting(false);
    }
  };

  const everyone = active.map((employee) => employeeKey(employee.id));
  const allStations = data.stations.map((station) => stationKey(station.id));

  return (
    <div className="flex flex-col gap-4 lg:flex-row-reverse lg:items-start">
      <aside className="w-full shrink-0 space-y-4 lg:w-80 xl:w-96">
        <section className="rounded-xl border border-border bg-background shadow-sm">
          <header className="border-b border-border px-4 py-3">
            <h2 className="flex items-center gap-2 font-heading text-base font-bold">
              <Printer className="size-4 text-brand" />
              Print sheets
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pick a period and who it&apos;s for. One sheet per page.
            </p>
          </header>

          <div className="space-y-3 px-4 py-3">
            <div>
              <label htmlFor="sheet-period" className={LABEL_CLASS}>
                Each sheet covers
              </label>
              <select
                id="sheet-period"
                value={period}
                onChange={(event) => setPeriod(event.target.value as SheetPeriod)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {METRIC_FREQUENCIES.map((value) => (
                  <option key={value} value={value}>
                    {PERIOD_LABELS[value]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                {period === "weekly"
                  ? "Seven columns, one per day."
                  : period === "monthly"
                    ? "Five columns, one per week."
                    : "One column to write in."}
              </p>
            </div>

            <Button className="w-full" onClick={print} disabled={printing || sheets.length === 0}>
              {printing ? (
                <LoaderCircle data-icon="inline-start" className="animate-spin" />
              ) : (
                <FileText data-icon="inline-start" />
              )}
              {printing
                ? "Building…"
                : `Print ${sheets.length} sheet${sheets.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-background shadow-sm">
          <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <h3 className="mr-auto text-sm font-bold">People</h3>
            <Button variant="ghost" size="xs" onClick={() => setAll(everyone, true)}>
              All
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setAll(everyone, false)}>
              None
            </Button>
          </header>
          <div className="p-2">
            {active.map((employee) => (
              <Pick
                key={employee.id}
                checked={selected.has(employeeKey(employee.id))}
                label={employee.name}
                hint={ROLE_LABELS[employee.role]}
                onChange={(on) => toggle(employeeKey(employee.id), on)}
              />
            ))}
            {active.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                Nobody active on the roster.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-background shadow-sm">
          <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <h3 className="mr-auto text-sm font-bold">Stations & leadership</h3>
            <Button variant="ghost" size="xs" onClick={() => setAll(allStations, true)}>
              All
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setAll(allStations, false)}>
              None
            </Button>
          </header>
          <div className="p-2">
            {data.stations.map((station) => (
              <Pick
                key={station.id}
                checked={selected.has(stationKey(station.id))}
                label={station.name}
                hint="Station sheet"
                onChange={(on) => toggle(stationKey(station.id), on)}
              />
            ))}
            <Pick
              checked={selected.has(LEADERSHIP_KEY)}
              label="Leadership"
              hint="Shift leads and managers, one shared sheet"
              onChange={(on) => toggle(LEADERSHIP_KEY, on)}
            />
          </div>
        </section>
      </aside>

      <div className="min-w-0 flex-1 space-y-4">
        {sheets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
            Tick somebody on the right to see their sheet.
          </p>
        ) : (
          sheets.map((sheet) => <SheetPreview key={`${sheet.kind}:${sheet.title}`} sheet={sheet} />)
        )}
      </div>
    </div>
  );
}
