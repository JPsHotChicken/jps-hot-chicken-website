import { describe, expect, it } from "vitest";

import {
  DAY_KEYS,
  SLOTS,
  coverageBySlot,
  makeEmptyWeek,
  peakCoverage,
  type DaySchedule,
  type WeekSchedule,
} from "@/lib/schedule";

/** A day of `rows` positions with the given half-hour assignments applied. */
function day(rows: number, fills: { row: number; from: number; to: number; id: string }[]) {
  const grid: DaySchedule = Array.from({ length: rows }, () =>
    Array.from({ length: SLOTS.length }, () => null),
  );
  for (const fill of fills) {
    for (let slot = fill.from; slot <= fill.to; slot++) grid[fill.row][slot] = fill.id;
  }
  return grid;
}

describe("coverageBySlot", () => {
  it("counts nobody on an empty day", () => {
    expect(coverageBySlot(day(3, []))).toEqual(SLOTS.map(() => 0));
  });

  it("counts the people on in each half hour", () => {
    const grid = day(3, [
      { row: 0, from: 0, to: 5, id: "ann" },
      { row: 1, from: 3, to: 8, id: "bo" },
      { row: 2, from: 3, to: 4, id: "cy" },
    ]);
    const counts = coverageBySlot(grid);
    expect(counts[0]).toBe(1); // Ann alone
    expect(counts[3]).toBe(3); // all three overlap
    expect(counts[6]).toBe(1); // Bo alone
    expect(counts[9]).toBe(0); // nobody left
  });

  it("counts one person on two positions in the same half hour once", () => {
    const grid = day(2, [
      { row: 0, from: 0, to: 2, id: "ann" },
      { row: 1, from: 0, to: 2, id: "ann" },
    ]);
    expect(coverageBySlot(grid)[1]).toBe(1);
  });

  it("returns a count for every half hour, even on a short or ragged day", () => {
    expect(coverageBySlot([]).length).toBe(SLOTS.length);
    expect(coverageBySlot([["ann"]])).toEqual(SLOTS.map((_, i) => (i === 0 ? 1 : 0)));
  });
});

describe("peakCoverage", () => {
  it("is zero for an empty week", () => {
    expect(peakCoverage(makeEmptyWeek())).toBe(0);
  });

  it("takes the busiest half hour anywhere in the week", () => {
    const week: WeekSchedule = makeEmptyWeek();
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
    const week: WeekSchedule = makeEmptyWeek();
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
