import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  POSITION_GROUPS,
  type RecurringTimeOff,
  type ShiftRole,
  type StaffShiftDay,
} from "@/lib/schedule";

const actions = vi.hoisted(() => ({
  addRecurringDayOffAction: vi.fn(),
  removeRecurringDayOffAction: vi.fn(),
  setRolePreferenceAction: vi.fn(),
  deleteTimeOffRequestAction: vi.fn(),
  myRequestsAction: vi.fn(),
  requestTimeOffAction: vi.fn(),
  updateTimeOffRequestAction: vi.fn(),
}));
vi.mock("@/app/staff/actions", () => actions);

import { MySchedulePage } from "@/components/staff/MySchedulePage";

// Wednesday Nov 18, 2026: this week is Nov 15–21, next week Nov 22–28.
const TODAY = "2026-11-18";

const shift = (date: string, start = 570, end = 1020): StaffShiftDay => ({
  date,
  shifts: [
    {
      start,
      end,
      role: date === "2026-11-19" ? { name: "Shift lead", color: "blue" } : null,
    },
  ],
});

const SHIFTS = [shift("2026-11-16"), shift("2026-11-19"), shift("2026-11-24", 960, 1320)];

const LEAD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROLES: ShiftRole[] = [
  { id: LEAD, name: "Shift lead", color: "blue" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Opener", color: "emerald" },
];

function page({
  roles = ROLES,
  recurring = [] as RecurringTimeOff[],
  onRecurringChange = vi.fn(),
  onPreferencesChange = vi.fn(),
} = {}) {
  render(
    <MySchedulePage
      todayISO={TODAY}
      shiftDays={SHIFTS}
      workDates={SHIFTS.map((entry) => entry.date)}
      timeOff={[
        {
          id: "r",
          employeeId: "e",
          startDate: "2026-11-27",
          endDate: "2026-11-27",
          reason: "Trip",
          status: "pending",
          requestedAt: "2026-11-01",
        },
      ]}
      recurring={recurring}
      onRecurringChange={onRecurringChange}
      preferences={[]}
      onPreferencesChange={onPreferencesChange}
      roles={roles}
    />,
  );
  return { onRecurringChange, onPreferencesChange };
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => vi.clearAllMocks());

describe("My schedule — two weeks", () => {
  it("shows this week and next as rings, with no list of days", () => {
    page();
    const thisWeek = within(screen.getByRole("list", { name: "This week" }));
    expect(thisWeek.getByRole("listitem", { name: "Monday Nov 16th, working" })).toBeInTheDocument();
    expect(thisWeek.getByRole("listitem", { name: "Wednesday Nov 18th, today, off" }))
      .toBeInTheDocument();
    const nextWeek = within(screen.getByRole("list", { name: "Next week" }));
    expect(nextWeek.getByRole("listitem", { name: "Friday Nov 27th, off, day off requested" }))
      .toBeInTheDocument();

    const weeks = within(screen.getByRole("heading", { name: "Your next two weeks" }).closest("section")!);
    expect(weeks.queryByText("9:30 AM – 5:00 PM")).not.toBeInTheDocument();
    expect(weeks.getByText("15 hours")).toBeInTheDocument();
  });

  it("opens a day's details — date, time and role, no position — when its circle is tapped", () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Details for Thursday Nov 19th" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("heading", { name: /Thursday, Nov 19th/ })).toBeInTheDocument();
    expect(dialog.getByText("9:30 AM – 5:00 PM")).toBeInTheDocument();
    expect(dialog.queryByText("Position")).not.toBeInTheDocument();
    expect(dialog.getByText("Shift lead")).toBeInTheDocument();

    fireEvent.click(dialog.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says when a day is off, and shows a request on it", () => {
    page();
    fireEvent.click(screen.getByRole("button", { name: "Details for Friday Nov 27th" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("You're not scheduled to work.")).toBeInTheDocument();
    expect(dialog.getByText(/Requested off/)).toBeInTheDocument();
    expect(dialog.getByText("Trip")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("rings a weekly day off in red on both weeks", () => {
    page({ recurring: [{ id: "x", employeeId: "e", day: "tuesday", reason: "Class" }] });
    expect(
      within(screen.getByRole("list", { name: "This week" })).getByRole("listitem", {
        name: "Tuesday Nov 17th, off, day off requested",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Next week" })).getByRole("listitem", {
        name: "Tuesday Nov 24th, working, day off requested",
      }),
    ).toBeInTheDocument();
  });
});

describe("Days off every week", () => {
  it("never offers Sunday, and only days not already taken", () => {
    page({ recurring: [{ id: "x", employeeId: "e", day: "tuesday", reason: "Class" }] });
    const options = within(screen.getByLabelText("Day"))
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([
      "Pick a day…",
      "Every Monday",
      "Every Wednesday",
      "Every Thursday",
      "Every Friday",
      "Every Saturday",
    ]);
  });

  it("adds one with just the day — no reason asked", async () => {
    const saved = [{ id: "n", employeeId: "e", day: "friday" as const, reason: "" }];
    actions.addRecurringDayOffAction.mockResolvedValue({ ok: true, recurring: saved });
    const { onRecurringChange } = page();

    const add = screen.getByRole("button", { name: "Add day off" });
    expect(add).toBeDisabled();
    expect(screen.queryByLabelText("Reason")).not.toBeInTheDocument();
    expect(screen.getByText("If needed, you can pick a day that you would like to have off every week.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Day"), { target: { value: "friday" } });
    fireEvent.click(add);

    await waitFor(() => expect(onRecurringChange).toHaveBeenCalledWith(saved));
    expect(actions.addRecurringDayOffAction).toHaveBeenCalledWith("friday");
  });

  it("removes one", async () => {
    actions.removeRecurringDayOffAction.mockResolvedValue([]);
    const { onRecurringChange } = page({
      recurring: [{ id: "x", employeeId: "e", day: "tuesday", reason: "Class" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove every Tuesday off" }));
    await waitFor(() => expect(onRecurringChange).toHaveBeenCalledWith([]));
  });
});

describe("Position preferences", () => {
  it("lists coming work days with the owner's roles to pick from — not the stations", () => {
    page();
    // Monday Nov 16 has gone; Thursday the 19th and Tuesday the 24th are left.
    expect(screen.queryByLabelText(/Preferred role on Mon, Nov 16th/)).not.toBeInTheDocument();
    const thursday = screen.getByLabelText("Preferred role on Thu, Nov 19th");
    const options = within(thursday).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["No preference", "Shift lead", "Opener"]);
    for (const group of POSITION_GROUPS) expect(options).not.toContain(group.label);
    expect(screen.getByLabelText("Preferred role on Tue, Nov 24th")).toBeInTheDocument();
  });

  it("says so when the owner hasn't made any roles", () => {
    page({ roles: [] });
    expect(screen.getByText("Your manager hasn't set up any roles yet.")).toBeInTheDocument();
  });

  it("saves a choice, and puts it back if refused", async () => {
    actions.setRolePreferenceAction.mockResolvedValue({
      ok: false,
      error: "You're not scheduled that day.",
    });
    const { onPreferencesChange } = page();
    fireEvent.change(screen.getByLabelText("Preferred role on Thu, Nov 19th"), {
      target: { value: LEAD },
    });
    expect(actions.setRolePreferenceAction).toHaveBeenCalledWith("2026-11-19", LEAD);
    expect(onPreferencesChange).toHaveBeenCalledWith([
      { employeeId: "", date: "2026-11-19", roleId: LEAD },
    ]);
    expect(await screen.findByRole("alert")).toHaveTextContent("not scheduled");
    expect(onPreferencesChange).toHaveBeenLastCalledWith([]);
  });
});
