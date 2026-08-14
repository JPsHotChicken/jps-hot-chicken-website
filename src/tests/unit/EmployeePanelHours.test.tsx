import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmployeePanel } from "@/components/admin/EmployeePanel";
import { DAY_KEYS, HOURS, type WeekSchedule } from "@/lib/schedule";

const rowCount = 6;
const emptyDay = () =>
  Array.from({ length: rowCount }, () => Array.from({ length: HOURS.length }, () => null));

function buildWeek(): WeekSchedule {
  const week = Object.fromEntries(DAY_KEYS.map((d) => [d, emptyDay()])) as WeekSchedule;
  // Alex: Mon + Tue, 10 AM–4 PM = 6 h each = 12 h.
  for (const day of ["monday", "tuesday"] as const)
    for (let i = 2; i <= 7; i++) week[day][0][i] = "e1";
  // Zoe: Monday 4–10 PM = 6 h, and a second row for the same hour to prove
  // overlapping rows are not double counted.
  for (let i = 8; i <= 13; i++) week.monday[1][i] = "e2";
  week.monday[2][8] = "e2";
  return week;
}

const employees = [
  { id: "e1", name: "Alex Morning", group: "morning" as const },
  { id: "e2", name: "Zoe Nightshift", group: "night" as const },
  { id: "e3", name: "Sam Unscheduled", group: "other" as const },
];

describe("EmployeePanel weekly hours", () => {
  it("shows each person's total for the week on screen", () => {
    render(
      <EmployeePanel
        employees={employees}
        week={buildWeek()}
        onAdd={() => {}}
        onRemove={() => {}}
        onRegenerateCode={() => {}}
      />,
    );

    const row = (name: string) => screen.getByText(name).closest("li")!;
    expect(within(row("Alex Morning")).getByText("12h")).toBeInTheDocument();
    expect(within(row("Zoe Nightshift")).getByText("6h")).toBeInTheDocument();
    expect(within(row("Sam Unscheduled")).getByText("0h")).toBeInTheDocument();
  });
});
