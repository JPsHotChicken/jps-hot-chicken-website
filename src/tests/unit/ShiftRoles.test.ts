import { describe, expect, it } from "vitest";

import {
  makeEmptyDay,
  minuteSlot,
  roleCellForShift,
  shiftAt,
  withShiftRole,
  type RoleCell,
} from "@/lib/schedule";

const ANA = "ana";
const BO = "bo";

/** Ana 10:00–2:00 on row 0, then 4:00–6:00 on row 3; Bo 10:00–12:00 on row 1. */
function sampleDay() {
  const day = makeEmptyDay();
  for (let minute = 600; minute < 840; minute += 30) day[0][minuteSlot(minute)] = ANA;
  for (let minute = 960; minute < 1080; minute += 30) day[3][minuteSlot(minute)] = ANA;
  for (let minute = 600; minute < 720; minute += 30) day[1][minuteSlot(minute)] = BO;
  return day;
}

describe("shiftAt", () => {
  it("finds the whole shift around a clicked half hour", () => {
    expect(shiftAt(sampleDay(), ANA, minuteSlot(720))).toEqual({ start: 600, end: 840 });
    expect(shiftAt(sampleDay(), ANA, minuteSlot(1020))).toEqual({ start: 960, end: 1080 });
  });

  it("returns nothing for a half hour the person isn't on", () => {
    expect(shiftAt(sampleDay(), BO, minuteSlot(900))).toBeUndefined();
  });
});

describe("withShiftRole", () => {
  it("stamps every half hour of the shift", () => {
    const cells = withShiftRole([], ANA, { start: 600, end: 720 }, "lead");
    expect(cells.map((cell) => cell.minute)).toEqual([600, 630, 660, 690]);
    expect(cells.every((cell) => cell.roleId === "lead" && cell.employeeId === ANA)).toBe(true);
  });

  it("replaces the shift's old role and leaves other shifts and people alone", () => {
    const start: RoleCell[] = [
      ...withShiftRole([], ANA, { start: 600, end: 840 }, "lead"),
      ...withShiftRole([], ANA, { start: 960, end: 1080 }, "closer"),
      ...withShiftRole([], BO, { start: 600, end: 720 }, "trainee"),
    ];
    const next = withShiftRole(start, ANA, { start: 600, end: 840 }, "opener");
    const morning = roleCellForShift(next, ANA, { start: 600, end: 840 });
    expect(morning?.roleId).toBe("opener");
    expect(roleCellForShift(next, ANA, { start: 960, end: 1080 })?.roleId).toBe("closer");
    expect(roleCellForShift(next, BO, { start: 600, end: 720 })?.roleId).toBe("trainee");
  });

  it("clears with null", () => {
    const cells = withShiftRole([], ANA, { start: 600, end: 840 }, "lead");
    expect(withShiftRole(cells, ANA, { start: 600, end: 840 }, null)).toEqual([]);
  });
});

describe("roleCellForShift", () => {
  it("keeps the role when the front of the shift is trimmed", () => {
    const cells = withShiftRole([], ANA, { start: 600, end: 840 }, "lead");
    // Now starts an hour later.
    expect(roleCellForShift(cells, ANA, { start: 660, end: 840 })?.roleId).toBe("lead");
  });

  it("keeps the role on both halves when a shift is split", () => {
    const cells = withShiftRole([], ANA, { start: 600, end: 840 }, "lead");
    expect(roleCellForShift(cells, ANA, { start: 600, end: 690 })?.roleId).toBe("lead");
    expect(roleCellForShift(cells, ANA, { start: 750, end: 840 })?.roleId).toBe("lead");
  });

  it("ignores roles left on time outside the shift", () => {
    const cells = withShiftRole([], ANA, { start: 600, end: 720 }, "lead");
    expect(roleCellForShift(cells, ANA, { start: 960, end: 1080 })).toBeUndefined();
  });
});
