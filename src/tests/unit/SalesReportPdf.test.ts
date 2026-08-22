import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readWorkbook } from "@/lib/spreadsheet";
import { readSalesReport, type SalesReport } from "@/lib/sales-report";
import { buildSalesPdf, salesPdfFilename, type ReportKind } from "@/lib/sales-report-pdf";

/**
 * jsPDF writes its content streams uncompressed, so the text drawn onto the
 * page can be read straight back out of the output. That is enough to hold both
 * reports to what they claim: that the figures on them are the figures they
 * were given, that the accountant's page carries only the two it is meant to,
 * and — the whole point of these two pages — that the numbers are set large.
 */
const FIXTURE = "src/tests/fixtures/order-summary.xls";

async function realReport(): Promise<SalesReport> {
  const file = readFileSync(FIXTURE);
  const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  return readSalesReport(await readWorkbook(bytes as ArrayBuffer));
}

async function render(kind: ReportKind, report?: SalesReport) {
  const doc = await buildSalesPdf(kind, report ?? (await realReport()));
  return { doc, text: doc.output() };
}

/** Each run of text drawn on the page, with the size it was set in. */
function blocks(text: string): { size: number; content: string }[] {
  return [
    ...text.matchAll(/BT\s*\/F\d+ ([\d.]+) Tf[\s\S]*?\(((?:[^()\\]|\\.)*)\) Tj\s*ET/g),
  ].map((match) => ({ size: Number(match[1]), content: match[2] }));
}

/** Every type size set on the page, largest first. */
function fontSizes(text: string): number[] {
  return blocks(text)
    .map((block) => block.size)
    .sort((a, b) => b - a);
}

/** The size the run containing `needle` was set in. */
function sizeOf(text: string, needle: string): number {
  const block = blocks(text).find((each) => each.content.includes(needle));
  if (!block) throw new Error(`"${needle}" was never drawn on the page`);
  return block.size;
}

describe("the owner's report", () => {
  it("is one page", async () => {
    const { doc } = await render("owner");
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("puts the date at the top, above every figure", async () => {
    const { text } = await render("owner");
    // The en-dash is drawn in WinAnsi and does not survive being read back as
    // a byte string, so the two ends of the period are checked instead.
    expect(text).toContain("August 10");
    expect(text).toContain("21, 2026");
    expect(text.indexOf("August 10")).toBeLessThan(text.indexOf("66,135.54"));
  });

  it("carries the five figures, in the order they are read out", async () => {
    const { text } = await render("owner");

    const order = ["66,135.54", "5,696.30", "60,014.84", "3,573.89", "7,923.34"];
    const positions = order.map((figure) => {
      expect(text).toContain(figure);
      return text.indexOf(figure);
    });

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("labels every figure", async () => {
    const { text } = await render("owner");

    expect(text).toContain("GROSS SALES");
    expect(text).toContain("TAX");
    expect(text).toContain("NET SALES");
    expect(text).toContain("TOTAL CASH");
    expect(text).toContain("DOORDASH SALES");
  });

  it("banks the cash after tipouts, not what the tills took", async () => {
    const { text } = await render("owner");

    expect(text).toContain("3,573.89");
    expect(text).not.toContain("5,057.31");
  });

  it("sets the figures large enough to read across a room", async () => {
    const { text } = await render("owner");
    expect(fontSizes(text)[0]).toBeGreaterThan(48);
  });
});

describe("the accountant's report", () => {
  it("is one page", async () => {
    const { doc } = await render("accountant");
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("carries the date, gross sales and DoorDash", async () => {
    const { text } = await render("accountant");

    expect(text).toContain("August 10");
    expect(text).toContain("66,135.54");
    expect(text).toContain("7,923.34");
  });

  /**
   * The reason this is a second document rather than a section of the first.
   * Everything the accountant is not asked for has to be absent from the page,
   * not merely further down it.
   */
  it("carries nothing else off the export", async () => {
    const { text } = await render("accountant");

    expect(text).not.toContain("5,696.30"); // tax
    expect(text).not.toContain("60,014.84"); // net sales
    expect(text).not.toContain("3,573.89"); // cash to bank
    expect(text).not.toContain("60,510.96"); // the Sales Categories total, which is neither
    expect(text).not.toContain("TOTAL CASH");
  });

  it("is set larger still, having only two figures to fit", async () => {
    const owner = fontSizes((await render("owner")).text)[0];
    const accountant = fontSizes((await render("accountant")).text)[0];

    expect(accountant).toBeGreaterThan(owner);
    expect(accountant).toBeGreaterThan(80);
  });
});

describe("both reports", () => {
  it("say which export they were read from", async () => {
    for (const kind of ["owner", "accountant"] as const) {
      const { text } = await render(kind);
      expect(text).toContain("Read from the Toast sales summary");
      expect(text).toContain("8/22/26 8:56 AM");
    }
  });

  it("say on the page when a figure could not be found", async () => {
    const report = { ...(await realReport()), totalCash: null, missing: ["Total Cash (to bank)"] };
    const { text } = await render("owner", report);

    expect(text).toContain("Not found on the export");
    expect(text).not.toContain("3,573.89");
  });

  /**
   * A week that takes seven figures would run a fixed size off the paper. The
   * figure steps down instead, which is the one thing that must never fail
   * quietly on a page whose whole job is to show a number.
   */
  it("shrink a figure that would not otherwise fit the page", async () => {
    const wide = { ...(await realReport()), grossSales: 9_876_543.21 };
    const { doc, text } = await render("accountant", wide);

    // The long figure is set smaller than the short one beside it — and, the
    // part that actually matters, small enough to stay inside the margins.
    const long = sizeOf(text, "9,876,543.21");
    expect(long).toBeLessThan(sizeOf(text, "7,923.34"));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(long);
    const usable = doc.internal.pageSize.getWidth() - 88;
    expect(doc.getTextWidth("$9,876,543.21")).toBeLessThanOrEqual(usable);
  });

  it("name themselves after the period they cover", async () => {
    const report = await realReport();

    expect(salesPdfFilename("owner", report)).toBe(
      "jp-owners-report-2026-08-10-to-2026-08-21.pdf",
    );
    expect(salesPdfFilename("accountant", report)).toBe(
      "jp-accountant-report-2026-08-10-to-2026-08-21.pdf",
    );
  });

  it("name a single-day report after that day", async () => {
    const oneDay = { ...(await realReport()), period: "8/22/26" };
    expect(salesPdfFilename("owner", oneDay)).toBe("jp-owners-report-2026-08-22.pdf");
  });
});
