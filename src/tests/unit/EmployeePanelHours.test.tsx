import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmployeePanel } from "@/components/admin/EmployeePanel";
import { makeEmptyWeek, type WeekSchedule } from "@/lib/schedule";

function buildWeek(): WeekSchedule {
  const week = makeEmptyWeek();
  // Alex: Mon + Tue, 10 AM–4 PM = 6 h each = 12 h.
  for (const day of ["monday", "tuesday"] as const)
    for (let slot = 4; slot <= 15; slot++) week[day][0][slot] = "e1";
  // Zoe: Monday 4–10 PM, but coming in at 4:30 — half an hour short of 6 — and
  // a second position for the same half hour to prove overlaps aren't doubled.
  for (let slot = 17; slot <= 27; slot++) week.monday[1][slot] = "e2";
  week.monday[2][17] = "e2";
  return week;
}

const employees = [
  { id: "e1", name: "Alex Morning", group: "morning" as const },
  { id: "e2", name: "Zoe Nightshift", group: "night" as const },
  { id: "e3", name: "Sam Unscheduled", group: "other" as const },
];

describe("EmployeePanel weekly hours", () => {
  it("shows each person's total for the week on screen", () => {
    render(<EmployeePanel employees={employees} week={buildWeek()} />);

    const row = (name: string) => screen.getByText(name).closest("li")!;
    expect(within(row("Alex Morning")).getByText("12h")).toBeInTheDocument();
    expect(within(row("Zoe Nightshift")).getByText("5.5h")).toBeInTheDocument();
    expect(within(row("Sam Unscheduled")).getByText("0h")).toBeInTheDocument();
  });
});
