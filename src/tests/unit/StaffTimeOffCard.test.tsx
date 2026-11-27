import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TimeOffRequest } from "@/lib/schedule";

const actions = vi.hoisted(() => ({
  deleteTimeOffRequestAction: vi.fn(),
  myRequestsAction: vi.fn(),
  requestTimeOffAction: vi.fn(),
  updateTimeOffRequestAction: vi.fn(),
}));
vi.mock("@/app/staff/actions", () => actions);

import { TimeOffCard } from "@/components/staff/TimeOffCard";

const request = (overrides: Partial<TimeOffRequest> = {}): TimeOffRequest => ({
  id: "11111111-1111-4111-8111-111111111111",
  employeeId: "e1",
  startDate: "2026-11-26",
  endDate: "2026-11-26",
  reason: "Family dinner",
  status: "pending",
  requestedAt: "2026-11-01",
  ...overrides,
});

function card(requests: TimeOffRequest[] = [], onRequestsChange = vi.fn()) {
  render(
    <TimeOffCard
      requests={requests}
      onRequestsChange={onRequestsChange}
      scheduledDates={["2026-11-24", "2026-11-25"]}
    />,
  );
  return onRequestsChange;
}

/** The calendar's button for a day — "Tuesday, November 24". */
const day = (name: RegExp) => screen.getByRole("button", { name });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Request time off card", () => {
  it("marks work days and requested days on the calendar", () => {
    card([request()]);
    expect(day(/^Tuesday, November 24, scheduled to work$/)).toBeInTheDocument();
    expect(day(/^Thursday, November 26, day off requested$/)).toBeInTheDocument();
  });

  it("asks for a day off from the popup, and needs a reason", async () => {
    const filed = request({ startDate: "2026-11-24", endDate: "2026-11-24", reason: "Dentist" });
    actions.requestTimeOffAction.mockResolvedValue(undefined);
    actions.myRequestsAction.mockResolvedValue([filed]);
    const onRequestsChange = card();

    fireEvent.click(day(/^Tuesday, November 24/));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("heading", { name: "Tuesday, Nov 24th" })).toBeInTheDocument();

    const send = dialog.getByRole("button", { name: "Request this day off" });
    expect(send).toBeDisabled();
    fireEvent.change(dialog.getByLabelText(/Reason/), { target: { value: "Dentist" } });
    fireEvent.click(send);

    await waitFor(() => expect(onRequestsChange).toHaveBeenCalledWith([filed]));
    expect(actions.requestTimeOffAction).toHaveBeenCalledWith({
      startDate: "2026-11-24",
      endDate: "2026-11-24",
      reason: "Dentist",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Request sent for Tuesday, Nov 24th");
  });

  it("shows a day's existing request instead of a new form, and can change its reason", async () => {
    actions.updateTimeOffRequestAction.mockResolvedValue({ ok: true });
    actions.myRequestsAction.mockResolvedValue([request({ reason: "Wedding" })]);
    const onRequestsChange = card([request()]);

    fireEvent.click(day(/^Thursday, November 26/));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.queryByRole("button", { name: "Request this day off" })).not.toBeInTheDocument();
    expect(dialog.getByText("Family dinner")).toBeInTheDocument();

    fireEvent.click(dialog.getByRole("button", { name: "Edit reason" }));
    fireEvent.change(dialog.getByLabelText(/Reason/), { target: { value: "Wedding" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onRequestsChange).toHaveBeenCalled());
    expect(actions.updateTimeOffRequestAction).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      { startDate: "2026-11-26", endDate: "2026-11-26", reason: "Wedding" },
    );
  });

  it("deletes a request from its popup, opened from the list", async () => {
    actions.deleteTimeOffRequestAction.mockResolvedValue({ ok: true });
    actions.myRequestsAction.mockResolvedValue([]);
    const onRequestsChange = card([request()]);

    fireEvent.click(screen.getByRole("button", { name: /Open your request for Nov 26/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onRequestsChange).toHaveBeenCalledWith([]));
    expect(actions.deleteTimeOffRequestAction).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("lets a declined day be asked for again", () => {
    card([request({ status: "denied" })]);
    fireEvent.click(day(/^Thursday, November 26/));
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Request this day off" }),
    ).toBeInTheDocument();
  });

  it("highlights the chosen day while its popup is open", () => {
    card();
    fireEvent.click(day(/^Tuesday, November 24/));
    expect(day(/^Tuesday, November 24/)).toHaveClass("bg-brand");
    expect(day(/^Wednesday, November 25/)).not.toHaveClass("bg-brand");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(day(/^Tuesday, November 24/)).not.toHaveClass("bg-brand");
  });

  it("closes with Escape", () => {
    card();
    fireEvent.click(day(/^Tuesday, November 24/));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes straight from the list", async () => {
    actions.deleteTimeOffRequestAction.mockResolvedValue({ ok: true });
    actions.myRequestsAction.mockResolvedValue([]);
    const onRequestsChange = card([request()]);

    fireEvent.click(screen.getByRole("button", { name: /Delete your request for Nov 26/ }));

    await waitFor(() => expect(onRequestsChange).toHaveBeenCalledWith([]));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("deleted");
  });

  it("opens straight into editing from the list's Edit button", () => {
    card([request()]);
    fireEvent.click(screen.getByRole("button", { name: /Edit your request for Nov 26/ }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByLabelText(/Reason/)).toHaveValue("Family dinner");
    expect(dialog.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("offers no edit or delete on a request that has ended", () => {
    card([request({ startDate: "2026-11-02", endDate: "2026-11-03" })]);
    expect(screen.queryByRole("button", { name: /Edit your request/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete your request/ })).not.toBeInTheDocument();
  });

  it("outlines today in blue", () => {
    card();
    expect(day(/^Saturday, November 21/).className).toContain("ring-blue-600");
  });
});
