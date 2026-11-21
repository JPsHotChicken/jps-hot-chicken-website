import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TimeOffRequest } from "@/lib/schedule";

const actions = vi.hoisted(() => ({
  deleteTimeOffRequestAction: vi.fn(),
  myRequestsAction: vi.fn(),
  requestTimeOffAction: vi.fn(),
  updateTimeOffRequestAction: vi.fn(),
}));
vi.mock("@/app/staff/actions", () => actions);

import { TimeOffPage } from "@/components/staff/TimeOffPage";

const request = (overrides: Partial<TimeOffRequest>): TimeOffRequest => ({
  id: "11111111-1111-4111-8111-111111111111",
  employeeId: "e1",
  startDate: "2026-12-10",
  endDate: "2026-12-12",
  reason: "Family trip",
  status: "approved",
  requestedAt: "2026-11-01",
  ...overrides,
});

function page(requests: TimeOffRequest[], onRequestsChange = vi.fn()) {
  render(
    <TimeOffPage requests={requests} onRequestsChange={onRequestsChange} scheduledDates={[]} />,
  );
  return onRequestsChange;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
  window.scrollTo = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Request Time Off", () => {
  it("lets a coming request be edited and sends the change", async () => {
    const changed = request({ reason: "Wedding", status: "pending" });
    actions.updateTimeOffRequestAction.mockResolvedValue({ ok: true });
    actions.myRequestsAction.mockResolvedValue([changed]);
    const onRequestsChange = page([request({})]);

    fireEvent.click(screen.getByRole("button", { name: /Edit your request for Dec 10/ }));
    const reason = screen.getByLabelText(/Reason/);
    expect(reason).toHaveValue("Family trip");

    fireEvent.change(reason, { target: { value: "Wedding" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onRequestsChange).toHaveBeenCalledWith([changed]));
    expect(actions.updateTimeOffRequestAction).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      { startDate: "2026-12-10", endDate: "2026-12-12", reason: "Wedding" },
    );
    expect(screen.getByRole("status")).toHaveTextContent("review it again");
  });

  it("deletes a request once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    actions.deleteTimeOffRequestAction.mockResolvedValue({ ok: true });
    actions.myRequestsAction.mockResolvedValue([]);
    const onRequestsChange = page([request({})]);

    fireEvent.click(screen.getByRole("button", { name: /Delete your request for Dec 10/ }));

    await waitFor(() => expect(onRequestsChange).toHaveBeenCalledWith([]));
    expect(actions.deleteTimeOffRequestAction).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("leaves a request alone when the delete isn't confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    page([request({})]);
    fireEvent.click(screen.getByRole("button", { name: /Delete your request for Dec 10/ }));
    expect(actions.deleteTimeOffRequestAction).not.toHaveBeenCalled();
  });

  it("offers no edit or delete on a request that has already ended", () => {
    page([request({ startDate: "2026-11-02", endDate: "2026-11-03" })]);
    expect(screen.queryByRole("button", { name: /Edit your request/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete your request/ })).not.toBeInTheDocument();
  });

  it("shows why a change was refused", async () => {
    actions.updateTimeOffRequestAction.mockResolvedValue({
      ok: false,
      error: "That request is in the past, so it can't be changed.",
    });
    page([request({})]);
    fireEvent.click(screen.getByRole("button", { name: /Edit your request for Dec 10/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("in the past");
  });
});
