import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readWorkbook, SpreadsheetError, type Sheet, type Workbook } from "@/lib/spreadsheet";
import {
  FIGURE_LABELS,
  accountantFigures,
  formatPeriod,
  ownerFigures,
  readSalesReport,
  SalesReportError,
  toAmount,
} from "@/lib/sales-report";

/**
 * The export in `fixtures` is a real one — a fortnight of trade, downloaded
 * from Toast, unedited. Reading it back is the only test that proves the
 * binary reader against the thing it was written for; everything after it uses
 * hand-built sheets to push the parts of the export that this one week happens
 * not to exercise.
 */
const FIXTURE = "src/tests/fixtures/order-summary.xls";

function load(path: string): ArrayBuffer {
  const file = readFileSync(path);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}

const fixture = () => readWorkbook(load(FIXTURE));

/** A workbook of one sheet, from rows written the way the export writes them. */
const sheet = (rows: (string | number | null)[][]): Workbook => ({
  sheets: [{ name: "Summary", rows } as Sheet],
});

/** The shape of a sales summary, with the parts a test cares about swapped in. */
function summary(
  overrides: {
    heading?: (string | number | null)[][];
    dining?: (string | number | null)[][];
    cash?: (string | number | null)[][];
  } = {},
): Workbook {
  return sheet([
    ["Sales Summary Export", null, "Generated 8/22/26 8:56 AM"],
    ...(overrides.heading ?? [["8/10/26 - 8/21/26", null, "JP's Hot Chicken - Trenton Road"]]),
    [],
    ["Sales Summary", "Net Sales", "Tax", "Gratuity", "Tips", "Total"],
    [null, "$60,014.84", "$5,696.30", "$0.00", "$424.40", "$66,135.54"],
    [],
    // Deliberately present, and deliberately never read: the "Gross Amt" total
    // is menu prices before discounts and excludes tax, so it is neither of the
    // figures the reports want. Leaving it in the fixture is what proves so.
    ["Sales Categories", "Category", "Order Count", "Item Count", "Gross Amt"],
    [null, "No Category", 2307, 4909, 60510.96],
    [null, "Total", null, null, 60510.96],
    [],
    ["Dining Options", "Dining Option", "Order Count", "Net Sales"],
    ...(overrides.dining ?? [
      [null, "DoorDash - Delivery", 209, 6572.28],
      [null, "DoorDash - Takeout", 39, 1351.06],
      [null, "To-Go", 1111, 25133.54],
    ]),
    [],
    ["Cash Summary"],
    ...(overrides.cash ?? [
      [null, "Total Cash Payments", null, "$5,057.31"],
      [null, "Cash Adjustments", null, "-$1,059.02"],
      [null, "Total Cash", null, "$3,573.89"],
    ]),
  ]);
}

describe("reading the export", () => {
  it("opens a real Toast .xls and finds its three sheets", async () => {
    const workbook = await fixture();
    expect(workbook.sheets.map((each) => each.name)).toEqual([
      "Summary",
      "Hourly Breakdown",
      "Weekday Breakdown",
    ]);
  });

  it("reads both the strings and the numbers on it", async () => {
    const [first] = (await fixture()).sheets;
    // Toast writes the same kind of figure both ways, so both have to work.
    expect(first.rows[4][1]).toBe("$60,014.84");
    expect(first.rows[29][4]).toBe(60510.96);
  });

  it("refuses a file that is not a spreadsheet at all", async () => {
    const notASpreadsheet = new TextEncoder().encode("Employee,Hours\nAnn,32\n");
    await expect(readWorkbook(notASpreadsheet.buffer as ArrayBuffer)).rejects.toBeInstanceOf(
      SpreadsheetError,
    );
  });
});

describe("the figures", () => {
  it("takes all five off a real export", async () => {
    const report = readSalesReport(await fixture());

    expect(report.grossSales).toBe(66135.54);
    expect(report.tax).toBe(5696.3);
    expect(report.netSales).toBe(60014.84);
    expect(report.totalCash).toBe(3573.89);
    expect(report.doorDash).toBeCloseTo(7923.34, 2);
    expect(report.missing).toEqual([]);
  });

  it("reads the period, the restaurant and when Toast made the file", async () => {
    const report = readSalesReport(await fixture());

    expect(report.period).toBe("8/10/26 - 8/21/26");
    expect(report.periodLabel).toBe("August 10 – 21, 2026");
    expect(report.location).toBe("JP's Hot Chicken - Trenton Road");
    expect(report.generated).toBe("8/22/26 8:56 AM");
  });

  /**
   * Gross is the right-hand end of the Sales Summary strip and net is the
   * left-hand end, so the gap between them is the tax *and* the tips — not the
   * tax alone, and not the discounts, which is what reading gross off the Sales
   * Categories table would have given.
   */
  it("ties out: gross is net plus the tax and the tips on top of it", async () => {
    const report = readSalesReport(await fixture());

    expect(report.grossSales! - report.netSales! - report.tax!).toBeCloseTo(424.4, 2);
    expect(report.grossSales).not.toBe(60510.96); // the Sales Categories total
  });

  /**
   * The trap this whole module is built around. "Total Cash Payments" is what
   * the tills took and "Total Cash" is what is left after the servers have been
   * paid out of it — five rows apart, under names that start the same way.
   * Banking the first would be banking somebody else's tips.
   */
  it("banks the cash left after tipouts, not the cash the tills took", async () => {
    const report = readSalesReport(summary());

    expect(report.totalCash).toBe(3573.89);
    expect(report.totalCash).not.toBe(5057.31);
  });

  it("adds DoorDash delivery and takeout into one figure", () => {
    const report = readSalesReport(summary());

    expect(report.doorDash).toBeCloseTo(7923.34, 2);
    expect(report.doorDashSources).toEqual(["DoorDash - Delivery", "DoorDash - Takeout"]);
  });

  it("picks up a third DoorDash line rather than dropping it", () => {
    const report = readSalesReport(
      summary({
        dining: [
          [null, "DoorDash - Delivery", 209, 6572.28],
          [null, "DoorDash - Takeout", 39, 1351.06],
          [null, "DoorDash - Pickup", 4, 100],
          [null, "To-Go", 1111, 25133.54],
        ],
      }),
    );

    expect(report.doorDash).toBeCloseTo(8023.34, 2);
    expect(report.doorDashSources).toHaveLength(3);
  });

  it("counts no DoorDash as none, and never as another dining option", () => {
    const report = readSalesReport(
      summary({ dining: [[null, "To-Go", 1111, 25133.54]] }),
    );

    expect(report.doorDash).toBeNull();
    expect(report.missing).toEqual([FIGURE_LABELS.doorDash]);
  });

  /**
   * Toast drops whole sections out of the export when a week had none of that
   * kind of trade, which moves every row below them. Reading by label rather
   * than by cell address is what survives it.
   */
  it("finds the figures wherever the sections have moved to", () => {
    const moved = sheet([
      ["8/10/26"],
      [],
      ["Cash Summary"],
      [null, "Total Cash", null, "$120.00"],
      [],
      ["Dining Options", "Dining Option", "Order Count", "Net Sales"],
      [null, "DoorDash - Delivery", 2, 40],
      [],
      ["Sales Categories", "Category", "Order Count", "Item Count", "Gross Amt"],
      [null, "Total", null, null, 900],
      [],
      ["Sales Summary", "Net Sales", "Tax", "Total"],
      [null, 880, 70, 950],
    ]);
    const report = readSalesReport(moved);

    expect(report.grossSales).toBe(950); // the strip's Total, not the 900 above it
    expect(report.netSales).toBe(880);
    expect(report.tax).toBe(70);
    expect(report.totalCash).toBe(120);
    expect(report.doorDash).toBe(40);
  });

  it("takes gross off the strip's Total, never off the Sales Categories table", () => {
    const report = readSalesReport(summary());

    expect(report.grossSales).toBe(66135.54);
    expect(report.grossSales).not.toBe(60510.96);
  });

  it("names what it could not find rather than printing a zero", () => {
    const report = readSalesReport(summary({ cash: [[null, "Cash Adjustments", null, "-$5.00"]] }));

    expect(report.totalCash).toBeNull();
    expect(report.missing).toEqual([FIGURE_LABELS.totalCash]);
    expect(ownerFigures(report).map((figure) => figure.key)).not.toContain("totalCash");
  });

  it("refuses a spreadsheet that is not a sales summary", () => {
    expect(() => readSalesReport(sheet([["Employee", "Hours"], ["Ann", 32]]))).toThrow(
      SalesReportError,
    );
  });
});

describe("what goes on each report", () => {
  it("gives the owner the five figures, in the order they are read out", async () => {
    const report = readSalesReport(await fixture());

    expect(ownerFigures(report).map((figure) => figure.label)).toEqual([
      "Gross Sales",
      "Tax",
      "Net Sales",
      "Total Cash (to bank)",
      "DoorDash Sales",
    ]);
  });

  it("gives the accountant gross sales and DoorDash, and nothing else", async () => {
    const report = readSalesReport(await fixture());

    expect(accountantFigures(report).map((figure) => figure.label)).toEqual([
      "Gross Sales",
      "DoorDash Sales",
    ]);
  });
});

describe("reading a figure", () => {
  it("takes money however the export happens to have written it", () => {
    expect(toAmount(60510.96)).toBe(60510.96);
    expect(toAmount("$60,014.84")).toBe(60014.84);
    expect(toAmount("5696.30 $")).toBe(5696.3); // sign and symbol swapped round
    expect(toAmount(" -$424.40")).toBe(-424.4);
    expect(toAmount("-$1,059.02")).toBe(-1059.02);
    expect(toAmount("(1,059.02)")).toBe(-1059.02); // an accountant's minus sign
    expect(toAmount("$0.00")).toBe(0);
  });

  it("reads nothing out of a cell that holds no figure", () => {
    expect(toAmount(null)).toBeNull();
    expect(toAmount("")).toBeNull();
    expect(toAmount("   ")).toBeNull();
    expect(toAmount("No Category")).toBeNull();
  });
});

describe("spelling out the period", () => {
  it("keeps a range inside one month short", () => {
    expect(formatPeriod("8/10/26 - 8/21/26")).toBe("August 10 – 21, 2026");
  });

  it("names both months when the period crosses one", () => {
    expect(formatPeriod("8/28/26 - 9/3/26")).toBe("August 28 – September 3, 2026");
  });

  it("names both years when the period crosses one", () => {
    expect(formatPeriod("12/28/26 - 1/3/27")).toBe("December 28, 2026 – January 3, 2027");
  });

  it("writes a single day as a single day", () => {
    expect(formatPeriod("8/22/26")).toBe("August 22, 2026");
    expect(formatPeriod("8/22/26 - 8/22/26")).toBe("August 22, 2026");
  });

  it("hands back anything it cannot read, rather than inventing a date", () => {
    expect(formatPeriod("Last fortnight")).toBe("Last fortnight");
    expect(formatPeriod(null)).toBe("");
  });
});
