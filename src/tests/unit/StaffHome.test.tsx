import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StaffHome } from "@/components/staff/StaffHome";
import { WEEKS_AHEAD, WEEKS_BACK } from "@/components/staff/WeekStrip";
import {
  type TimeOffStatus,
  formatOrdinalDate,
  rangesFromMinutes,
  restaurantTodayISO,
  sundayWeekOf,
} from "@/lib/schedule";

describe("formatOrdinalDate", () => {
  it.each([
    ["2026-11-01", "Nov 1st"],
    ["2026-11-02", "Nov 2nd"],
    ["2026-11-03", "Nov 3rd"],
    ["2026-11-11", "Nov 11th"],
    ["2026-11-12", "Nov 12th"],
    ["2026-11-22", "Nov 22nd"],
    ["2026-11-23", "Nov 23rd"],
    ["2026-12-31", "Dec 31st"],
  ])("%s reads %s", (iso, expected) => {
    expect(formatOrdinalDate(iso)).toBe(expected);
  });
});

describe("restaurantTodayISO", () => {
  it("is already tomorrow in UTC but still today in Tennessee", () => {
    // 11 PM Central on Nov 21 is 5 AM UTC on Nov 22.
    expect(restaurantTodayISO(new Date("2026-11-22T05:00:00Z"))).toBe("2026-11-21");
  });
});

describe("rangesFromMinutes", () => {
  it("merges half hours into shifts and ignores doubles", () => {
    expect(rangesFromMinutes([600, 630, 630, 660, 900, 930])).toEqual([
      { start: 600, end: 690 },
      { start: 900, end: 960 },
    ]);
  });
});

describe("StaffHome", () => {
  it("shows today's date, hours and role", () => {
    render(
      <StaffHome
        today={{
          date: "2026-11-22",
          closed: false,
          posted: true,
          shifts: [{ start: 570, end: 1020, role: { name: "Shift lead", color: "blue" } }],
        }}
        upcoming={{
          date: "2026-11-24",
          shifts: [{ start: 960, end: 1320, role: null }],
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Nov 22nd" })).toBeInTheDocument();
    expect(screen.getByText("9:30 AM – 5:00 PM")).toBeInTheDocument();
    expect(screen.getByText("Shift lead")).toBeInTheDocument();
    expect(screen.getByText("Tuesday, Nov 24th")).toBeInTheDocument();
    expect(screen.getByText("4:00 PM – 10:00 PM")).toBeInTheDocument();
    // A work day has no icon; the coffee is only for days off.
    expect(document.querySelector('[data-art="coffee"]')).not.toBeInTheDocument();
  });

  it("says when no role is assigned", () => {
    render(
      <StaffHome
        today={{
          date: "2026-11-22",
          closed: false,
          posted: true,
          shifts: [{ start: 570, end: 1020, role: null }],
        }}
        upcoming={null}
      />,
    );
    expect(screen.getByText("No role assigned")).toBeInTheDocument();
    expect(screen.getByText(/No upcoming shifts posted yet/)).toBeInTheDocument();
  });

  it("tells an off day apart from a week that isn't posted", () => {
    const { rerender } = render(
      <StaffHome
        today={{ date: "2026-11-21", closed: false, posted: true, shifts: [] }}
        upcoming={null}
      />,
    );
    expect(screen.getByText("You're off today")).toBeInTheDocument();
    // A day off gets the coffee by the window.
    expect(document.querySelector('[data-art="coffee"]')).toBeInTheDocument();

    rerender(
      <StaffHome
        today={{ date: "2026-11-21", closed: false, posted: false, shifts: [] }}
        upcoming={null}
      />,
    );
    expect(screen.getByText("Not posted yet")).toBeInTheDocument();
  });
});

describe("sundayWeekOf", () => {
  it("runs Sunday to Saturday around the given day", () => {
    // Nov 21, 2026 is a Saturday.
    expect(sundayWeekOf("2026-11-21")).toEqual([
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
    ]);
    // A Sunday starts its own week.
    expect(sundayWeekOf("2026-11-22")[0]).toBe("2026-11-22");
  });
});

describe("the week strip", () => {
  it("marks today, the days worked, and the days off", () => {
    render(
      <StaffHome
        today={{ date: "2026-11-18", closed: false, posted: true, shifts: [] }}
        upcoming={null}
        workDates={["2026-11-16", "2026-11-18", "2026-11-20", "2026-12-01"]}
      />,
    );
    const week = within(screen.getByRole("list", { name: "This week", hidden: true }));
    const days = week.getAllByRole("listitem", { hidden: true });
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveAccessibleName("Sunday Nov 15th, off");
    expect(days[1]).toHaveAccessibleName("Monday Nov 16th, working");
    expect(days[3]).toHaveAccessibleName("Wednesday Nov 18th, today, working");
    expect(days[3]).toHaveAttribute("aria-current", "date");
    expect(days[4]).toHaveAccessibleName("Thursday Nov 19th, off");
  });
});

describe("swiping between weeks", () => {
  const home = (onLoadDates?: (from: string, to: string) => void) =>
    render(
      <StaffHome
        today={{ date: "2026-11-18", closed: false, posted: true, shifts: [] }}
        upcoming={null}
        workDates={["2026-11-24"]}
        onLoadDates={onLoadDates}
      />,
    );

  it("opens on this week and steps with the arrows", () => {
    home();
    expect(screen.getByText("This week")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByText("Next week", { selector: "p" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(screen.getByText("Last week", { selector: "p" })).toBeInTheDocument();
  });

  it("shows next week's work days on next week's page", () => {
    const { container } = home();
    // Off-screen weeks are hidden from screen readers, so find the page directly.
    const next = container.querySelector<HTMLElement>('ol[aria-label="Next week"]');
    expect(next).not.toBeNull();
    expect(next!.querySelector('[aria-label="Tuesday Nov 24th, working"]')).not.toBeNull();
  });

  it("has a dot for every week it can reach, and stops at both ends", () => {
    home();
    const dots = screen.getAllByRole("button", { name: /^Show / });
    expect(dots).toHaveLength(WEEKS_BACK + 1 + WEEKS_AHEAD);

    fireEvent.click(dots[0]);
    expect(screen.getByRole("button", { name: "Previous week" })).toBeDisabled();
    fireEvent.click(dots[dots.length - 1]);
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
  });

  it("asks for the work days of every week it can show", () => {
    const onLoadDates = vi.fn();
    home(onLoadDates);
    // Three Sundays back from the week of Nov 15, through four Saturdays ahead.
    expect(onLoadDates).toHaveBeenCalledWith("2026-10-25", "2026-12-19");
  });
});

describe("requested days off in the week row", () => {
  it("rings a requested day in red, but not a declined one", () => {
    const request = (id: string, startDate: string, endDate: string, status: TimeOffStatus) => ({
      id,
      employeeId: "e1",
      startDate,
      endDate,
      reason: "Trip",
      status,
      requestedAt: "2026-11-01",
    });
    render(
      <StaffHome
        today={{ date: "2026-11-18", closed: false, posted: true, shifts: [] }}
        upcoming={null}
        workDates={["2026-11-16", "2026-11-20"]}
        timeOff={[
          request("a", "2026-11-19", "2026-11-20", "pending"),
          request("b", "2026-11-21", "2026-11-21", "denied"),
        ]}
      />,
    );
    const week = within(screen.getByRole("list", { name: "This week", hidden: true }));
    expect(week.getByRole("listitem", { name: "Thursday Nov 19th, off, day off requested", hidden: true }))
      .toBeInTheDocument();
    expect(week.getByRole("listitem", { name: "Friday Nov 20th, working, day off requested", hidden: true }))
      .toBeInTheDocument();
    expect(week.getByRole("listitem", { name: "Saturday Nov 21st, off", hidden: true }))
      .toBeInTheDocument();
    expect(screen.getByText("Requested off")).toBeInTheDocument();
  });
});

describe("the Menu reminder", () => {
  it("opens the Menu", () => {
    const onOpenMenu = vi.fn();
    render(
      <StaffHome
        today={{ date: "2026-11-18", closed: false, posted: true, shifts: [] }}
        upcoming={null}
        onOpenMenu={onOpenMenu}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /more: tap Menu/ }));
    expect(onOpenMenu).toHaveBeenCalled();
  });
});

describe("tapping a day in the week strip", () => {
  const today = { date: "2026-11-22", closed: false, posted: true, shifts: [] };

  it("opens that day's hours and role", () => {
    render(
      <StaffHome
        today={today}
        upcoming={null}
        workDates={["2026-11-25"]}
        shiftDays={[
          {
            date: "2026-11-25",
            shifts: [{ start: 660, end: 1140, role: { name: "Fry station", color: "orange" } }],
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Details for Wednesday Nov 25th" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("11:00 AM – 7:00 PM")).toBeInTheDocument();
    expect(within(dialog).getByText("Fry station")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says so on a day they're off", () => {
    render(<StaffHome today={today} upcoming={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Details for Monday Nov 23rd" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("You're not scheduled to work.");
  });
});
