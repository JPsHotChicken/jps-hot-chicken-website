import type { CellValue, Sheet, Workbook } from "@/lib/spreadsheet";

/**
 * Pulling the day's figures out of a Toast sales summary.
 *
 * The export is a long sheet and only six numbers on it are wanted, so the
 * temptation is to read them off by cell address — B5, E31, D82 — and be done.
 * That is a trap. Toast adds and removes rows depending on what the restaurant
 * took that week: no gift cards means no gift card row, a week with no service
 * charges shrinks the sheet by three. Addresses that are right today are
 * quietly wrong the first week the business does something slightly different,
 * and the report would still print, just with the wrong money on it.
 *
 * So every figure is found by its own label instead — the section it sits under
 * and the column it sits in, both read off the sheet. A figure that cannot be
 * found that way comes back `null` and is named in `missing`, because a report
 * that admits it lost a number is worth far more than one that prints a zero.
 */

/** One line of a report: what it is, and how much. */
export type Figure = {
  key: FigureKey;
  label: string;
  amount: number;
};

export type FigureKey = "grossSales" | "tax" | "netSales" | "totalCash" | "doorDash";

export type SalesReport = {
  /** The period as the export writes it, e.g. `"8/10/26 - 8/21/26"`. */
  period: string | null;
  /** The same period spelled out, e.g. `"August 10 – 21, 2026"`. */
  periodLabel: string;
  /** `"JP's Hot Chicken - Trenton Road"`, off the top of the sheet. */
  location: string | null;
  /** When Toast produced the export. */
  generated: string | null;

  grossSales: number | null;
  tax: number | null;
  netSales: number | null;
  totalCash: number | null;
  doorDash: number | null;

  /** The dining options that were added up to make `doorDash`. */
  doorDashSources: string[];
  /** Human names of the figures that could not be found on the sheet. */
  missing: string[];
};

export class SalesReportError extends Error {}

/** What each figure is called, on screen and on the page. */
export const FIGURE_LABELS: Record<FigureKey, string> = {
  grossSales: "Gross Sales",
  tax: "Tax",
  netSales: "Net Sales",
  totalCash: "Total Cash (to bank)",
  doorDash: "DoorDash Sales",
};

/* ------------------------------------------------------------------ *
 * Reading cells
 * ------------------------------------------------------------------ */

const text = (value: CellValue): string => (value == null ? "" : String(value).trim());

const same = (value: CellValue, label: string): boolean =>
  text(value).toLowerCase() === label.toLowerCase();

/**
 * A cell as money.
 *
 * The export is inconsistent about this and there is no pattern to it: the same
 * figure is a bare number in one section (`60510.96`), a formatted string in
 * another (`"$60,014.84"`), and occasionally has the sign or the dollar on the
 * wrong end (`"5696.30 $"`, `" -$424.40"`). All of them mean a number, so all
 * of them are read as one.
 */
export function toAmount(value: CellValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const raw = value.trim();
  if (!raw) return null;

  // Brackets are the accountant's minus sign; Toast uses a real one, but the
  // file passes through Excel often enough to meet both.
  const negative = raw.includes("-") || /^\(.*\)$/.test(raw);
  const digits = raw.replace(/[^\d.]/g, "");
  if (!/\d/.test(digits)) return null;

  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

/** The row whose first column is exactly `title` — how a section announces itself. */
function findSection(sheet: Sheet, title: string): number | null {
  const found = sheet.rows.findIndex((row) => same(row[0], title));
  return found === -1 ? null : found;
}

/**
 * The rows under a section title.
 *
 * A section runs until the next one starts, and only a section title is ever
 * written in the first column — so that is the boundary.
 */
function sectionRows(sheet: Sheet, start: number): number[] {
  const rows: number[] = [];
  for (let index = start + 1; index < sheet.rows.length; index += 1) {
    if (text(sheet.rows[index][0])) break;
    rows.push(index);
  }
  return rows;
}

/** The column in `row` headed `header`. Column headings share the title's row. */
function findColumn(sheet: Sheet, row: number, header: string): number | null {
  const found = (sheet.rows[row] ?? []).findIndex((cell) => same(cell, header));
  return found === -1 ? null : found;
}

/** The last cell in a row that holds anything — where an unheaded figure sits. */
function lastAmount(sheet: Sheet, row: number, after: number): number | null {
  const cells = sheet.rows[row] ?? [];
  for (let index = cells.length - 1; index > after; index -= 1) {
    if (text(cells[index])) return toAmount(cells[index]);
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * The figures
 * ------------------------------------------------------------------ */

/**
 * A figure from the Sales Summary strip at the top — the one place where the
 * headings and their values are a single row apart.
 *
 * All three of the money figures on the owner's report come from this one strip,
 * and it is worth saying why, because the sheet offers tempting alternatives.
 *
 * Gross sales is the strip's **Total**, at the far right: net sales plus tax
 * plus gratuity plus tips, which is every dollar that came in. It is *not* the
 * "Gross Amt" total in the Sales Categories table further down — that figure is
 * menu prices before discounts and excludes tax, so it lands between the two
 * numbers here and belongs to neither. Net sales is the same strip's left-hand
 * figure, the takings with tax and tips stripped back out.
 *
 * The two therefore do not differ by tax alone, and should not be expected to:
 * tips sit inside the gross figure and outside the net one.
 */
function summaryFigure(sheet: Sheet, header: string): number | null {
  const section = findSection(sheet, "Sales Summary");
  if (section == null) return null;
  const column = findColumn(sheet, section, header);
  if (column == null) return null;
  return toAmount(sheet.rows[section + 1]?.[column] ?? null);
}

/**
 * The cash that goes to the bank, off the bottom of the Cash Summary.
 *
 * This is the figure after tipouts have come out, not the cash the tills took —
 * those are two different numbers and they sit five rows apart under names that
 * begin with the same two words. Hence the exact match: "Total Cash Payments"
 * is the money that came in, and banking it would be banking the servers' tips
 * along with it.
 */
function totalCash(sheet: Sheet): number | null {
  const section = findSection(sheet, "Cash Summary");
  if (section == null) return null;
  const row = sectionRows(sheet, section).find((index) => same(sheet.rows[index][1], "Total Cash"));
  return row == null ? null : lastAmount(sheet, row, 1);
}

/**
 * DoorDash, as one number.
 *
 * The export splits it into delivery and takeout, which is a distinction the
 * business does not care about — it is all DoorDash, and it is the total that
 * gets reported. Matching on the name rather than the two exact rows means a
 * third DoorDash line, if one ever appears, is added in rather than silently
 * dropped.
 */
function doorDash(sheet: Sheet): { amount: number | null; sources: string[] } {
  const section = findSection(sheet, "Dining Options");
  if (section == null) return { amount: null, sources: [] };
  const column = findColumn(sheet, section, "Net Sales");
  if (column == null) return { amount: null, sources: [] };

  let amount: number | null = null;
  const sources: string[] = [];
  for (const row of sectionRows(sheet, section)) {
    const label = text(sheet.rows[row][1]);
    if (!/doordash/i.test(label)) continue;
    const value = toAmount(sheet.rows[row][column] ?? null);
    if (value == null) continue;
    amount = (amount ?? 0) + value;
    sources.push(label);
  }
  return { amount, sources };
}

/* ------------------------------------------------------------------ *
 * The heading
 * ------------------------------------------------------------------ */

const DATE = String.raw`\d{1,2}/\d{1,2}/\d{2,4}`;
const PERIOD_PATTERN = new RegExp(`^(${DATE})(?:\\s*-\\s*(${DATE}))?$`);

/** The date line, which the export writes near the top without labelling it. */
function findPeriod(sheet: Sheet): string | null {
  for (const row of sheet.rows.slice(0, 4)) {
    for (const cell of row) {
      const value = text(cell);
      if (PERIOD_PATTERN.test(value)) return value;
    }
  }
  return null;
}

function parseDate(value: string): Date | null {
  const [month, day, year] = value.split("/").map(Number);
  if (!month || !day || year == null) return null;
  // Two digits mean this century. A point-of-sale export is never historical.
  const full = year < 100 ? 2000 + year : year;
  const date = new Date(full, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

const monthDay = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric" });

/**
 * The period, spelled out.
 *
 * Written long rather than as `8/10/26 - 8/21/26`, because this goes on a page
 * that gets read at arm's length and handed to someone else, and a slashed date
 * is read the other way round in half the world.
 */
export function formatPeriod(period: string | null): string {
  if (!period) return "";
  const match = PERIOD_PATTERN.exec(period.trim());
  if (!match) return period;

  const start = parseDate(match[1]);
  const end = match[2] ? parseDate(match[2]) : null;
  if (!start) return period;

  if (!end || start.getTime() === end.getTime()) {
    return `${monthDay(start)}, ${start.getFullYear()}`;
  }
  if (start.getFullYear() !== end.getFullYear()) {
    return `${monthDay(start)}, ${start.getFullYear()} – ${monthDay(end)}, ${end.getFullYear()}`;
  }
  if (start.getMonth() === end.getMonth()) {
    return `${monthDay(start)} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${monthDay(start)} – ${monthDay(end)}, ${end.getFullYear()}`;
}

/** Money, always to the cent — this is a financial page and it should read like one. */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/* ------------------------------------------------------------------ *
 * Putting it together
 * ------------------------------------------------------------------ */

/** The sheet the figures are on, whatever position it is in. */
function summarySheet(workbook: Workbook): Sheet | null {
  return (
    workbook.sheets.find((sheet) => findSection(sheet, "Sales Summary") != null) ??
    workbook.sheets.find((sheet) => sheet.name.trim().toLowerCase() === "summary") ??
    null
  );
}

/** Read a sales summary export into the figures the two reports are built from. */
export function readSalesReport(workbook: Workbook): SalesReport {
  const sheet = summarySheet(workbook);
  if (!sheet) {
    throw new SalesReportError(
      "That spreadsheet isn't a Toast sales summary — there's no Sales Summary section on it.",
    );
  }

  const period = findPeriod(sheet);
  const dash = doorDash(sheet);

  const report: SalesReport = {
    period,
    periodLabel: formatPeriod(period),
    // The location and the generated stamp share the two lines the period is
    // on, so they are picked out by what they look like rather than by column.
    location:
      sheet.rows
        .slice(0, 4)
        .flat()
        .map(text)
        .find((value) => value.length > 0 && value !== period && !/^Generated\b/i.test(value) && !/^Sales Summary Export$/i.test(value)) ?? null,
    generated:
      sheet.rows
        .slice(0, 4)
        .flat()
        .map(text)
        .find((value) => /^Generated\b/i.test(value))
        ?.replace(/^Generated\s*/i, "") ?? null,

    // Both ends of the Sales Summary strip: Total on the right is everything
    // that came in, Net Sales on the left is that figure with the tax and the
    // tips taken back out. See `summaryFigure` for why neither is read out of
    // the Sales Categories table further down the sheet.
    grossSales: summaryFigure(sheet, "Total"),
    tax: summaryFigure(sheet, "Tax"),
    netSales: summaryFigure(sheet, "Net Sales"),
    totalCash: totalCash(sheet),
    doorDash: dash.amount,

    doorDashSources: dash.sources,
    missing: [],
  };

  report.missing = (Object.keys(FIGURE_LABELS) as FigureKey[])
    .filter((key) => report[key] == null)
    .map((key) => FIGURE_LABELS[key]);

  // Nothing at all came off the sheet, so it was the wrong sheet — better to
  // say so than to hand back a page of blanks.
  if (report.missing.length === Object.keys(FIGURE_LABELS).length) {
    throw new SalesReportError(
      "None of the figures could be read off that spreadsheet. Make sure it's the Sales Summary export from Toast.",
    );
  }

  return report;
}

/** The figures on the owner's report, in the order they are printed. */
export function ownerFigures(report: SalesReport): Figure[] {
  return figuresFor(report, ["grossSales", "tax", "netSales", "totalCash", "doorDash"]);
}

/** The figures on the accountant's report. */
export function accountantFigures(report: SalesReport): Figure[] {
  return figuresFor(report, ["grossSales", "doorDash"]);
}

function figuresFor(report: SalesReport, keys: FigureKey[]): Figure[] {
  return keys
    .map((key) => ({ key, label: FIGURE_LABELS[key], amount: report[key] }))
    .filter((figure): figure is Figure => figure.amount != null);
}
