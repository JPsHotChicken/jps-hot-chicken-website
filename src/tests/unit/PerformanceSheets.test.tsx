import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PerformanceSheets } from "@/components/admin/PerformanceSheets";
import { emptyMetric, type Metric, type PerformanceData } from "@/lib/performance";

// Both of these are Server Actions, which have no meaning in jsdom.
vi.mock("@/app/admin/actions", () => ({ logout: vi.fn() }));

/**
 * The Server Actions the page writes through, stubbed.
 *
 * `vi.hoisted` because `vi.mock` factories are lifted above everything else in
 * the file — a plain `const` declared up here would still be undefined by the
 * time the factory runs.
 */
const actions = vi.hoisted(() => ({
  addMetricAction: vi.fn(),
  updateMetricAction: vi.fn(),
  deleteMetricAction: vi.fn(async () => {}),
  setMetricArchivedAction: vi.fn(async () => {}),
  reorderMetricsAction: vi.fn(async () => {}),
  cloneToRoleAction: vi.fn(async () => {}),
  cloneToStationAction: vi.fn(async () => {}),
  addStationAction: vi.fn(async () => ({ id: "s9", name: "Salad bar", sortOrder: 9 })),
  renameStationAction: vi.fn(async () => {}),
  deleteStationAction: vi.fn(async () => {}),
  reorderStationsAction: vi.fn(async () => {}),
  updateEmployeeAction: vi.fn(async () => {}),
  setCertificationsAction: vi.fn(async () => {}),
  reloadPerformanceAction: vi.fn(),
}));

vi.mock("@/app/admin/performance/actions", () => actions);

let next = 0;
const metric = (over: Partial<Metric> = {}): Metric => ({
  ...emptyMetric(),
  id: `m${next}`,
  name: `Metric ${next}`,
  sortOrder: next++,
  ...over,
});

const data = (): PerformanceData => ({
  stations: [
    { id: "s1", name: "Line", sortOrder: 0 },
    { id: "s2", name: "Expo", sortOrder: 1 },
  ],
  employees: [
    {
      id: "e1",
      name: "Dana Whitfield",
      role: "crew",
      hireDate: "2024-03-11",
      active: true,
      stationIds: ["s1"],
    },
    {
      id: "e2",
      name: "Marcus Bell",
      role: "shift_lead",
      hireDate: null,
      active: true,
      stationIds: ["s1", "s2"],
    },
    {
      id: "e3",
      name: "Former Person",
      role: "crew",
      hireDate: null,
      active: false,
      stationIds: [],
    },
  ],
  metrics: [
    metric({
      name: "Order accuracy",
      category: "Quality",
      type: "percentage",
      direction: "higher",
      target: 98,
      weight: 3,
      roles: ["crew", "shift_lead"],
    }),
    metric({ name: "Hand-wash check", category: "Safety", type: "pass_fail", roles: ["crew"] }),
    metric({
      name: "Ticket time",
      category: "Speed",
      type: "duration",
      direction: "lower",
      target: 240,
      scope: "station",
      stationIds: ["s1"],
    }),
  ],
});

const openTab = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("the performance page", () => {
  it("opens on the print view with the active roster already picked", () => {
    render(<PerformanceSheets initial={data()} />);

    expect(screen.getByRole("button", { name: /Print 2 sheets/ })).toBeInTheDocument();
    // Anyone who has left is neither listed nor printed.
    expect(screen.queryByText("Former Person")).not.toBeInTheDocument();
  });

  it("previews the sheet each person would actually get", () => {
    render(<PerformanceSheets initial={data()} />);

    const preview = screen.getByRole("heading", { name: "Dana Whitfield" }).closest("article")!;
    expect(within(preview).getByText("Order accuracy")).toBeInTheDocument();
    expect(within(preview).getByText("Hand-wash check")).toBeInTheDocument();
    // The station metric belongs on the station's own sheet, not on hers.
    expect(within(preview).queryByText("Ticket time")).not.toBeInTheDocument();
    expect(within(preview).getByText(/Certified at 1 of 2 stations/)).toBeInTheDocument();
  });

  it("prints the bands beside each row, the way the paper will", () => {
    render(<PerformanceSheets initial={data()} />);

    const preview = screen.getByRole("heading", { name: "Dana Whitfield" }).closest("article")!;
    expect(within(preview).getByText("G ≥ 98% · A ≥ 88.2% · R below")).toBeInTheDocument();
  });

  it("follows the period selector", () => {
    render(<PerformanceSheets initial={data()} />);

    const preview = () => screen.getByRole("heading", { name: "Dana Whitfield" }).closest("article")!;
    expect(within(preview()).getByText("Mon")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Each sheet covers"), { target: { value: "monthly" } });
    expect(within(preview()).getByText("Wk 1")).toBeInTheDocument();
    expect(within(preview()).queryByText("Mon")).not.toBeInTheDocument();
  });

  it("adds and removes sheets as they are ticked", () => {
    render(<PerformanceSheets initial={data()} />);

    fireEvent.click(screen.getByRole("checkbox", { name: /Line/ }));
    expect(screen.getByRole("button", { name: /Print 3 sheets/ })).toBeInTheDocument();

    const preview = screen.getByRole("heading", { name: "Line" }).closest("article")!;
    expect(within(preview).getByText("Ticket time")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Dana Whitfield/ }));
    expect(screen.getByRole("button", { name: /Print 2 sheets/ })).toBeInTheDocument();
  });
});

describe("the metric library", () => {
  it("shows what each metric is and who it prints for", () => {
    render(<PerformanceSheets initial={data()} />);
    openTab("Metrics");

    const row = screen.getByText("Order accuracy").closest("li")!;
    expect(within(row).getByText(/G ≥ 98%/)).toBeInTheDocument();
    expect(within(row).getByText("Crew")).toBeInTheDocument();
    expect(within(row).getByText("Shift lead")).toBeInTheDocument();
    expect(within(row).getByText("weight 3")).toBeInTheDocument();
  });

  it("previews the printed row while the metric is being written", () => {
    render(<PerformanceSheets initial={data()} />);
    openTab("Metrics");
    fireEvent.click(screen.getByRole("button", { name: "New metric" }));

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Upsell rate" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "percentage" } });
    fireEvent.change(screen.getByLabelText("Target"), { target: { value: "30" } });

    expect(screen.getByText("G ≥ 30% · A ≥ 27% · R below")).toBeInTheDocument();
  });

  /** A window time is written `3:00` on every report it comes off. */
  it("takes a duration target typed as minutes and seconds", () => {
    render(<PerformanceSheets initial={data()} />);
    openTab("Metrics");
    fireEvent.click(screen.getByRole("button", { name: "New metric" }));

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Window time" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "duration" } });
    fireEvent.change(screen.getByLabelText("Goal"), { target: { value: "lower" } });
    fireEvent.change(screen.getByLabelText("Target (m:ss)"), { target: { value: "3:00" } });

    expect(screen.getByText(/G ≤ 3:00/)).toBeInTheDocument();
  });

  it("will not save a metric nobody is measured on", () => {
    render(<PerformanceSheets initial={data()} />);
    openTab("Metrics");
    fireEvent.click(screen.getByRole("button", { name: "New metric" }));

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Orphan" } });
    fireEvent.click(screen.getByRole("button", { name: "Save metric" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Pick at least one role");
    expect(actions.addMetricAction).not.toHaveBeenCalled();
  });

  it("saves a finished metric and puts it on the sheet", async () => {
    actions.addMetricAction.mockResolvedValueOnce(
      metric({ name: "Upsell rate", category: "Service", roles: ["crew"] }),
    );

    render(<PerformanceSheets initial={data()} />);
    openTab("Metrics");
    fireEvent.click(screen.getByRole("button", { name: "New metric" }));

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Upsell rate" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Crew" }));
    fireEvent.click(screen.getByRole("button", { name: "Save metric" }));

    expect(await screen.findAllByText("Upsell rate")).not.toHaveLength(0);
    expect(actions.addMetricAction).toHaveBeenCalledOnce();

    openTab("Print sheets");
    const preview = screen.getByRole("heading", { name: "Dana Whitfield" }).closest("article")!;
    expect(within(preview).getByText("Upsell rate")).toBeInTheDocument();
  });

  it("counts only the metrics a clone would actually move", () => {
    render(<PerformanceSheets initial={data()} />);
    openTab("Metrics");

    // Crew's two individual metrics; the shift lead already has one of them.
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "crew" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "shift_lead" } });
    expect(screen.getByRole("button", { name: "Copy 1 metric" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("To"), { target: { value: "crew" } });
    expect(screen.getByRole("button", { name: "Nothing to copy" })).toBeDisabled();
  });

  it("keeps an archived metric off the sheets", () => {
    // Held onto rather than written out: ids come from a counter shared with
    // every other fixture in the file, so a literal here would depend on how
    // many tests ran before this one.
    const initial = data();
    render(<PerformanceSheets initial={initial} />);
    openTab("Metrics");
    fireEvent.click(screen.getByRole("button", { name: "Archive Hand-wash check" }));

    expect(actions.setMetricArchivedAction).toHaveBeenCalledWith(initial.metrics[1].id, true);

    openTab("Print sheets");
    const preview = screen.getByRole("heading", { name: "Dana Whitfield" }).closest("article")!;
    expect(within(preview).queryByText("Hand-wash check")).not.toBeInTheDocument();
  });
});

describe("the roster", () => {
  it("shows the cross-training index and updates it on a tick", () => {
    render(<PerformanceSheets initial={data()} />);
    openTab("Roster");

    const card = screen.getByText("Dana Whitfield").closest("li")!;
    expect(within(card).getByText(/Certified at 1 of 2 · 50%/)).toBeInTheDocument();

    fireEvent.click(within(card).getByRole("button", { name: "Stations" }));
    fireEvent.click(within(card).getByRole("checkbox", { name: "Expo" }));

    expect(actions.setCertificationsAction).toHaveBeenCalledWith("e1", ["s1", "s2"]);
    expect(within(card).getByText(/Certified at 2 of 2 · 100%/)).toBeInTheDocument();
  });

  it("marks somebody inactive rather than deleting them", () => {
    render(<PerformanceSheets initial={data()} />);
    openTab("Roster");

    const card = screen.getByText("Dana Whitfield").closest("li")!;
    fireEvent.click(within(card).getByRole("checkbox", { name: "Active" }));

    expect(actions.updateEmployeeAction).toHaveBeenCalledWith("e1", {
      role: "crew",
      hireDate: "2024-03-11",
      active: false,
    });

    // And they drop off the print list, because they are not on shift.
    openTab("Print sheets");
    expect(screen.queryByRole("checkbox", { name: /Dana Whitfield/ })).not.toBeInTheDocument();
  });

  it("changes somebody's role and gives them that role's sheet", () => {
    render(<PerformanceSheets initial={data()} />);
    openTab("Roster");

    const card = screen.getByText("Marcus Bell").closest("li")!;
    expect(within(card).getByLabelText("Role")).toHaveValue("shift_lead");
  });
});

describe("stations", () => {
  it("says what a station carries before it is deleted", () => {
    render(<PerformanceSheets initial={data()} />);
    openTab("Stations");

    const row = screen.getByDisplayValue("Line").closest("li")!;
    expect(within(row).getByText("1 metric · 2 certified")).toBeInTheDocument();
  });
});
