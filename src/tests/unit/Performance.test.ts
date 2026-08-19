import { describe, expect, it } from "vitest";

import {
  BAND_POINTS,
  bandsFor,
  buildEmployeeSheet,
  buildLeadershipSheet,
  buildStationSheet,
  classify,
  cloneRoleAssignment,
  cloneStationAssignment,
  crossTrainingIndex,
  emptyMetric,
  formatBands,
  formatDuration,
  formatTarget,
  formatTenure,
  isMerged,
  metricsForRole,
  metricsForStation,
  parseDuration,
  weightedScore,
  type Metric,
  type PerformanceData,
  type PerformanceEmployee,
  type Station,
} from "@/lib/performance";

let next = 0;
const metric = (over: Partial<Metric> = {}): Metric => ({
  ...emptyMetric(),
  id: `m${next}`,
  name: `Metric ${next}`,
  sortOrder: next++,
  ...over,
});

const station = (id: string, name: string, sortOrder = 0): Station => ({ id, name, sortOrder });

const person = (over: Partial<PerformanceEmployee> = {}): PerformanceEmployee => ({
  id: "e1",
  name: "Dana Whitfield",
  role: "crew",
  hireDate: null,
  active: true,
  stationIds: [],
  ...over,
});

describe("threshold bands", () => {
  it("puts amber a tenth below target when higher is better", () => {
    const accuracy = metric({ direction: "higher", target: 100 });
    expect(bandsFor(accuracy)).toEqual({ kind: "higher", green: 100, amber: 90 });

    expect(classify(accuracy, 100)).toBe("green");
    expect(classify(accuracy, 95)).toBe("amber");
    expect(classify(accuracy, 89.9)).toBe("red");
  });

  it("puts amber a tenth above target when lower is better", () => {
    const wait = metric({ direction: "lower", target: 200, type: "duration" });
    expect(bandsFor(wait)).toEqual({ kind: "lower", green: 200, amber: 220 });

    expect(classify(wait, 180)).toBe("green");
    expect(classify(wait, 215)).toBe("amber");
    expect(classify(wait, 240)).toBe("red");
  });

  /**
   * The case that breaks a naive percentage margin. "No cash-drawer misses" is
   * a real target, and ten percent of zero is zero — which would collapse amber
   * and make one cent as bad as fifty dollars.
   */
  it("falls back to a whole unit when the target is zero", () => {
    const misses = metric({ direction: "lower", target: 0, type: "count" });
    expect(bandsFor(misses)).toEqual({ kind: "lower", green: 0, amber: 1 });

    expect(classify(misses, 0)).toBe("green");
    expect(classify(misses, 1)).toBe("amber");
    expect(classify(misses, 2)).toBe("red");
  });

  it("lets a hand-set cutoff override the derived one", () => {
    const custom = metric({ direction: "higher", target: 95, greenAt: 90, amberAt: 80 });
    expect(bandsFor(custom)).toEqual({ kind: "higher", green: 90, amber: 80 });
    expect(classify(custom, 85)).toBe("amber");
  });

  it("bands a range either side, with a shoulder outside it", () => {
    const temp = metric({ direction: "range", targetMin: 150, targetMax: 165, amberAt: 5 });
    expect(classify(temp, 158)).toBe("green");
    expect(classify(temp, 147)).toBe("amber");
    expect(classify(temp, 169)).toBe("amber");
    expect(classify(temp, 171)).toBe("red");
    expect(classify(temp, 140)).toBe("red");
  });

  it("reads a reversed range the right way round", () => {
    const reversed = metric({ direction: "range", targetMin: 165, targetMax: 150, amberAt: 5 });
    expect(classify(reversed, 158)).toBe("green");
    expect(classify(reversed, 140)).toBe("red");
  });

  it("treats an exact target as green only on the number, unless given a tolerance", () => {
    const exact = metric({ direction: "exact", target: 0, type: "currency" });
    expect(classify(exact, 0)).toBe("green");
    expect(classify(exact, 0.5)).toBe("red");

    const tolerant = metric({ direction: "exact", target: 0, amberAt: 2, type: "currency" });
    expect(classify(tolerant, 1.5)).toBe("amber");
    expect(classify(tolerant, 3)).toBe("red");
  });

  it("bands pass/fail without a target", () => {
    const check = metric({ type: "pass_fail" });
    expect(bandsFor(check)).toEqual({ kind: "pass" });
    expect(classify(check, true)).toBe("green");
    expect(classify(check, false)).toBe("red");
  });

  it("has no bands for a metric nobody has set a target on", () => {
    expect(bandsFor(metric({ target: null }))).toBeNull();
    expect(classify(metric({ target: null }), 10)).toBeNull();
    expect(formatBands(metric({ target: null }))).toBe("");
  });

  it("says nothing about a value that was never written down", () => {
    expect(classify(metric({ target: 10 }), null)).toBeNull();
  });
});

describe("the weighted score", () => {
  it("weights each row by its own weight", () => {
    const score = weightedScore([
      { weight: 3, band: "green" },
      { weight: 1, band: "red" },
    ]);
    // (100×3 + 0×1) ÷ 4
    expect(score).toBe(75);
  });

  /**
   * The half-filled sheet. Three of ten rows written up should score what those
   * three earned — counting the blanks as zero would make an honest partial
   * sheet look like a catastrophe and teach everyone not to hand one in.
   */
  it("ignores rows nobody filled in", () => {
    expect(
      weightedScore([
        { weight: 1, band: "green" },
        { weight: 1, band: null },
        { weight: 1, band: null },
      ]),
    ).toBe(BAND_POINTS.green);
  });

  it("ignores rows carrying no weight", () => {
    expect(
      weightedScore([
        { weight: 0, band: "red" },
        { weight: 2, band: "green" },
      ]),
    ).toBe(100);
  });

  it("has no score when there is nothing to score", () => {
    expect(weightedScore([])).toBeNull();
    expect(weightedScore([{ weight: 2, band: null }])).toBeNull();
  });
});

describe("the cross-training index", () => {
  // Ordered the way the owner arranged them, not alphabetically — the index
  // lists stations in that order, and equal sort keys would hide a mistake.
  const stations = [station("s1", "Line", 0), station("s2", "Expo", 1), station("s3", "Dish", 2)];

  it("counts the stations somebody is signed off on", () => {
    const index = crossTrainingIndex(person({ stationIds: ["s1", "s3"] }), stations);
    expect(index).toMatchObject({ certified: 2, total: 3, percent: 67 });
    expect(index.names).toEqual(["Line", "Dish"]);
  });

  /**
   * A certification pointing at a station that no longer exists must not count.
   * The database cascade removes those rows, but the page holds a copy while a
   * delete is in flight, and an index that inflates in that window is worse
   * than one that lags.
   */
  it("does not count a certification for a station that is gone", () => {
    const index = crossTrainingIndex(person({ stationIds: ["s1", "deleted"] }), stations);
    expect(index.certified).toBe(1);
  });

  it("does not divide by zero before any station exists", () => {
    expect(crossTrainingIndex(person(), [])).toMatchObject({ certified: 0, total: 0, percent: 0 });
  });
});

describe("assignment", () => {
  const line = station("s1", "Line");
  const expo = station("s2", "Expo");

  const metrics = [
    metric({ name: "Accuracy", scope: "individual", roles: ["crew", "shift_lead"] }),
    metric({ name: "Huddle", scope: "leadership", roles: ["shift_lead", "manager"] }),
    metric({ name: "Ticket time", scope: "station", stationIds: ["s1"] }),
    metric({ name: "Archived one", scope: "individual", roles: ["crew"], archived: true }),
  ];

  it("prints a role's own metrics, and never a station's", () => {
    const crew = metricsForRole(metrics, "crew").map((m) => m.name);
    expect(crew).toEqual(["Accuracy"]);
  });

  it("gives a shift lead their leadership metrics too", () => {
    expect(metricsForRole(metrics, "shift_lead").map((m) => m.name)).toEqual([
      "Accuracy",
      "Huddle",
    ]);
  });

  it("prints only the metrics assigned to a station", () => {
    expect(metricsForStation(metrics, line.id).map((m) => m.name)).toEqual(["Ticket time"]);
    expect(metricsForStation(metrics, expo.id)).toEqual([]);
  });

  it("leaves archived metrics off every sheet", () => {
    expect(metricsForRole(metrics, "crew").some((m) => m.archived)).toBe(false);
  });

  it("clones only what the target is missing", () => {
    expect(cloneRoleAssignment(metrics, "crew", "manager")).toEqual([metrics[0].id]);
    // The shift lead already has it, so a second run moves nothing.
    expect(cloneRoleAssignment(metrics, "crew", "shift_lead")).toEqual([]);
    expect(cloneRoleAssignment(metrics, "crew", "crew")).toEqual([]);
  });

  it("clones station sets the same way", () => {
    expect(cloneStationAssignment(metrics, "s1", "s2")).toEqual([metrics[2].id]);
    expect(cloneStationAssignment(metrics, "s1", "s1")).toEqual([]);
  });
});

describe("formatting for the printed row", () => {
  it("writes the target with its direction", () => {
    expect(formatTarget(metric({ direction: "higher", target: 98, type: "percentage" }))).toBe(
      "≥ 98%",
    );
    expect(formatTarget(metric({ direction: "lower", target: 180, type: "duration" }))).toBe(
      "≤ 3:00",
    );
    expect(formatTarget(metric({ direction: "exact", target: 0, type: "currency" }))).toBe(
      "= $0.00",
    );
    expect(formatTarget(metric({ type: "pass_fail" }))).toBe("Pass");
  });

  it("writes a range with both ends and the unit once", () => {
    const temp = metric({ direction: "range", targetMin: 150, targetMax: 165, unit: "°F" });
    expect(formatTarget(temp)).toBe("150–165 °F");
  });

  it("spells the bands out so the sheet reads without the app", () => {
    expect(formatBands(metric({ direction: "higher", target: 100 }))).toBe(
      "G ≥ 100 · A ≥ 90 · R below",
    );
    expect(formatBands(metric({ type: "pass_fail" }))).toBe("G pass · R fail");
  });

  it("reads a duration typed either way", () => {
    expect(parseDuration("3:00")).toBe(180);
    expect(parseDuration("180")).toBe(180);
    expect(parseDuration("1:02:30")).toBe(3750);
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration("3:")).toBeNull();
  });

  it("writes a duration back the way it is read aloud", () => {
    expect(formatDuration(180)).toBe("3:00");
    expect(formatDuration(95)).toBe("1:35");
    expect(formatDuration(3750)).toBe("1:02:30");
  });

  it("says how long somebody has been here", () => {
    // Parsed as local time. The bare "2026-08-18" form is UTC midnight, which
    // is the previous evening in any western timezone and quietly shortens
    // every tenure below by a month.
    const today = new Date("2026-08-18T00:00:00");
    expect(formatTenure("2026-08-01", today)).toBe("New");
    expect(formatTenure("2026-02-18", today)).toBe("6 months");
    expect(formatTenure("2026-08-18", today)).toBe("New");
    expect(formatTenure("2024-08-18", today)).toBe("2 years");
    expect(formatTenure("2024-03-18", today)).toBe("2 years 5m");
    expect(formatTenure(null, today)).toBe("");
  });
});

describe("laying a sheet out", () => {
  const stations = [station("s1", "Line", 0), station("s2", "Expo", 1), station("s3", "Dish", 2)];

  const data: PerformanceData = {
    stations,
    employees: [
      person({ id: "e1", name: "Dana", role: "crew", stationIds: ["s1"], hireDate: "2024-08-18" }),
      person({ id: "e2", name: "Marcus", role: "shift_lead", stationIds: ["s1", "s2"] }),
      person({ id: "e3", name: "Gone", role: "crew", active: false }),
    ],
    metrics: [
      metric({ name: "Accuracy", category: "Quality", roles: ["crew"], frequency: "shift", weight: 3 }),
      metric({ name: "Waste log", category: "Quality", roles: ["crew"], frequency: "weekly", weight: 1 }),
      metric({ name: "Ticket time", category: "Speed", scope: "station", stationIds: ["s1"] }),
      metric({ name: "Huddle", category: "Leadership", scope: "leadership", roles: ["shift_lead"] }),
    ],
  };

  /**
   * The rule that keeps a week's sheet from being mostly blanks: a metric
   * measured weekly has nothing to put in six of seven daily boxes, so it gets
   * one wide cell instead.
   */
  it("splits rows measured more often than the sheet, and merges the rest", () => {
    expect(isMerged("shift", "weekly")).toBe(false);
    expect(isMerged("daily", "weekly")).toBe(false);
    expect(isMerged("weekly", "weekly")).toBe(true);
    expect(isMerged("monthly", "weekly")).toBe(true);
    expect(isMerged("shift", "shift")).toBe(true);
  });

  it("gives a weekly sheet seven columns and cuts the rows to match", () => {
    const sheet = buildEmployeeSheet(data.employees[0], data, "weekly", new Date("2026-08-18T00:00:00"));
    expect(sheet.columns).toHaveLength(7);

    const rows = sheet.groups.flatMap((group) => group.rows);
    expect(rows.find((row) => row.metric.name === "Accuracy")).toMatchObject({
      cells: 7,
      merged: false,
    });
    expect(rows.find((row) => row.metric.name === "Waste log")).toMatchObject({
      cells: 1,
      merged: true,
    });
  });

  it("puts the cross-training index beside the name", () => {
    const sheet = buildEmployeeSheet(data.employees[0], data, "weekly", new Date("2026-08-18T00:00:00"));
    expect(sheet.title).toBe("Dana");
    expect(sheet.subtitle).toContain("Certified at 1 of 3 stations");
    expect(sheet.subtitle).toContain("2 years");
  });

  it("totals the weights for the score box", () => {
    const sheet = buildEmployeeSheet(data.employees[0], data, "weekly", new Date("2026-08-18T00:00:00"));
    expect(sheet.metricCount).toBe(2);
    expect(sheet.totalWeight).toBe(4);
  });

  it("groups rows by category", () => {
    const sheet = buildEmployeeSheet(data.employees[1], data, "weekly", new Date("2026-08-18T00:00:00"));
    expect(sheet.groups.map((group) => group.category)).toEqual(["Leadership"]);
  });

  it("names who is certified on a station sheet", () => {
    const sheet = buildStationSheet(stations[0], data, "shift");
    expect(sheet.title).toBe("Line");
    expect(sheet.subtitle).toBe("Certified: Dana, Marcus");
    expect(sheet.metricCount).toBe(1);
  });

  it("says so plainly when nobody is certified", () => {
    expect(buildStationSheet(stations[2], data, "shift").subtitle).toBe(
      "Nobody is certified here yet",
    );
  });

  it("lists the leads on the leadership sheet, and leaves out anyone who left", () => {
    const sheet = buildLeadershipSheet(data, "weekly");
    expect(sheet.subtitle).toBe("Marcus (Shift lead)");
    expect(sheet.metricCount).toBe(1);
  });

  it("builds an empty sheet rather than failing when nothing is assigned", () => {
    const bare = buildEmployeeSheet(person({ role: "manager" }), data, "weekly");
    expect(bare.metricCount).toBe(0);
    expect(bare.groups).toEqual([]);
    expect(bare.totalWeight).toBe(0);
  });
});
