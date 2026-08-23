import { describe, expect, it } from "vitest";

import { EMPLOYEE_COLORS, employeeColors } from "@/lib/employee-colors";

const roster = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: `employee-${i}` }));

describe("employeeColors", () => {
  it("gives everybody a different colour while there are colours left", () => {
    const colors = employeeColors(roster(EMPLOYEE_COLORS.length));
    const cells = [...colors.values()].map((color) => color.cell);
    expect(new Set(cells).size).toBe(EMPLOYEE_COLORS.length);
  });

  it("keeps a person's colour when the roster is re-ordered", () => {
    const people = roster(9);
    const first = employeeColors(people);
    const second = employeeColors([...people].reverse());
    for (const person of people) {
      expect(second.get(person.id)).toBe(first.get(person.id));
    }
  });

  it("repaints at most the one person a new hire collides with", () => {
    const people = roster(6);
    const before = employeeColors(people);

    // Whoever is hired next, the disruption has to stay local: taking a shade
    // off one person is the worst it may do, never reshuffling the whole board.
    for (let n = 0; n < 60; n++) {
      const after = employeeColors([...people, { id: `new-hire-${n}` }]);
      const moved = people.filter((person) => after.get(person.id) !== before.get(person.id));
      expect(moved.length).toBeLessThanOrEqual(1);
    }
  });

  it("carries on past the end of the palette rather than dropping anyone", () => {
    const people = roster(EMPLOYEE_COLORS.length + 5);
    const colors = employeeColors(people);
    expect(colors.size).toBe(people.length);
    for (const person of people) expect(colors.get(person.id)).toBeDefined();
  });
});
