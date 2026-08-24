import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DayGrid } from "@/components/admin/DayGrid";
import {
  ROW_COUNT,
  SLOT_COUNT,
  formatSlotBlock,
  type DayOff,
  type DaySchedule,
} from "@/lib/schedule";

function buildDay(): DaySchedule {
  const day: DaySchedule = Array.from({ length: ROW_COUNT }, () =>
    Array.from({ length: SLOT_COUNT }, () => null),
  );
  // Ann 8–11 AM on front of house, Bo 9:30 AM–1 PM on the line, and Ann again
  // on expo at 9:30 — one person on two positions is still one person.
  for (let i = 0; i <= 5; i++) day[0][i] = "e1";
  for (let i = 3; i <= 9; i++) day[4][i] = "e2";
  day[2][3] = "e1";
  return day;
}

const employees = [
  { id: "e1", name: "Ann", group: "morning" as const },
  { id: "e2", name: "Bo", group: "night" as const },
];

function renderDay(off: DayOff[] = []) {
  render(
    <DayGrid
      day="monday"
      date={new Date(2026, 7, 17)}
      schedule={buildDay()}
      employees={employees}
      off={off}
      peak={2}
      selection={null}
      onEditRange={() => {}}
      onCopyToDays={() => {}}
    />,
  );
}

describe("DayGrid half-hour heat map", () => {
  it("shows how many people are on in each half hour", () => {
    renderDay();

    // Ann alone, then Ann (on two positions at once) with Bo, then Bo alone,
    // then a half hour with nobody on it at all.
    expect(screen.getByTitle(`1 person on ${formatSlotBlock(0)}`)).toHaveTextContent("1");
    expect(screen.getByTitle(`2 people on ${formatSlotBlock(3)}`)).toHaveTextContent("2");
    expect(screen.getByTitle(`1 person on ${formatSlotBlock(7)}`)).toHaveTextContent("1");
    expect(screen.getByTitle(`0 people on ${formatSlotBlock(12)}`)).toHaveTextContent("0");
  });

  it("shades the busiest half hour hotter than a quiet one", () => {
    renderDay();

    const busy = screen.getByTitle(`2 people on ${formatSlotBlock(3)}`);
    const quiet = screen.getByTitle(`1 person on ${formatSlotBlock(0)}`);
    const empty = screen.getByTitle(`0 people on ${formatSlotBlock(12)}`);

    expect(busy.className).toContain("bg-red-500");
    expect(quiet.className).toContain("bg-orange-300");
    expect(empty.className).toContain("bg-muted");
  });

  it("names a shift once an hour, not once a half hour", () => {
    renderDay();

    // Ann's 8–11 AM run is six half-hour cells but three labels, plus the one
    // on her single 9:30 expo cell. Bo comes in at 9:30, so his run is labelled
    // there and again at 10, 11 and noon.
    expect(screen.getAllByText("Ann")).toHaveLength(4);
    expect(screen.getAllByText("Bo")).toHaveLength(4);
  });

  it("lays the day out by position", () => {
    renderDay();

    expect(screen.getByText("Front of house 1")).toBeInTheDocument();
    expect(screen.getByText("Expo")).toBeInTheDocument();
    expect(screen.getByText("Line 5")).toBeInTheDocument();
    expect(screen.getByText("Cleaning")).toBeInTheDocument();
  });

  it("says nothing about hours on a day the store is closed", () => {
    render(
      <DayGrid
        day="sunday"
        date={new Date(2026, 7, 23)}
        schedule={buildDay()}
        employees={employees}
        off={[]}
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

describe("DayGrid time-off badges", () => {
  const off: DayOff[] = [
    { employee: employees[1], kind: "approved", reason: "Wedding" },
    { employee: employees[0], kind: "pending", reason: "" },
  ];

  it("names everybody who is off, in the day's header", () => {
    renderDay(off);

    const badges = screen.getByRole("list", { name: "Off on Monday" });
    expect(within(badges).getByText("Bo")).toBeInTheDocument();
    expect(within(badges).getByText("Ann")).toBeInTheDocument();
  });

  it("says which are accepted and which are still in review, not by colour alone", () => {
    renderDay(off);

    // Scoped to the header — both names are also written across their shifts.
    const badges = screen.getByRole("list", { name: "Off on Monday" });
    const badge = (name: string) => within(badges).getByText(name).closest("li")!;
    expect(within(badge("Bo")).getByText("— Accepted")).toBeInTheDocument();
    expect(within(badge("Ann")).getByText("— In review")).toBeInTheDocument();
    // The reason is there to be hovered, rather than taking up room in the bar.
    expect(badge("Bo")).toHaveAttribute("title", "Accepted — Wedding");
    expect(badge("Ann")).toHaveAttribute("title", "In review");
  });

  it("leaves the header alone on a day nobody is off", () => {
    renderDay();

    expect(screen.queryByRole("list", { name: "Off on Monday" })).toBeNull();
  });
});
