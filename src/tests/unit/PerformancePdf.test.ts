import { describe, expect, it } from "vitest";

import { buildPerformancePdf, printable } from "@/lib/performance-pdf";
import {
  buildEmployeeSheet,
  buildLeadershipSheet,
  buildStationSheet,
  emptyMetric,
  sheetFilename,
  type Metric,
  type PerformanceData,
} from "@/lib/performance";

/**
 * jsPDF writes its content streams uncompressed, so the text drawn onto the
 * page can be read straight back out of the output. That is enough to hold the
 * sheet to what it claims — that every assigned metric is on it, that the bands
 * somebody has to judge against are printed beside them, and that no character
 * comes out as mojibake.
 */
let next = 0;
const metric = (over: Partial<Metric> = {}): Metric => ({
  ...emptyMetric(),
  id: `m${next}`,
  name: `Metric ${next}`,
  sortOrder: next++,
  ...over,
});

const data: PerformanceData = {
  stations: [
    { id: "s1", name: "Line", sortOrder: 0 },
    { id: "s2", name: "Expo", sortOrder: 1 },
  ],
  employees: [
    {
      id: "e1",
      name: "Dana Whitfield",
      role: "crew",
      hireDate: "2024-03-11",
      active: true,
      stationIds: ["s1"],
    },
    {
      id: "e2",
      name: "Marcus Bell",
      role: "shift_lead",
      hireDate: null,
      active: true,
      stationIds: ["s1", "s2"],
    },
  ],
  metrics: [
    metric({
      name: "Order accuracy",
      category: "Quality",
      type: "percentage",
      direction: "higher",
      target: 98,
      roles: ["crew", "shift_lead"],
    }),
    metric({
      name: "Window time",
      category: "Speed",
      type: "duration",
      direction: "lower",
      target: 180,
      roles: ["crew", "shift_lead"],
    }),
    metric({ name: "Hand-wash check", category: "Safety", type: "pass_fail", roles: ["crew"] }),
    metric({
      name: "Ticket time",
      category: "Speed",
      type: "duration",
      direction: "lower",
      target: 240,
      scope: "station",
      stationIds: ["s1"],
    }),
    metric({
      name: "Shift huddle held",
      category: "Leadership",
      type: "pass_fail",
      scope: "leadership",
      roles: ["shift_lead"],
    }),
  ],
};

const preparedAt = new Date("2026-08-18T12:00:00Z");
const today = new Date("2026-08-18T00:00:00");

const render = async (sheets: Parameters<typeof buildPerformancePdf>[0]["sheets"]) => {
  const doc = await buildPerformancePdf({ sheets, preparedAt });
  return { doc, text: doc.output() };
};

describe("the printed sheet", () => {
  it("carries every metric assigned to the person", async () => {
    const sheet = buildEmployeeSheet(data.employees[0], data, "weekly", today);
    const { text } = await render([sheet]);

    for (const name of ["Order accuracy", "Window time", "Hand-wash check"]) {
      expect(text).toContain(name);
    }
    expect(text).toContain("Dana Whitfield");
  });

  it("leaves off the metrics that are somebody else's", async () => {
    const sheet = buildEmployeeSheet(data.employees[0], data, "weekly", today);
    const { text } = await render([sheet]);

    // Station and leadership metrics belong on their own sheets.
    expect(text).not.toContain("Ticket time");
    expect(text).not.toContain("Shift huddle held");
  });

  /** The line that makes the sheet usable away from a screen. */
  it("prints the bands to judge each number against", async () => {
    const sheet = buildEmployeeSheet(data.employees[0], data, "weekly", today);
    const { text } = await render([sheet]);

    expect(text).toContain("G >= 98");
    expect(text).toContain("G <= 3:00");
    expect(text).toContain("G pass");
  });

  it("prints the cross-training index beside the name", async () => {
    const sheet = buildEmployeeSheet(data.employees[0], data, "weekly", today);
    const { text } = await render([sheet]);
    expect(text).toContain("Certified at 1 of 2 stations");
  });

  it("labels a week's columns with its days", async () => {
    const sheet = buildEmployeeSheet(data.employees[0], data, "weekly", today);
    const { text } = await render([sheet]);
    for (const day of ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]) {
      expect(text).toContain(day);
    }
  });

  it("gives a monthly sheet weeks instead", async () => {
    const sheet = buildEmployeeSheet(data.employees[0], data, "monthly", today);
    const { text } = await render([sheet]);
    expect(text).toContain("WK 1");
    expect(text).toContain("WK 5");
    // Not "MON" — that is a substring of the "ONE MONTH STARTING" box.
    expect(text).not.toContain("WED");
    expect(text).not.toContain("SAT");
  });

  it("prints the scoring rule, so the totals can be worked out by hand", async () => {
    const sheet = buildEmployeeSheet(data.employees[0], data, "weekly", today);
    const { text } = await render([sheet]);
    expect(text).toContain("HOW TO SCORE");
    expect(text).toContain("WEIGHTED SCORE");
  });

  /**
   * jsPDF's built-in Helvetica is WinAnsi-encoded, so a `>=` drawn straight
   * from the screen's formatting comes out as garbage on paper. Everything is
   * flattened on the way in, and nothing that survived would be readable.
   */
  it("draws no character the built-in font cannot print", async () => {
    const sheet = buildEmployeeSheet(data.employees[0], data, "weekly", today);
    const { text } = await render([sheet]);
    for (const char of ["≥", "≤", "±", "–", "…"]) {
      expect(text).not.toContain(char);
    }
  });

  it("rewrites those characters rather than dropping them", () => {
    expect(printable("≥ 98% · ≤ 3:00 · ±2 · 1–5")).toBe(">= 98% · <= 3:00 · +/-2 · 1-5");
  });
});

describe("a batch of sheets", () => {
  it("starts each one on its own page", async () => {
    const sheets = [
      buildEmployeeSheet(data.employees[0], data, "weekly", today),
      buildEmployeeSheet(data.employees[1], data, "weekly", today),
      buildStationSheet(data.stations[0], data, "weekly"),
      buildLeadershipSheet(data, "weekly"),
    ];
    const { doc, text } = await render(sheets);

    expect(doc.getNumberOfPages()).toBe(4);
    expect(text).toContain("Page 1 of 4");
    expect(text).toContain("Page 4 of 4");
  });

  it("stamps the date it was printed on every page", async () => {
    const sheets = [
      buildEmployeeSheet(data.employees[0], data, "weekly", today),
      buildStationSheet(data.stations[0], data, "weekly"),
    ];
    const { text } = await render(sheets);
    expect(text.match(/Printed Aug 18, 2026/g)).toHaveLength(2);
  });

  it("names the file after the one person it is for", () => {
    const sheet = buildEmployeeSheet(data.employees[0], data, "weekly", today);
    expect(sheetFilename([sheet], "weekly")).toMatch(
      /^jp-performance-dana-whitfield-weekly-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });

  it("names a batch generically", () => {
    const sheets = [
      buildEmployeeSheet(data.employees[0], data, "weekly", today),
      buildEmployeeSheet(data.employees[1], data, "weekly", today),
    ];
    expect(sheetFilename(sheets, "weekly")).toMatch(
      /^jp-performance-sheets-weekly-\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });
});

describe("a sheet with nothing on it", () => {
  /**
   * A manager with no metrics assigned still gets a page. Printing nothing at
   * all would look like the export failed; a page saying why is the difference
   * between a bug and a to-do.
   */
  it("prints a page explaining itself rather than failing", async () => {
    const empty = buildEmployeeSheet(
      { id: "e3", name: "Priya", role: "manager", hireDate: null, active: true, stationIds: [] },
      data,
      "weekly",
      today,
    );
    const { doc, text } = await render([empty]);

    expect(doc.getNumberOfPages()).toBe(1);
    expect(text).toContain("Priya");
    expect(text).toContain("No metrics are assigned here yet");
  });

  it("says so when there is nothing selected at all", async () => {
    const { doc, text } = await render([]);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(text).toContain("There is nothing to print yet");
  });
});
