import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TipsPayout } from "@/components/admin/TipsPayout";

// The page renders a sign-out form pointed at a Server Action, which has no
// meaning in jsdom.
vi.mock("@/app/admin/actions", () => ({ logout: vi.fn() }));

/** A trimmed-down copy of the real time clock export, quirks intact. */
const TIME_ENTRIES = [
  `Employee,Anomalies,Location,Job,Date,"Time In","Time Out","Auto Clock-out","Total Hours","Unpaid Break Time","Paid Break Time","Cash Tips Declared","Payable Hours"`,
  `"Basnet, Uddhipti",,"Trenton Road",Staff,"Aug 10, 2026","09:07 AM","08:09 PM",false,11.02,0.28,0.00,0.00,10.74`,
  `"Vann, Alazia ",,"Trenton Road",Staff,"Aug 10, 2026","09:59 AM","02:09 PM",false,4.16,0.00,0.00,0.00,4.16`,
  `"Vann, Alazia",,"Trenton Road",Staff,"Aug 11, 2026","02:25 PM","08:11 PM",false,5.78,0.00,0.00,0.00,5.78`,
  `"Testing, Example Staff","AUTO CLOCK-OUT","Trenton Road",Staff,"Aug 15, 2026","04:03 PM","04:00 AM",true,11.94,0.00,0.00,0.00,11.94`,
].join("\n");

const TIP_SUMMARY = ["Tips collected,Tips refunded,Total tips", "263.17,0.0,263.17"].join("\n");

/** Paste a report in and read it, the way the owner does. */
function importReport(csv: string) {
  fireEvent.change(screen.getByLabelText("…or paste it"), { target: { value: csv } });
  fireEvent.click(screen.getByRole("button", { name: "Read it" }));
}

/** The payout row for one person. */
const row = (name: string) => screen.getByText(name).closest("tr")!;

/** Read a money cell from the end of a person's row, as a number. */
function cell(name: string, fromEnd: number): number {
  const cells = within(row(name)).getAllByRole("cell");
  return Number(cells[cells.length - fromEnd].textContent!.replace(/[$,]/g, ""));
}

/** What a person's row says they are owed. */
const total = (name: string) => cell(name, 2);

/** Every bonus dollar on their row — the shared share plus their own. */
const bonuses = (name: string) => cell(name, 3);

beforeEach(() => {
  window.localStorage.clear();
});

describe("importing", () => {
  it("turns a time clock export into a payout, adding up each person's shifts", () => {
    render(<TipsPayout />);
    importReport(TIME_ENTRIES);

    expect(screen.getByText("Uddhipti Basnet")).toBeInTheDocument();

    // Both of Alazia's shifts, one of which had a trailing space on the name.
    const alazia = within(row("Alazia Vann"));
    expect(alazia.getByText("2 shifts")).toBeInTheDocument();
    expect(alazia.getByLabelText("Hours for Alazia Vann")).toHaveValue("9.94");
  });

  it("reads the tips total off a sales summary", () => {
    render(<TipsPayout />);
    importReport(TIP_SUMMARY);

    expect(screen.getByLabelText("Tips from the report")).toHaveValue("263.17");
    expect(screen.getByText("Tips set to $263.17")).toBeInTheDocument();
  });

  it("shows the clock's own warning against a shift that closed itself", () => {
    render(<TipsPayout />);
    importReport(TIME_ENTRIES);

    expect(within(row("Example Staff Testing")).getByText("auto clock-out")).toBeInTheDocument();
  });

  it("says so when the file is neither report", () => {
    render(<TipsPayout />);
    importReport("Item,Price\nChicken tenders,42.50");

    expect(screen.getByRole("alert")).toHaveTextContent(/neither a time clock export/i);
    expect(screen.getByText(/Nobody here yet/)).toBeInTheDocument();
  });
});

describe("splitting the money", () => {
  function loaded() {
    render(<TipsPayout />);
    importReport(TIME_ENTRIES);
    importReport(TIP_SUMMARY);
  }

  it("shares the tips out by the hour", () => {
    loaded();

    // 10.74 + 9.94 + 11.94 = 32.62 hours between the three of them.
    expect(screen.getByLabelText("Tips from the report")).toHaveValue("263.17");

    // The longest shift earns the most, and the whole pot goes out.
    expect(total("Uddhipti Basnet")).toBeCloseTo(86.65, 2);
    expect(total("Alazia Vann")).toBeCloseTo(80.19, 2);
    expect(total("Example Staff Testing")).toBeCloseTo(96.33, 2);
    expect(
      total("Uddhipti Basnet") + total("Alazia Vann") + total("Example Staff Testing"),
    ).toBeCloseTo(263.17, 2);
  });

  it("splits a bonus pool evenly, however long anyone was on", () => {
    loaded();
    fireEvent.change(screen.getByLabelText("Bonus pool"), { target: { value: "30" } });

    // $10 each on top of their hourly share, three ways.
    expect(total("Uddhipti Basnet")).toBeCloseTo(96.65, 2);
    expect(total("Alazia Vann")).toBeCloseTo(90.19, 2);
    expect(total("Example Staff Testing")).toBeCloseTo(106.33, 2);
  });

  it("counts an individual bonus in with the shared one, not with the tips", () => {
    loaded();
    fireEvent.change(screen.getByLabelText("Bonus pool"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Individual bonus for Alazia Vann"), {
      target: { value: "20" },
    });

    // Alazia's $10 of the shared pool and her own $20 read as $30 of bonuses.
    expect(bonuses("Alazia Vann")).toBeCloseTo(30, 2);
    expect(bonuses("Uddhipti Basnet")).toBeCloseTo(10, 2);

    // And the panel adds both pots of the owner's money into one figure. Found
    // by its breakdown, since "Bonuses" is also a column heading on the sheet.
    const figure = screen.getByText("$30.00 shared + $20.00 individual").closest("div")!;
    expect(figure).toHaveTextContent("$50.00");
  });

  it("gives an individual bonus to one person and nobody else", () => {
    loaded();
    fireEvent.change(screen.getByLabelText("Individual bonus for Alazia Vann"), {
      target: { value: "20" },
    });

    expect(total("Alazia Vann")).toBeCloseTo(100.19, 2);
    expect(total("Uddhipti Basnet")).toBeCloseTo(86.65, 2);
  });

  it("shares the test account's cut out among everyone else once it is unticked", () => {
    loaded();
    fireEvent.click(screen.getByLabelText("Pay Example Staff Testing"));

    // 10.74 + 9.94 = 20.68 hours now, and the same $263.17 across them.
    expect(total("Uddhipti Basnet")).toBeCloseTo(136.68, 2);
    expect(total("Alazia Vann")).toBeCloseTo(126.49, 2);
    expect(total("Uddhipti Basnet") + total("Alazia Vann")).toBeCloseTo(263.17, 2);
    expect(screen.getByText("2 people")).toBeInTheDocument();
  });

  it("re-splits everything when hours are corrected by hand", () => {
    loaded();
    fireEvent.change(screen.getByLabelText("Hours for Example Staff Testing"), {
      target: { value: "1" },
    });

    // 10.74 + 9.94 + 1 = 21.68 hours.
    expect(total("Example Staff Testing")).toBeCloseTo(12.14, 2);
    expect(total("Uddhipti Basnet")).toBeCloseTo(130.37, 2);
  });

  it("puts corrected hours back the way the clock had them", () => {
    loaded();
    const hours = screen.getByLabelText("Hours for Example Staff Testing");

    fireEvent.change(hours, { target: { value: "1" } });
    expect(hours).toHaveValue("1");

    fireEvent.click(screen.getByLabelText("Reset hours for Example Staff Testing"));
    expect(screen.getByLabelText("Hours for Example Staff Testing")).toHaveValue("11.94");
  });

  it("switches every un-edited row when the hours basis changes", () => {
    loaded();
    // Payable hours to start with: Uddhipti's 11.02 on the clock, less a break.
    expect(screen.getByLabelText("Hours for Uddhipti Basnet")).toHaveValue("10.74");

    fireEvent.click(screen.getByRole("button", { name: "Total hours" }));
    expect(screen.getByLabelText("Hours for Uddhipti Basnet")).toHaveValue("11.02");
  });

  it("warns when there is money it cannot hand out", () => {
    render(<TipsPayout />);
    importReport(TIP_SUMMARY);

    expect(screen.getByText(/\$263\.17 has nowhere to go/)).toHaveTextContent(/nobody is ticked/i);
  });
});

describe("editing the sheet", () => {
  it("adds somebody who never clocked in", () => {
    render(<TipsPayout />);
    importReport(TIME_ENTRIES);

    fireEvent.click(screen.getByRole("button", { name: "Add someone" }));
    fireEvent.change(screen.getByLabelText("Who wasn't on the clock export?"), {
      target: { value: "Jordan Godfrey" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(within(row("Jordan Godfrey")).getByText("Added by hand")).toBeInTheDocument();
    expect(screen.getByLabelText("Hours for Jordan Godfrey")).toHaveValue("0.00");
  });

  it("refuses to add the same person twice", () => {
    render(<TipsPayout />);
    importReport(TIME_ENTRIES);

    fireEvent.click(screen.getByRole("button", { name: "Add someone" }));
    fireEvent.change(screen.getByLabelText("Who wasn't on the clock export?"), {
      target: { value: "Alazia Vann" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Alazia Vann is already on the sheet.");
  });

  it("takes somebody off the sheet entirely", () => {
    render(<TipsPayout />);
    importReport(TIME_ENTRIES);
    fireEvent.click(screen.getByLabelText("Remove Example Staff Testing"));

    expect(screen.queryByText("Example Staff Testing")).not.toBeInTheDocument();
  });

  it("keeps hand-added people and everyone's bonuses across a re-import", () => {
    render(<TipsPayout />);
    importReport(TIME_ENTRIES);

    fireEvent.change(screen.getByLabelText("Individual bonus for Alazia Vann"), {
      target: { value: "15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add someone" }));
    fireEvent.change(screen.getByLabelText("Who wasn't on the clock export?"), {
      target: { value: "Jordan Godfrey" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    // The owner spots a mistake in the export, fixes it, and imports again.
    importReport(TIME_ENTRIES);

    expect(screen.getByLabelText("Individual bonus for Alazia Vann")).toHaveValue("15");
    expect(screen.getByText("Jordan Godfrey")).toBeInTheDocument();
  });
});

describe("the sheet between visits", () => {
  it("is still there after a refresh", () => {
    const { unmount } = render(<TipsPayout />);
    importReport(TIME_ENTRIES);
    importReport(TIP_SUMMARY);
    fireEvent.change(screen.getByLabelText("Notes about this payout"), {
      target: { value: "Paid out Sunday night" },
    });
    unmount();

    render(<TipsPayout />);
    expect(screen.getByText("Uddhipti Basnet")).toBeInTheDocument();
    expect(screen.getByLabelText("Tips from the report")).toHaveValue("263.17");
    expect(screen.getByLabelText("Notes about this payout")).toHaveValue("Paid out Sunday night");
  });

  it("starts clean rather than breaking on a draft it can't read", () => {
    window.localStorage.setItem("jps.tips.draft.v1", "{ this is not json");

    render(<TipsPayout />);
    expect(screen.getByText(/Nobody here yet/)).toBeInTheDocument();
  });
});
