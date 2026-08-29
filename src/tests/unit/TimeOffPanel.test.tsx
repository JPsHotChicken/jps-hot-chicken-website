import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimeOffPanel } from "@/components/admin/TimeOffPanel";
import type { DeletedTimeOffRequest, Employee, TimeOffRequest } from "@/lib/schedule";

const employees: Employee[] = [
  { id: "e1", name: "Ava", group: "morning" },
  { id: "e2", name: "Ben", group: "night" },
];

function request(overrides: Partial<TimeOffRequest> = {}): TimeOffRequest {
  return {
    id: "r1",
    employeeId: "e1",
    startDate: "2026-08-12",
    endDate: "2026-08-14",
    reason: "",
    status: "pending",
    requestedAt: "2026-08-01",
    ...overrides,
  };
}

function deleted(overrides: Partial<DeletedTimeOffRequest> = {}): DeletedTimeOffRequest {
  return { ...request(), deletedAt: "2026-08-20T15:40:00.000Z", ...overrides };
}

/** Render the panel, filling in whatever the test doesn't care about. */
function panel(props: Partial<React.ComponentProps<typeof TimeOffPanel>> = {}) {
  return render(
    <TimeOffPanel
      employees={employees}
      requests={[]}
      deletedRequests={[]}
      recurring={[]}
      weekStart="2026-08-10"
      onAddRequest={() => {}}
      onSetRequestStatus={() => {}}
      onRemoveRequest={() => {}}
      onRestoreRequest={() => {}}
      onAddRecurring={() => {}}
      onRemoveRecurring={() => {}}
      {...props}
    />,
  );
}

const show = () => screen.getByRole("button", { name: /show deleted requests/i });

describe("deleted requests", () => {
  it("offers nothing to open when nothing has been deleted", () => {
    panel({ requests: [request()] });
    expect(screen.queryByRole("button", { name: /deleted requests/i })).toBeNull();
  });

  it("keeps them out of the live list until the dropdown is opened", () => {
    panel({
      requests: [request({ id: "live", employeeId: "e2" })],
      deletedRequests: [deleted({ id: "gone", reason: "Wedding" })],
    });

    expect(screen.getByText("Ben")).toBeInTheDocument();
    expect(screen.queryByText("Ava")).toBeNull();
    expect(screen.queryByText("Wedding")).toBeNull();

    fireEvent.click(show());
    expect(screen.getByText("Ava")).toBeInTheDocument();
    expect(screen.getByText("Wedding")).toBeInTheDocument();
  });

  it("counts them on the button and says when each one went", () => {
    panel({ deletedRequests: [deleted({ id: "d1" }), deleted({ id: "d2", employeeId: "e2" })] });

    expect(show()).toHaveTextContent("Show deleted requests (2)");
    fireEvent.click(show());
    expect(screen.getAllByText(/^Deleted /)).toHaveLength(2);
    // Whatever the viewer's clock says, an older delete is dated rather than
    // being called "today".
    expect(screen.getAllByText(/^Deleted /)[0]).toHaveTextContent("Aug 20");
  });

  it("hands back the id of the request being undone", () => {
    const onRestoreRequest = vi.fn();
    panel({
      deletedRequests: [deleted({ id: "d1" }), deleted({ id: "d2", employeeId: "e2" })],
      onRestoreRequest,
    });

    fireEvent.click(show());
    fireEvent.click(within(screen.getByText("Ben").closest("li")!).getByRole("button"));
    expect(onRestoreRequest).toHaveBeenCalledExactlyOnceWith("d2");
  });

  it("shows the decision it was deleted with, and its dates", () => {
    panel({ deletedRequests: [deleted({ status: "approved" })] });

    fireEvent.click(show());
    const row = screen.getByText("Ava").closest("li")!;
    expect(row).toHaveTextContent("Accepted");
    expect(row).toHaveTextContent("Aug 12 – Aug 14, 2026");
    expect(row).toHaveTextContent("3 days");
  });

  it("folds the list away again", () => {
    panel({ deletedRequests: [deleted()] });

    fireEvent.click(show());
    expect(screen.getByText("Ava")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /hide deleted requests/i }));
    expect(screen.queryByText("Ava")).toBeNull();
  });
});
