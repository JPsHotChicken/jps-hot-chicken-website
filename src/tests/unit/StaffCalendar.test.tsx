import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TimeOffCalendar } from "@/components/staff/TimeOffCalendar";
import { calendarStart, toISODate, type TimeOffRequest } from "@/lib/schedule";

/** A Wednesday, so the week it belongs to is unambiguous. */
const TODAY = new Date(2026, 7, 19, 9, 0, 0);

function request(overrides: Partial<TimeOffRequest> = {}): TimeOffRequest {
  return {
    id: "r1",
    employeeId: "e1",
    startDate: "2026-08-24",
    endDate: "2026-08-24",
    reason: "",
    status: "pending",
    requestedAt: "2026-08-01",
    ...overrides,
  };
}

function calendar(props: Partial<React.ComponentProps<typeof TimeOffCalendar>> = {}) {
  return render(
    <TimeOffCalendar
      requests={[]}
      scheduledDates={[]}
      selection={null}
      onSelect={() => {}}
      {...props}
    />,
  );
}

/** The day cell for an ISO date, found by the label it announces itself with. */
function day(iso: string): HTMLElement {
  const date = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8)));
  const label = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  // Anchored at both ends, or "August 3" would also find "August 31"; anything
  // after the date is one of the marks the day carries.
  return screen.getByRole("button", { name: new RegExp(`^${label}(,|$)`) });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the window the calendar opens on", () => {
  it("starts two weeks before this one, so this week sits in the middle", () => {
    expect(toISODate(calendarStart(TODAY))).toBe("2026-08-03");
  });

  it("shows two weeks back and three weeks ahead, across the month's end", () => {
    calendar();
    // Aug 3 is the first day drawn, Sep 13 the last — six whole weeks.
    expect(day("2026-08-03")).toBeInTheDocument();
    expect(day("2026-09-13")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Sunday, September 20/ })).toBeNull();
  });

  it("names both months when the six rows straddle two of them", () => {
    calendar();
    expect(screen.getByText("Aug – Sep 2026")).toBeInTheDocument();
  });

  it("leaves days already gone unclickable", () => {
    calendar();
    expect(day("2026-08-18")).toBeDisabled();
    expect(day("2026-08-19")).toBeEnabled();
  });
});

describe("what the days are marked with", () => {
  it("says which days are worked and which were asked off", () => {
    calendar({
      scheduledDates: ["2026-08-20", "2026-08-21"],
      requests: [request({ startDate: "2026-08-24", endDate: "2026-08-25" })],
    });

    expect(day("2026-08-20")).toHaveAccessibleName(/scheduled to work/);
    expect(day("2026-08-21")).toHaveAccessibleName(/scheduled to work/);
    expect(day("2026-08-22")).not.toHaveAccessibleName(/scheduled to work/);

    // Both ends of the range are days off, and the day after it is not.
    expect(day("2026-08-24")).toHaveAccessibleName(/day off requested/);
    expect(day("2026-08-25")).toHaveAccessibleName(/day off requested/);
    expect(day("2026-08-26")).not.toHaveAccessibleName(/day off requested/);
  });

  it("marks a day that is both worked and asked off with both", () => {
    calendar({ scheduledDates: ["2026-08-24"], requests: [request()] });
    expect(day("2026-08-24")).toHaveAccessibleName(/scheduled to work, day off requested/);
  });

  it("leaves a declined request unmarked, because that day is worked", () => {
    calendar({ requests: [request({ status: "denied" })] });
    expect(day("2026-08-24")).not.toHaveAccessibleName(/day off requested/);
  });
});

describe("moving around", () => {
  it("switches whole months, then comes back to the current week", () => {
    calendar();

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("September 2026")).toBeInTheDocument();
    expect(day("2026-09-30")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByText("August 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByText("Aug – Sep 2026")).toBeInTheDocument();
    // Nothing to go back to while the current week is already showing.
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
  });

  it("asks for the shifts covering each span it lands on", () => {
    const onRangeChange = vi.fn();
    calendar({ onRangeChange });
    expect(onRangeChange).toHaveBeenCalledExactlyOnceWith("2026-08-03", "2026-09-13");

    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    // September 2026 starts on a Tuesday, so its grid opens on Aug 31.
    expect(onRangeChange).toHaveBeenLastCalledWith("2026-08-31", "2026-10-11");
    // Once per span and no more: asking on every render would never stop.
    expect(onRangeChange).toHaveBeenCalledTimes(2);
  });

  it("still takes a range of days off, a click at each end", () => {
    const onSelect = vi.fn();
    calendar({ onSelect });

    fireEvent.click(day("2026-08-24"));
    expect(onSelect).toHaveBeenLastCalledWith({ start: "2026-08-24", end: "2026-08-24" });

    fireEvent.click(day("2026-08-26"));
    expect(onSelect).toHaveBeenLastCalledWith({ start: "2026-08-24", end: "2026-08-26" });
  });

  it("takes a range picked backwards the same way", () => {
    const onSelect = vi.fn();
    calendar({ onSelect });

    fireEvent.click(day("2026-08-26"));
    fireEvent.click(day("2026-08-24"));
    expect(onSelect).toHaveBeenLastCalledWith({ start: "2026-08-24", end: "2026-08-26" });
  });
});
