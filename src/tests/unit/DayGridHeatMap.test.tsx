import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DayGrid } from "@/components/admin/DayGrid";
import { HOURS, formatHourBlock, type DaySchedule } from "@/lib/schedule";

const rowCount = 3;

function buildDay(): DaySchedule {
  const day: DaySchedule = Array.from({ length: rowCount }, () =>
    Array.from({ length: HOURS.length }, () => null),
  );
  // Ann 8 AM–2 PM, Bo 11 AM–6 PM, and Ann again in a second row at 11 AM — one
  // person in two rows is still one person.
  for (let i = 0; i <= 5; i++) day[0][i] = "e1";
  for (let i = 3; i <= 9; i++) day[1][i] = "e2";
  day[2][3] = "e1";
  return day;
}

const employees = [
  { id: "e1", name: "Ann", group: "morning" as const },
  { id: "e2", name: "Bo", group: "night" as const },
];

function renderDay() {
  render(
    <DayGrid
      day="monday"
      date={new Date(2026, 7, 17)}
      schedule={buildDay()}
      rowCount={rowCount}
      employees={employees}
      peak={2}
      selection={null}
      onEditRange={() => {}}
      onCopyToDays={() => {}}
    />,
  );
}

describe("DayGrid hour heat map", () => {
  it("shows how many people are on in each hour", () => {
    renderDay();

    const hour = (index: number) => formatHourBlock(HOURS[index]);

    // Ann alone, then Ann (in two rows at once) with Bo, then Bo alone, then
    // an hour with nobody on it at all.
    expect(screen.getByTitle(`1 person on ${hour(0)}`)).toHaveTextContent("1");
    expect(screen.getByTitle(`2 people on ${hour(3)}`)).toHaveTextContent("2");
    expect(screen.getByTitle(`1 person on ${hour(7)}`)).toHaveTextContent("1");
    expect(screen.getByTitle(`0 people on ${hour(12)}`)).toHaveTextContent("0");
  });

  it("shades the busiest hour hotter than a quiet one", () => {
    renderDay();

    const busy = screen.getByTitle(`2 people on ${formatHourBlock(HOURS[3])}`);
    const quiet = screen.getByTitle(`1 person on ${formatHourBlock(HOURS[0])}`);
    const empty = screen.getByTitle(`0 people on ${formatHourBlock(HOURS[12])}`);

    expect(busy.className).toContain("bg-red-500");
    expect(quiet.className).toContain("bg-orange-300");
    expect(empty.className).toContain("bg-muted");
  });

  it("says nothing about hours on a day the store is closed", () => {
    render(
      <DayGrid
        day="sunday"
        date={new Date(2026, 7, 23)}
        schedule={buildDay()}
        rowCount={rowCount}
        employees={employees}
        peak={2}
        selection={null}
        onEditRange={() => {}}
        onCopyToDays={() => {}}
      />,
    );

    expect(screen.queryByTitle(/on \d/)).toBeNull();
    expect(screen.getByText(/store is closed/i)).toBeInTheDocument();
  });
});
