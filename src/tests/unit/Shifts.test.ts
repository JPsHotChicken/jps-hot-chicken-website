import { describe, expect, it } from "vitest";

import {
  ROW_COUNT,
  SLOT_COUNT,
  formatHours,
  formatRange,
  formatSlotBlock,
  isClosingShift,
  rangeHours,
  shiftsForDay,
  type DaySchedule,
} from "@/lib/schedule";

/** An empty day, then whatever half-hour cells the test fills in. */
function day(fills: { row: number; from: number; to: number; id: string }[]): DaySchedule {
  const grid: DaySchedule = Array.from({ length: ROW_COUNT }, () =>
    Array.from({ length: SLOT_COUNT }, () => null),
  );
  for (const fill of fills) {
    for (let slot = fill.from; slot <= fill.to; slot++) grid[fill.row][slot] = fill.id;
  }
  return grid;
}

describe("shiftsForDay", () => {
  it("reads a half-hour start as a half-hour start", () => {
    // Slots 5–15 is 10:30 AM through the cell ending at 4:00 PM.
    const ranges = shiftsForDay(day([{ row: 2, from: 5, to: 15, id: "bo" }]), "bo");
    expect(ranges.map(formatRange)).toEqual(["10:30 AM – 4:00 PM"]);
    expect(rangeHours(ranges)).toBe(5.5);
  });

  it("splits a broken day into separate ranges", () => {
    const ranges = shiftsForDay(
      day([
        { row: 0, from: 0, to: 5, id: "ann" },
        { row: 0, from: 12, to: 15, id: "ann" },
      ]),
      "ann",
    );
    expect(ranges.map(formatRange)).toEqual(["8:00 AM – 11:00 AM", "2:00 PM – 4:00 PM"]);
    expect(rangeHours(ranges)).toBe(5);
  });

  it("counts one person on two positions at once only once", () => {
    const ranges = shiftsForDay(
      day([
        { row: 0, from: 4, to: 7, id: "cy" },
        { row: 4, from: 4, to: 7, id: "cy" },
      ]),
      "cy",
    );
    expect(rangeHours(ranges)).toBe(2);
  });

  it("runs the last cell through to closing", () => {
    const ranges = shiftsForDay(day([{ row: 4, from: 26, to: 27, id: "cy" }]), "cy");
    expect(ranges.map(formatRange)).toEqual(["9:00 PM – 10:00 PM"]);
  });
});

describe("isClosingShift", () => {
  it("counts somebody who comes in at 8:30 PM", () => {
    expect(isClosingShift(shiftsForDay(day([{ row: 13, from: 25, to: 27, id: "bo" }]), "bo"))).toBe(
      true,
    );
  });

  it("counts somebody working through 8 PM", () => {
    expect(isClosingShift(shiftsForDay(day([{ row: 0, from: 20, to: 27, id: "bo" }]), "bo"))).toBe(
      true,
    );
  });

  it("leaves a shift that ends at 8 PM alone", () => {
    // Slots 8–23 ends at the cell finishing 8:00 PM exactly.
    expect(isClosingShift(shiftsForDay(day([{ row: 0, from: 8, to: 23, id: "ann" }]), "ann"))).toBe(
      false,
    );
  });

  it("is false for somebody who isn't on at all", () => {
    expect(isClosingShift([])).toBe(false);
  });
});

describe("formatting", () => {
  it("drops a trailing zero from whole hours", () => {
    expect(formatHours(6)).toBe("6");
    expect(formatHours(6.5)).toBe("6.5");
    expect(formatHours(0)).toBe("0");
  });

  it("spells out both periods only when a half hour straddles noon", () => {
    expect(formatSlotBlock(0)).toBe("8:00–8:30 AM");
    expect(formatSlotBlock(7)).toBe("11:30 AM–12:00 PM");
    expect(formatSlotBlock(8)).toBe("12:00–12:30 PM");
  });
});
