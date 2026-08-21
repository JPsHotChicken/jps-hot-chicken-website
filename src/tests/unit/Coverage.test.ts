import { describe, expect, it } from "vitest";

import {
  DAY_KEYS,
  HOURS,
  coverageByHour,
  makeEmptyWeek,
  peakCoverage,
  type DaySchedule,
  type WeekSchedule,
} from "@/lib/schedule";

/** A day of `rows` rows with the given assignments applied. */
function day(rows: number, fills: { row: number; from: number; to: number; id: string }[]) {
  const grid: DaySchedule = Array.from({ length: rows }, () =>
    Array.from({ length: HOURS.length }, () => null),
  );
  for (const fill of fills) {
    for (let hour = fill.from; hour <= fill.to; hour++) grid[fill.row][hour] = fill.id;
  }
  return grid;
}

describe("coverageByHour", () => {
  it("counts nobody on an empty day", () => {
    expect(coverageByHour(day(3, []))).toEqual(HOURS.map(() => 0));
  });

  it("counts the people on in each hour", () => {
    const grid = day(3, [
      { row: 0, from: 0, to: 5, id: "ann" },
      { row: 1, from: 3, to: 8, id: "bo" },
      { row: 2, from: 3, to: 4, id: "cy" },
    ]);
    const counts = coverageByHour(grid);
    expect(counts[0]).toBe(1); // Ann alone
    expect(counts[3]).toBe(3); // all three overlap
    expect(counts[6]).toBe(1); // Bo alone
    expect(counts[9]).toBe(0); // nobody left
  });

  it("counts one person in two rows of the same hour once", () => {
    const grid = day(2, [
      { row: 0, from: 0, to: 2, id: "ann" },
      { row: 1, from: 0, to: 2, id: "ann" },
    ]);
    expect(coverageByHour(grid)[1]).toBe(1);
  });

  it("returns a count for every hour, even on a short or ragged day", () => {
    expect(coverageByHour([]).length).toBe(HOURS.length);
    expect(coverageByHour([["ann"]])).toEqual(HOURS.map((_, i) => (i === 0 ? 1 : 0)));
  });
});

describe("peakCoverage", () => {
  it("is zero for an empty week", () => {
    expect(peakCoverage(makeEmptyWeek(4))).toBe(0);
  });

  it("takes the busiest hour anywhere in the week", () => {
    const week: WeekSchedule = makeEmptyWeek(3);
    week.monday = day(3, [
      { row: 0, from: 2, to: 6, id: "ann" },
      { row: 1, from: 2, to: 6, id: "bo" },
    ]);
    week.friday = day(3, [
      { row: 0, from: 4, to: 9, id: "ann" },
      { row: 1, from: 4, to: 9, id: "bo" },
      { row: 2, from: 4, to: 9, id: "cy" },
    ]);
    expect(peakCoverage(week)).toBe(3);
  });

  it("ignores days the store is closed", () => {
    const week: WeekSchedule = makeEmptyWeek(3);
    week.monday = day(3, [{ row: 0, from: 0, to: 3, id: "ann" }]);
    // Left over in the data; Sunday is closed, so it can't set the scale.
    week.sunday = day(3, [
      { row: 0, from: 0, to: 3, id: "ann" },
      { row: 1, from: 0, to: 3, id: "bo" },
      { row: 2, from: 0, to: 3, id: "cy" },
    ]);
    expect(peakCoverage(week)).toBe(1);
  });

  it("survives a week missing days entirely", () => {
    const partial = { monday: day(2, [{ row: 0, from: 1, to: 2, id: "ann" }]) } as WeekSchedule;
    expect(DAY_KEYS.length).toBe(7);
    expect(peakCoverage(partial)).toBe(1);
  });
});
