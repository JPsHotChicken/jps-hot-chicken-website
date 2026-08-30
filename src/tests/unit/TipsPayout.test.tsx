import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TipsPayout } from "@/components/admin/TipsPayout";
import { roundRate, type PublishedTipRate } from "@/lib/tips";

// The page renders a sign-out form pointed at a Server Action, which has no
// meaning in jsdom.
vi.mock("@/app/admin/actions", () => ({ logout: vi.fn() }));

/**
 * Go live talks to the database through two Server Actions. Standing in for
 * them keeps the sheet's arithmetic testable without one, which is also how the
 * page behaves in the restaurant on a day Supabase is down.
 */
const staffSee = vi.hoisted(() => ({
  /** What staff can already see, as the page finds it on the way in. */
  current: null as PublishedTipRate | null,
  read: vi.fn(),
  send: vi.fn(),
}));

vi.mock("@/app/admin/tips/actions", () => ({
  publishedTipRateAction: (periodStart: string) => staffSee.read(periodStart),
  publishTipRateAction: (input: { periodStart: string; periodEnd: string; perHour: number }) =>
    staffSee.send(input),
}));

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
  staffSee.current = null;
  staffSee.read.mockReset().mockImplementation(async () => staffSee.current);
  staffSee.send.mockReset().mockImplementation(async (input) => {
    staffSee.current = { ...input, perHour: roundRate(input.perHour), publishedAt: NOW };
    return staffSee.current;
  });
});

/** A fixed moment for anything the button stamps, so it reads the same twice. */
const NOW = "2026-08-16T20:40:00.000Z";

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

describe("hourly wages", () => {
  it("is a blank field on every row, wherever the person came from", () => {
    render(<TipsPayout />);
    importReport(TIME_ENTRIES);

    // Nothing on either export sets one — not even the payroll file's own rate
    // column, which is read for hours and nothing else.
    expect(screen.getByLabelText("Hourly wage for Alazia Vann")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Add someone" }));
    fireEvent.change(screen.getByLabelText("Who wasn't on the clock export?"), {
      target: { value: "Jordan Godfrey" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByLabelText("Hourly wage for Jordan Godfrey")).toHaveValue("");
  });

  it("takes a wage without moving anybody's share of the tips", () => {
    render(<TipsPayout />);
    importReport(TIME_ENTRIES);
    importReport(TIP_SUMMARY);

    const before = total("Alazia Vann");
    fireEvent.change(screen.getByLabelText("Hourly wage for Alazia Vann"), {
      target: { value: "15.50" },
    });

    expect(screen.getByLabelText("Hourly wage for Alazia Vann")).toHaveValue("15.50");
    // A wage is what the payout costs the business, not a claim on the pot.
    expect(total("Alazia Vann")).toBeCloseTo(before, 2);
    expect(total("Uddhipti Basnet")).toBeCloseTo(86.65, 2);
  });

  it("keeps wages across a re-import, since they are the same next week", () => {
    render(<TipsPayout />);
    importReport(TIME_ENTRIES);
    fireEvent.change(screen.getByLabelText("Hourly wage for Alazia Vann"), {
      target: { value: "15.50" },
    });

    importReport(TIME_ENTRIES);

    expect(screen.getByLabelText("Hourly wage for Alazia Vann")).toHaveValue("15.50");
  });

  it("keeps wages across a refresh", () => {
    const { unmount } = render(<TipsPayout />);
    importReport(TIME_ENTRIES);
    fireEvent.change(screen.getByLabelText("Hourly wage for Alazia Vann"), {
      target: { value: "15.50" },
    });
    unmount();

    render(<TipsPayout />);
    expect(screen.getByLabelText("Hourly wage for Alazia Vann")).toHaveValue("15.50");
  });

  it("opens a draft saved before the sheet had wages on it", () => {
    // Left open over the change, this draft's rows carry no wage at all. The
    // field has to come back editable rather than stuck as an uncontrolled box.
    window.localStorage.setItem(
      "jps.tips.draft.v1",
      JSON.stringify({
        people: [
          {
            id: "alazia vann",
            name: "Alazia Vann",
            totalHours: 9.94,
            payableHours: 9.94,
            shifts: 2,
            anomalies: [],
          },
        ],
        rows: { "alazia vann": { included: true, hours: null, extra: "" } },
        tips: "263.17",
        bonus: "",
        basis: "payable",
        note: "",
        from: null,
        to: null,
      }),
    );

    render(<TipsPayout />);
    const wage = screen.getByLabelText("Hourly wage for Alazia Vann");
    expect(wage).toHaveValue("");

    fireEvent.change(wage, { target: { value: "15.50" } });
    expect(screen.getByLabelText("Hourly wage for Alazia Vann")).toHaveValue("15.50");
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

describe("sending the rate to staff", () => {
  const goLive = () => screen.getByRole("button", { name: /Go live|Update|Live|Sending/ });

  /** The whole week, as it stands the moment before the button is pressed. */
  async function ready() {
    render(<TipsPayout />);
    importReport(TIME_ENTRIES);
    importReport(TIP_SUMMARY);
    // The page asks what staff can see as soon as the export gives it dates.
    await waitFor(() => expect(staffSee.read).toHaveBeenCalledWith("2026-08-10"));
  }

  it("has nothing to send before a report has been read", () => {
    render(<TipsPayout />);
    expect(goLive()).toBeDisabled();
  });

  it("still has nothing to send with hours but no tips", () => {
    render(<TipsPayout />);
    importReport(TIME_ENTRIES);

    expect(goLive()).toBeDisabled();
  });

  it("sends the hourly rate and the days it covers, and nothing else", async () => {
    await ready();
    await act(async () => {
      fireEvent.click(goLive());
    });

    expect(staffSee.send).toHaveBeenCalledTimes(1);
    const sent = staffSee.send.mock.calls[0][0];
    expect(sent.periodStart).toBe("2026-08-10");
    expect(sent.periodEnd).toBe("2026-08-15");
    // $263.17 across the 32.62 hours the three of them worked.
    expect(sent.perHour).toBeCloseTo(263.17 / 32.62, 6);

    // Nobody's name, hours or wage goes with it.
    expect(Object.keys(sent).sort()).toEqual(["perHour", "periodEnd", "periodStart"]);
  });

  it("says so once the week is live, and won't send the same figure twice", async () => {
    await ready();
    await act(async () => {
      fireEvent.click(goLive());
    });

    expect(screen.getByRole("button", { name: "Live" })).toBeDisabled();
    expect(screen.getByText(/Live · sent/)).toBeInTheDocument();
  });

  it("offers to update a week whose figures have moved since it went out", async () => {
    await ready();
    await act(async () => {
      fireEvent.click(goLive());
    });

    // The test account should never have been in the split.
    fireEvent.click(screen.getByLabelText("Pay Example Staff Testing"));

    expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();
    expect(screen.getByText("Staff see $8.07/hr")).toBeInTheDocument();
  });

  it("opens on what staff can already see, from whichever browser sent it", async () => {
    staffSee.current = {
      periodStart: "2026-08-10",
      periodEnd: "2026-08-15",
      perHour: roundRate(263.17 / 32.62),
      publishedAt: NOW,
    };

    await ready();

    await waitFor(() => expect(screen.getByRole("button", { name: "Live" })).toBeInTheDocument());
    expect(staffSee.send).not.toHaveBeenCalled();
  });

  it("keeps the sheet when the rate can't be sent", async () => {
    staffSee.send.mockRejectedValueOnce(new Error("Not signed in."));
    await ready();
    await act(async () => {
      fireEvent.click(goLive());
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Not signed in.");
    expect(screen.getByRole("button", { name: "Go live" })).toBeEnabled();
    expect(total("Uddhipti Basnet")).toBeCloseTo(86.65, 2);
  });
});
