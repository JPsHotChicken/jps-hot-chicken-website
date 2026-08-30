import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StaffDashboard } from "@/components/staff/StaffDashboard";
import { makeEmptyWeek, type Employee } from "@/lib/schedule";
import { type PublishedTipRate } from "@/lib/tips";

// Everything the dashboard reaches for is a Server Action, none of which has
// any meaning in jsdom. Nothing here touches them: this is the one section that
// arrives with the page and needs no fetching at all.
vi.mock("@/app/staff/actions", () => ({
  staffLogout: vi.fn(),
  loadPublishedWeekAction: vi.fn(),
  myRequestsAction: vi.fn(),
  requestTimeOffAction: vi.fn(),
  scheduledDatesAction: vi.fn(),
}));

const EMPLOYEE: Employee = { id: "e1", name: "Alazia Vann", group: "night" };

const week = (
  periodStart: string,
  periodEnd: string,
  perHour: number,
): PublishedTipRate => ({ periodStart, periodEnd, perHour, publishedAt: `${periodEnd}T20:40:00Z` });

function dashboard(tipRates: PublishedTipRate[]) {
  return render(
    <StaffDashboard
      employee={EMPLOYEE}
      publishedWeeks={[]}
      initialWeekStart={null}
      initialWeek={makeEmptyWeek()}
      initialRequests={[]}
      initialScheduledDates={[]}
      scheduledRange={{ from: "2026-08-03", to: "2026-09-20" }}
      payStubs={[]}
      tipRates={tipRates}
    />,
  );
}

/** The rate on screen, as a number. */
const showing = () => Number(screen.getByText(/^\$\d/).textContent!.replace(/[$,]/g, ""));

describe("online tips", () => {
  it("opens on the most recent week the owner has sent out", () => {
    dashboard([
      week("2026-08-03", "2026-08-08", 6.5),
      week("2026-08-10", "2026-08-15", 8.07),
    ]);

    expect(showing()).toBeCloseTo(8.07, 2);
    expect(screen.getByText("Aug 10 – Aug 15, 2026")).toBeInTheDocument();
  });

  it("pages back through the weeks before it, and forward again", () => {
    dashboard([
      week("2026-08-03", "2026-08-08", 6.5),
      week("2026-08-10", "2026-08-15", 8.07),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Earlier week" }));
    expect(showing()).toBeCloseTo(6.5, 2);
    expect(screen.getByText("Aug 3 – Aug 8, 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Later week" }));
    expect(showing()).toBeCloseTo(8.07, 2);
  });

  it("stops at both ends of what has been sent", () => {
    dashboard([week("2026-08-10", "2026-08-15", 8.07)]);

    expect(screen.getByRole("button", { name: "Earlier week" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Later week" })).toBeDisabled();
  });

  it("says nothing has been worked out yet rather than showing a zero", () => {
    dashboard([]);

    expect(screen.getByText(/Once your manager works out/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Earlier week" })).not.toBeInTheDocument();
  });
});
