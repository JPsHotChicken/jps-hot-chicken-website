import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  staffLogin: vi.fn(),
  staffVerifySetupCode: vi.fn(),
  staffCreatePassword: vi.fn(),
  staffLogout: vi.fn(),
  scheduledDatesAction: vi.fn().mockResolvedValue([]),
  myRequestsAction: vi.fn().mockResolvedValue([]),
  requestTimeOffAction: vi.fn(),
  updateTimeOffRequestAction: vi.fn(),
  deleteTimeOffRequestAction: vi.fn(),
  addRecurringDayOffAction: vi.fn(),
  removeRecurringDayOffAction: vi.fn(),
  setRolePreferenceAction: vi.fn(),
  signRulesSlideAction: vi.fn(),
}));
vi.mock("@/app/staff/actions", () => actions);

import { StaffDashboard } from "@/components/staff/StaffDashboard";

const TODAY = "2026-11-24"; // a Tuesday
const todayShifts = [{ start: 600, end: 960, role: { name: "Register", color: "blue" } }];
const shiftDays = [
  { date: TODAY, shifts: todayShifts },
  {
    date: "2026-11-26",
    shifts: [{ start: 660, end: 1140, role: { name: "Fry station", color: "orange" } }],
  },
];

function dashboard(payStubs = [
  {
    id: "stub-1",
    payDate: "2026-11-16",
    periodStart: "2026-11-09",
    periodEnd: "2026-11-15",
    amounts: { wages: 166.74, tips: 26.02, bonus: 0, hours: 13.2 },
  },
]) {
  return render(
    <StaffDashboard
      employee={{ id: "emp-1", name: "rissi", group: "morning" }}
      initialRequests={[]}
      initialScheduledDates={[TODAY, "2026-11-26"]}
      scheduledRange={{ from: "2026-11-01", to: "2026-12-31" }}
      payStubs={payStubs}
      ruleSignatures={[]}
      today={{ date: TODAY, closed: false, posted: true, shifts: todayShifts }}
      upcoming={shiftDays[1]}
      shiftDays={shiftDays}
    />,
  );
}

/** The tour's own card, as opposed to a popup it has opened. */
const card = () => within(screen.getByRole("dialog", { name: (_, el) => el.querySelector("#tour-title") !== null }));
const title = () => card().getByRole("heading").textContent;
const next = () => fireEvent.click(card().getByRole("button", { name: /^(Next|Show me|Let's go|Done)$/ }));

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T18:00:00Z`));
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the first-visit tour", () => {
  it("welcomes them by name, with no way to skip", () => {
    dashboard();
    expect(title()).toBe("Welcome, Rissi!");
    expect(card().queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();
    expect(card().queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("walks through home, My schedule and Pay Out, opening the real popups", () => {
    dashboard();
    next();
    expect(title()).toBe("Your station for today");
    next();
    expect(title()).toBe("Tap any day in your week");
    next();
    expect(title()).toBe("Your shift details");
    // Their next work day this week: today.
    expect(screen.getByRole("dialog", { name: /Tuesday, Nov 24th/ })).toHaveTextContent(
      "Register",
    );
    next();
    expect(title()).toBe("Everything else is in the Menu");
    expect(screen.queryByRole("dialog", { name: /Tuesday, Nov 24th/ })).not.toBeInTheDocument();

    next();
    expect(title()).toBe("Ask for a day off");
    expect(screen.getByRole("heading", { name: "Request time off" })).toBeInTheDocument();
    next();
    expect(title()).toBe("Tap a day");
    next();
    expect(title()).toBe("Give a reason and send it");
    // The real request popup, for the day after today; nothing is sent.
    expect(screen.getByRole("dialog", { name: /Wednesday, Nov 25th/ })).toBeInTheDocument();
    next();
    expect(title()).toBe("All your requests, in one list");
    expect(screen.queryByRole("dialog", { name: /Wednesday, Nov 25th/ })).not.toBeInTheDocument();
    next();
    expect(title()).toBe("A day off every week");
    expect(card().getByText("It's a request, not a guarantee.")).toBeInTheDocument();
    next();
    expect(title()).toBe("Pick the position you'd like");
    expect(card().getByText("It's a request, not a guarantee.")).toBeInTheDocument();

    next();
    expect(title()).toBe("What you earned, week by week");
    next();
    expect(title()).toBe("Tap a week");
    next();
    expect(title()).toBe("Wages and tips, split out");
    const week = screen.getByRole("dialog", { name: /Nov 9 – Nov 15, 2026/ });
    expect(week).toHaveTextContent("$166.74");
    expect(week).toHaveTextContent("$26.02");
    next();
    expect(title()).toBe("The whole check");
    expect(within(week).getByRole("link", { name: /See whole check/ })).toHaveAttribute(
      "href",
      "/staff/pay-stubs/stub-1",
    );

    next(); // Done
    expect(screen.queryByText("Welcome, Rissi!")).not.toBeInTheDocument();
    expect(actions.requestTimeOffAction).not.toHaveBeenCalled();
    // Back home, popups closed.
    expect(screen.getByRole("heading", { name: "Nov 24th" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is only seen once", () => {
    const { unmount } = dashboard();
    for (let step = 0; step < 15; step++) next();
    unmount();

    dashboard();
    expect(screen.queryByText("Welcome, Rissi!")).not.toBeInTheDocument();
  });

  it("explains Pay Out in one step before there are any checks", () => {
    dashboard([]);
    for (let step = 0; step < 11; step++) next();
    expect(title()).toBe("What you earned, week by week");
    expect(card().getByRole("button", { name: "Done" })).toBeInTheDocument();
  });
});
