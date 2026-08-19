/**
 * Everything the performance sheet builder understands, with no database or
 * React in it.
 *
 * The thing this file exists to produce is a piece of paper. Metrics are
 * defined here, assigned to roles and stations here, and arranged into a
 * printable sheet here — but no results are ever recorded, because the results
 * get written on the sheet with a pen. That single decision is why there is no
 * period navigation, no entry grid and no trend arithmetic anywhere in this
 * feature: a number that only ever exists on a clipboard cannot be charted, and
 * pretending otherwise would mean typing every sheet in twice.
 *
 * What survives from scoring is the part a person can do by hand: each row
 * carries its target, its band cutoffs and its weight, so whoever is holding
 * the sheet can circle G, A or R as they go and total it at the bottom.
 */

/* -------------------------------------------------------------------- roles */

export const PERFORMANCE_ROLES = ["crew", "shift_lead", "manager"] as const;
export type PerformanceRole = (typeof PERFORMANCE_ROLES)[number];

export const ROLE_LABELS: Record<PerformanceRole, string> = {
  crew: "Crew",
  shift_lead: "Shift lead",
  manager: "Manager",
};

/** The roles a leadership-scoped metric is meant for. */
export const LEADERSHIP_ROLES: PerformanceRole[] = ["shift_lead", "manager"];

/* ------------------------------------------------------------------ metrics */

export const METRIC_TYPES = [
  "number",
  "percentage",
  "currency",
  "count",
  "duration",
  "pass_fail",
  "rating",
] as const;
export type MetricType = (typeof METRIC_TYPES)[number];

export const METRIC_TYPE_LABELS: Record<MetricType, string> = {
  number: "Number",
  percentage: "Percentage",
  currency: "Currency",
  count: "Count",
  duration: "Duration",
  pass_fail: "Pass / fail",
  rating: "Rating 1–5",
};

export const METRIC_DIRECTIONS = ["higher", "lower", "range", "exact"] as const;
export type MetricDirection = (typeof METRIC_DIRECTIONS)[number];

export const DIRECTION_LABELS: Record<MetricDirection, string> = {
  higher: "Higher is better",
  lower: "Lower is better",
  range: "Within range",
  exact: "Exact",
};

export const METRIC_SCOPES = ["individual", "station", "leadership"] as const;
export type MetricScope = (typeof METRIC_SCOPES)[number];

export const SCOPE_LABELS: Record<MetricScope, string> = {
  individual: "Individual",
  station: "Station",
  leadership: "Leadership",
};

export const METRIC_FREQUENCIES = ["shift", "daily", "weekly", "monthly"] as const;
export type MetricFrequency = (typeof METRIC_FREQUENCIES)[number];

export const FREQUENCY_LABELS: Record<MetricFrequency, string> = {
  shift: "Per shift",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

/** How coarse each frequency is, for deciding how a row is divided up. */
const FREQUENCY_RANK: Record<MetricFrequency, number> = {
  shift: 0,
  daily: 1,
  weekly: 2,
  monthly: 3,
};

/** The top of the rating scale. Ratings always start at 1. */
export const RATING_MAX = 5;

/** The default category, used for anything the owner hasn't filed. */
export const GENERAL_CATEGORY = "General";

/** Starting categories — free text, so a new one can be typed in on the spot. */
export const DEFAULT_CATEGORIES = [
  "Speed",
  "Quality",
  "Service",
  "Cleanliness",
  "Cash & accuracy",
  "Safety",
  "Teamwork",
  GENERAL_CATEGORY,
] as const;

export type Metric = {
  id: string;
  name: string;
  description: string;
  type: MetricType;
  /** What the number is counted in — "sec", "tickets", "%". Free text. */
  unit: string;
  scope: MetricScope;
  direction: MetricDirection;
  /** The goal, read according to `direction`. Null for pass/fail. */
  target: number | null;
  /** The two ends of a within-range target. Null for every other direction. */
  targetMin: number | null;
  targetMax: number | null;
  /**
   * Band cutoffs. Null means "work it out from the target", which is what most
   * metrics want — see `bandsFor`. A number here overrides that.
   */
  greenAt: number | null;
  amberAt: number | null;
  /** How much this counts toward the overall score, relative to its siblings. */
  weight: number;
  frequency: MetricFrequency;
  /** Leading metrics predict, lagging metrics report. */
  lagging: boolean;
  category: string;
  sortOrder: number;
  /**
   * Archived metrics keep their history of having existed but stop being
   * printed. Deleting outright is also possible; this is for the ones the owner
   * wants back next season.
   */
  archived: boolean;
  /** Which roles this is printed for, and which stations. Both many-to-many. */
  roles: PerformanceRole[];
  stationIds: string[];
};

/** The fields a metric can be created or edited with. */
export type MetricDraft = Omit<Metric, "id" | "sortOrder">;

export type Station = {
  id: string;
  name: string;
  sortOrder: number;
};

export type PerformanceEmployee = {
  id: string;
  name: string;
  role: PerformanceRole;
  /** Null for anyone hired before the date was being recorded. */
  hireDate: string | null;
  active: boolean;
  /** Stations this person is signed off on — the cross-training index counts these. */
  stationIds: string[];
};

/** Everything the page loads in one go. */
export type PerformanceData = {
  metrics: Metric[];
  stations: Station[];
  employees: PerformanceEmployee[];
};

/** A brand-new metric, before the owner has typed anything into it. */
export function emptyMetric(): MetricDraft {
  return {
    name: "",
    description: "",
    type: "number",
    unit: "",
    scope: "individual",
    direction: "higher",
    target: null,
    targetMin: null,
    targetMax: null,
    greenAt: null,
    amberAt: null,
    weight: 1,
    frequency: "shift",
    lagging: false,
    category: GENERAL_CATEGORY,
    archived: false,
    roles: [],
    stationIds: [],
  };
}

export function compareMetrics(a: Metric, b: Metric): number {
  const category = a.category.localeCompare(b.category);
  if (category !== 0) return category;
  const order = a.sortOrder - b.sortOrder;
  return order !== 0 ? order : a.name.localeCompare(b.name);
}

export const compareStations = (a: Station, b: Station) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

export const compareEmployees = (a: PerformanceEmployee, b: PerformanceEmployee) =>
  a.name.localeCompare(b.name);

/* ------------------------------------------------------------------- bands */

export type Band = "green" | "amber" | "red";

export const BAND_LABELS: Record<Band, string> = { green: "Green", amber: "Amber", red: "Red" };

/**
 * What each band is worth when the sheet is totalled.
 *
 * Amber is 70 rather than 50 so that a shift of straight ambers reads as
 * "acceptable, tighten it up" rather than "half of a disaster" — the number has
 * to survive being shown to the person it is about.
 */
export const BAND_POINTS: Record<Band, number> = { green: 100, amber: 70, red: 0 };

/**
 * How far past the target amber reaches when nobody has said. A tenth is wide
 * enough to be a real warning zone and narrow enough that green still means
 * something.
 */
export const DEFAULT_AMBER_MARGIN = 0.1;

/**
 * The cutoffs that split one metric's scale into green, amber and red.
 *
 * Every shape carries the numbers a person needs to sort a value into a band
 * with their eyes, which is the only place this is ever used — on the printed
 * row, and in the preview that shows what the printed row will say.
 */
export type ThresholdBands =
  | { kind: "higher"; green: number; amber: number }
  | { kind: "lower"; green: number; amber: number }
  | { kind: "range"; min: number; max: number; slack: number }
  | { kind: "exact"; target: number; tolerance: number }
  | { kind: "pass" };

/**
 * The margin to use when the owner hasn't set one.
 *
 * A percentage of the target, except when the target is zero — "no complaints",
 * "no cash-drawer misses" — where there is no percentage to take and one whole
 * unit is the smallest slack that means anything.
 */
function defaultMargin(target: number): number {
  const margin = Math.abs(target) * DEFAULT_AMBER_MARGIN;
  return margin === 0 ? 1 : margin;
}

/** Work out a metric's bands, deriving whatever hasn't been set by hand. */
export function bandsFor(metric: Metric): ThresholdBands | null {
  if (metric.type === "pass_fail") return { kind: "pass" };

  if (metric.direction === "range") {
    const { targetMin: min, targetMax: max } = metric;
    if (min === null || max === null) return null;
    // The amber shoulder sits outside both ends. `amberAt` is read as the width
    // of that shoulder here rather than as a cutoff, because a range has two.
    const slack = metric.amberAt ?? defaultMargin(max - min || max);
    return { kind: "range", min: Math.min(min, max), max: Math.max(min, max), slack };
  }

  if (metric.target === null) return null;

  if (metric.direction === "exact") {
    return { kind: "exact", target: metric.target, tolerance: metric.amberAt ?? 0 };
  }

  const green = metric.greenAt ?? metric.target;
  const step = defaultMargin(green);
  const amber = metric.amberAt ?? (metric.direction === "higher" ? green - step : green + step);
  return { kind: metric.direction, green, amber };
}

/**
 * Sort one value into a band, or null when there is nothing to sort.
 *
 * Nothing on the printed sheet needs this — the bands are printed and the
 * circling is done by hand. It is here for the preview, which shows the owner
 * what a sample number would score before they commit to a set of cutoffs.
 */
export function classify(metric: Metric, value: number | boolean | null): Band | null {
  if (value === null) return null;

  const bands = bandsFor(metric);
  if (!bands) return null;

  if (bands.kind === "pass") return value ? "green" : "red";
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  switch (bands.kind) {
    case "higher":
      if (value >= bands.green) return "green";
      return value >= bands.amber ? "amber" : "red";
    case "lower":
      if (value <= bands.green) return "green";
      return value <= bands.amber ? "amber" : "red";
    case "range":
      if (value >= bands.min && value <= bands.max) return "green";
      return value >= bands.min - bands.slack && value <= bands.max + bands.slack
        ? "amber"
        : "red";
    case "exact":
      if (value === bands.target) return "green";
      return Math.abs(value - bands.target) <= bands.tolerance ? "amber" : "red";
  }
}

/**
 * The weighted overall score for a set of banded rows, out of 100.
 *
 * Rows nobody filled in are left out rather than counted as zero: a sheet with
 * three of ten boxes ticked should score what those three earned, not a third
 * of it. Null when there is nothing to score at all.
 */
export function weightedScore(rows: readonly { weight: number; band: Band | null }[]): number | null {
  let points = 0;
  let weight = 0;
  for (const row of rows) {
    if (row.band === null || row.weight <= 0) continue;
    points += BAND_POINTS[row.band] * row.weight;
    weight += row.weight;
  }
  if (weight === 0) return null;
  return Math.round(points / weight);
}

/* -------------------------------------------------------- cross-training */

export type CrossTraining = {
  certified: number;
  total: number;
  /** Share of stations this person is signed off on, 0–100. */
  percent: number;
  names: string[];
};

/**
 * How broadly one person is trained.
 *
 * Counted from the certifications every time rather than stored, so the index
 * can never drift from the list it is a count of. Certifications pointing at a
 * deleted station are ignored — the database cascade removes them, but a stale
 * copy held in the browser shouldn't inflate anyone's number in the meantime.
 */
export function crossTrainingIndex(
  employee: PerformanceEmployee,
  stations: readonly Station[],
): CrossTraining {
  const certified = stations.filter((station) => employee.stationIds.includes(station.id));
  const total = stations.length;
  return {
    certified: certified.length,
    total,
    percent: total === 0 ? 0 : Math.round((certified.length / total) * 100),
    names: certified.slice().sort(compareStations).map((station) => station.name),
  };
}

/** Everyone signed off on one station. */
export function certifiedAt(
  stationId: string,
  employees: readonly PerformanceEmployee[],
): PerformanceEmployee[] {
  return employees
    .filter((employee) => employee.active && employee.stationIds.includes(stationId))
    .slice()
    .sort(compareEmployees);
}

/* ------------------------------------------------------------- assignment */

const live = (metric: Metric) => !metric.archived;

/** The metrics printed on one person's sheet: their role's, at their scope. */
export function metricsForRole(metrics: readonly Metric[], role: PerformanceRole): Metric[] {
  return metrics
    .filter(live)
    .filter((metric) => metric.scope !== "station" && metric.roles.includes(role))
    .sort(compareMetrics);
}

export function metricsForStation(metrics: readonly Metric[], stationId: string): Metric[] {
  return metrics
    .filter(live)
    .filter((metric) => metric.scope === "station" && metric.stationIds.includes(stationId))
    .sort(compareMetrics);
}

/** The leadership sheet: everything scoped to leadership, whatever the role. */
export function leadershipMetrics(metrics: readonly Metric[]): Metric[] {
  return metrics
    .filter(live)
    .filter((metric) => metric.scope === "leadership")
    .sort(compareMetrics);
}

/**
 * Which metrics to add to `target` so it matches `source`.
 *
 * Returns only what is missing, so cloning is additive — a role that already
 * has its own metrics keeps them, and cloning the same set twice changes
 * nothing the second time. The caller does the writing; working out the
 * difference is the part worth testing.
 *
 * Archived metrics are left behind. They are not part of the set anybody can
 * see — the library hides them by default — so copying them would both
 * overstate what the button is about to do and quietly plant a metric on a role
 * that would appear out of nowhere the day it was restored.
 */
export function cloneRoleAssignment(
  metrics: readonly Metric[],
  source: PerformanceRole,
  target: PerformanceRole,
): string[] {
  if (source === target) return [];
  return metrics
    .filter(live)
    .filter((metric) => metric.roles.includes(source) && !metric.roles.includes(target))
    .map((metric) => metric.id);
}

export function cloneStationAssignment(
  metrics: readonly Metric[],
  sourceId: string,
  targetId: string,
): string[] {
  if (sourceId === targetId) return [];
  return metrics
    .filter(live)
    .filter(
      (metric) => metric.stationIds.includes(sourceId) && !metric.stationIds.includes(targetId),
    )
    .map((metric) => metric.id);
}

/* ------------------------------------------------------------- formatting */

/** Seconds as `m:ss`, or `h:mm:ss` once it runs past an hour. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/**
 * Read a typed-in duration.
 *
 * `3:00` and `180` both mean three minutes — the owner types whichever is in
 * front of them on the report, and both end up as seconds.
 */
export function parseDuration(text: string): number | null {
  const cleaned = text.trim();
  if (!cleaned) return null;

  if (!cleaned.includes(":")) {
    const seconds = Number(cleaned);
    return Number.isFinite(seconds) ? seconds : null;
  }

  const parts = cleaned.split(":");
  if (parts.length > 3 || parts.some((part) => part.trim() === "")) return null;

  let seconds = 0;
  for (const part of parts) {
    const value = Number(part);
    if (!Number.isFinite(value) || value < 0) return null;
    seconds = seconds * 60 + value;
  }
  return seconds;
}

/** Trim a number to something readable — no trailing zeroes on whole figures. */
function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** One value, written the way its metric is measured. */
export function formatValue(metric: Metric, value: number | null): string {
  if (value === null) return "—";

  switch (metric.type) {
    case "percentage":
      return `${trimNumber(value)}%`;
    case "currency":
      return `$${value.toFixed(2)}`;
    case "duration":
      return formatDuration(value);
    case "rating":
      return `${trimNumber(value)} / ${RATING_MAX}`;
    case "pass_fail":
      return value ? "Pass" : "Fail";
    default: {
      const unit = metric.unit.trim();
      return unit ? `${trimNumber(value)} ${unit}` : trimNumber(value);
    }
  }
}

/** The target as it reads on the sheet — "≥ 95%", "≤ 3:00", "12–18 tickets". */
export function formatTarget(metric: Metric): string {
  if (metric.type === "pass_fail") return "Pass";

  if (metric.direction === "range") {
    if (metric.targetMin === null || metric.targetMax === null) return "—";
    const low = formatValue({ ...metric, unit: "" }, Math.min(metric.targetMin, metric.targetMax));
    const high = formatValue(metric, Math.max(metric.targetMin, metric.targetMax));
    return `${low}–${high}`;
  }

  if (metric.target === null) return "—";

  const value = formatValue(metric, metric.target);
  switch (metric.direction) {
    case "higher":
      return `≥ ${value}`;
    case "lower":
      return `≤ ${value}`;
    case "exact":
      return `= ${value}`;
  }
}

/**
 * The band cutoffs, compressed into one line for the printed row.
 *
 * This is the part that makes the sheet usable without the app open: whoever
 * writes the number down can see, on the same line, whether it was a good one.
 */
export function formatBands(metric: Metric): string {
  const bands = bandsFor(metric);
  if (!bands) return "";

  const show = (value: number) => formatValue({ ...metric, unit: "" }, value);

  switch (bands.kind) {
    case "pass":
      return "G pass · R fail";
    case "higher":
      return `G ≥ ${show(bands.green)} · A ≥ ${show(bands.amber)} · R below`;
    case "lower":
      return `G ≤ ${show(bands.green)} · A ≤ ${show(bands.amber)} · R above`;
    case "range":
      return `G ${show(bands.min)}–${show(bands.max)} · A ±${show(bands.slack)} · R beyond`;
    case "exact":
      return bands.tolerance > 0
        ? `G = ${show(bands.target)} · A ±${show(bands.tolerance)} · R beyond`
        : `G = ${show(bands.target)} · R anything else`;
  }
}

/** "2 years", "8 months", "New" — how long somebody has been here. */
export function formatTenure(hireDate: string | null, today = new Date()): string {
  if (!hireDate) return "";
  const hired = new Date(`${hireDate}T00:00:00`);
  if (Number.isNaN(hired.getTime())) return "";

  const months =
    (today.getFullYear() - hired.getFullYear()) * 12 +
    (today.getMonth() - hired.getMonth()) -
    (today.getDate() < hired.getDate() ? 1 : 0);

  if (months < 1) return "New";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const yearPart = `${years} year${years === 1 ? "" : "s"}`;
  return rest === 0 ? yearPart : `${yearPart} ${rest}m`;
}

/* ----------------------------------------------------------------- sheets */

export type SheetKind = "individual" | "station" | "leadership";
export type SheetPeriod = MetricFrequency;

/**
 * The write-in columns a sheet gets, by the period it covers.
 *
 * A weekly sheet is seven dated columns because that is how a week is actually
 * walked — one column filled in at close, every night. A monthly sheet is five
 * weeks rather than thirty-one days for the plain reason that thirty-one boxes
 * do not fit across a page anybody can write in.
 */
export const PERIOD_COLUMNS: Record<SheetPeriod, string[]> = {
  shift: ["Value"],
  daily: ["Value"],
  weekly: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  monthly: ["Wk 1", "Wk 2", "Wk 3", "Wk 4", "Wk 5"],
};

export const PERIOD_LABELS: Record<SheetPeriod, string> = {
  shift: "One shift",
  daily: "One day",
  weekly: "One week",
  monthly: "One month",
};

/**
 * Whether a metric is written once on this sheet or once per column.
 *
 * A metric measured less often than the sheet's own period has nothing to put
 * in six of the seven boxes, so it gets one wide cell instead of a row of
 * blanks that look like somebody forgot.
 */
export function isMerged(frequency: MetricFrequency, period: SheetPeriod): boolean {
  return FREQUENCY_RANK[frequency] >= FREQUENCY_RANK[period];
}

export type SheetRow = {
  metric: Metric;
  /** How many write-in cells this row is divided into. */
  cells: number;
  merged: boolean;
};

export type SheetGroup = {
  category: string;
  rows: SheetRow[];
};

export type Sheet = {
  kind: SheetKind;
  /** Who or what the sheet is about — a name, or a station. */
  title: string;
  /** The line under it: role, tenure, cross-training, who's certified. */
  subtitle: string;
  period: SheetPeriod;
  columns: string[];
  groups: SheetGroup[];
  /** The weights on the sheet, summed — the denominator of the score box. */
  totalWeight: number;
  metricCount: number;
};

function toGroups(metrics: readonly Metric[], period: SheetPeriod): SheetGroup[] {
  const columns = PERIOD_COLUMNS[period].length;
  const groups = new Map<string, SheetRow[]>();

  for (const metric of metrics) {
    const category = metric.category.trim() || GENERAL_CATEGORY;
    const merged = isMerged(metric.frequency, period);
    const row: SheetRow = { metric, merged, cells: merged ? 1 : columns };
    const rows = groups.get(category);
    if (rows) rows.push(row);
    else groups.set(category, [row]);
  }

  return [...groups.entries()]
    .map(([category, rows]) => ({ category, rows }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

function assemble(
  kind: SheetKind,
  title: string,
  subtitle: string,
  metrics: readonly Metric[],
  period: SheetPeriod,
): Sheet {
  return {
    kind,
    title,
    subtitle,
    period,
    columns: PERIOD_COLUMNS[period],
    groups: toGroups(metrics, period),
    totalWeight: metrics.reduce((sum, metric) => sum + metric.weight, 0),
    metricCount: metrics.length,
  };
}

/**
 * One person's sheet.
 *
 * The subtitle is where the cross-training index earns its place: it is the one
 * number on the page that says something about the person rather than about the
 * shift, and printing it beside their name is what turns it from a statistic
 * into a conversation about which station they learn next.
 */
export function buildEmployeeSheet(
  employee: PerformanceEmployee,
  data: PerformanceData,
  period: SheetPeriod,
  today = new Date(),
): Sheet {
  const metrics = metricsForRole(data.metrics, employee.role);
  const training = crossTrainingIndex(employee, data.stations);
  const tenure = formatTenure(employee.hireDate, today);

  const subtitle = [
    ROLE_LABELS[employee.role],
    tenure,
    `Certified at ${training.certified} of ${training.total} stations`,
    training.names.length > 0 ? training.names.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return assemble("individual", employee.name, subtitle, metrics, period);
}

export function buildStationSheet(
  station: Station,
  data: PerformanceData,
  period: SheetPeriod,
): Sheet {
  const metrics = metricsForStation(data.metrics, station.id);
  const people = certifiedAt(station.id, data.employees);
  const subtitle =
    people.length === 0
      ? "Nobody is certified here yet"
      : `Certified: ${people.map((person) => person.name).join(", ")}`;

  return assemble("station", station.name, subtitle, metrics, period);
}

export function buildLeadershipSheet(data: PerformanceData, period: SheetPeriod): Sheet {
  const metrics = leadershipMetrics(data.metrics);
  const leads = data.employees
    .filter((employee) => employee.active && LEADERSHIP_ROLES.includes(employee.role))
    .sort(compareEmployees);

  const subtitle =
    leads.length === 0
      ? "No shift leads or managers on the roster yet"
      : leads.map((person) => `${person.name} (${ROLE_LABELS[person.role]})`).join(" · ");

  return assemble("leadership", "Leadership", subtitle, metrics, period);
}

/** A safe file name for a printed sheet. */
export function sheetFilename(sheets: readonly Sheet[], period: SheetPeriod): string {
  const stamp = new Date().toISOString().slice(0, 10);
  if (sheets.length === 1) {
    const slug = sheets[0].title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `jp-performance-${slug || "sheet"}-${period}-${stamp}.pdf`;
  }
  return `jp-performance-sheets-${period}-${stamp}.pdf`;
}
