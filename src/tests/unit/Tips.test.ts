import { describe, expect, it } from "vitest";

import {
  allocate,
  clampHours,
  clampMoney,
  computePayout,
  detectTipsImport,
  displayName,
  formatPeriod,
  hoursOf,
  parseEntryDate,
  parseTimeEntries,
  parseTipSummary,
  payoutFilename,
  toPayoutCsv,
  type PayoutEntry,
  type TipsPerson,
} from "@/lib/tips";

/** A cut-down time clock export, in the shape the real one arrives in. */
const TIME_ENTRIES = [
  `Employee,Anomalies,Location,Job,Date,"Time In","Time Out","Auto Clock-out","Total Hours","Unpaid Break Time","Paid Break Time","Cash Tips Declared","Payable Hours"`,
  `"Basnet, Uddhipti",,"Trenton Road",Staff,"Aug 10, 2026","09:07 AM","08:09 PM",false,11.02,0.28,0.00,0.00,10.74`,
  `"Vann, Alazia ",,"Trenton Road",Staff,"Aug 10, 2026","09:59 AM","02:09 PM",false,4.16,0.00,0.00,0.00,4.16`,
  `"Vann, Alazia",,"Trenton Road",Staff,"Aug 10, 2026","02:25 PM","08:11 PM",false,5.78,0.00,0.00,0.00,5.78`,
  `"Testing, Example Staff","AUTO CLOCK-OUT","Trenton Road",Staff,"Aug 15, 2026","04:03 PM","04:00 AM",true,11.94,0.00,0.00,0.00,11.94`,
].join("\n");

const TIP_SUMMARY = ["Tips collected,Tips refunded,Total tips", "263.17,0.0,263.17"].join("\n");

function person(overrides: Partial<TipsPerson> = {}): TipsPerson {
  return {
    id: "sam smith",
    name: "Sam Smith",
    totalHours: 10,
    payableHours: 9.5,
    shifts: 2,
    anomalies: [],
    ...overrides,
  };
}

function entry(overrides: Partial<PayoutEntry> = {}): PayoutEntry {
  return { id: "sam smith", hours: 10, included: true, extra: 0, ...overrides };
}

describe("names", () => {
  it("reads a clock's Last, First back the way a person writes it", () => {
    expect(displayName("Basnet, Uddhipti")).toBe("Uddhipti Basnet");
    // The real export has trailing spaces on some rows.
    expect(displayName("Vann, Alazia ")).toBe("Alazia Vann");
    expect(displayName("  Godfrey ,  Jordan ")).toBe("Jordan Godfrey");
  });

  it("leaves a name that isn't in that form alone", () => {
    expect(displayName("Jordan Godfrey")).toBe("Jordan Godfrey");
    expect(displayName("Cher")).toBe("Cher");
    expect(displayName("Smith,")).toBe("Smith");
    expect(displayName(", Jordan")).toBe("Jordan");
  });
});

describe("allocate", () => {
  it("hands out every cent of the pool", () => {
    const shares = allocate(263.17, [10.74, 5.94, 5.8, 4.16]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(263.17, 10);
  });

  it("splits a pot that doesn't divide evenly without losing a penny", () => {
    // $100 three ways is $33.33 each with a cent left over.
    const shares = allocate(100, [1, 1, 1]);
    expect(shares).toEqual([33.34, 33.33, 33.33]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(100, 10);
  });

  it("pays by weight, so twice the hours is twice the money", () => {
    expect(allocate(90, [2, 1])).toEqual([60, 30]);
  });

  it("gives the spare cents to the biggest earners", () => {
    const shares = allocate(10, [3, 1, 1]);
    expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(10, 10);
    expect(shares[0]).toBeGreaterThan(shares[1]);
  });

  it("keeps the money rather than dividing by nothing", () => {
    expect(allocate(50, [])).toEqual([]);
    expect(allocate(50, [0, 0])).toEqual([0, 0]);
    expect(allocate(0, [1, 1])).toEqual([0, 0]);
    expect(allocate(-5, [1, 1])).toEqual([0, 0]);
  });
});

describe("payout", () => {
  it("shares tips by the hour and the bonus pool evenly", () => {
    const payout = computePayout(
      [entry({ id: "a", hours: 10 }), entry({ id: "b", hours: 5 })],
      { tips: 300, bonus: 100 },
    );

    // Tips follow hours 2:1; the bonus is 50/50 however long they were on.
    expect(payout.shares[0].tipShare).toBe(200);
    expect(payout.shares[1].tipShare).toBe(100);
    expect(payout.shares[0].bonusShare).toBe(50);
    expect(payout.shares[1].bonusShare).toBe(50);

    expect(payout.shares[0].total).toBe(250);
    expect(payout.shares[1].total).toBe(150);
    expect(payout.total).toBe(400);
    expect(payout.unallocated).toBe(0);
    expect(payout.perHour).toBeCloseTo(20, 10);
    expect(payout.perPerson).toBe(50);
  });

  it("counts an individual bonus as a bonus, not as tips", () => {
    const payout = computePayout(
      [entry({ id: "a", hours: 10, extra: 25 }), entry({ id: "b", hours: 10 })],
      { tips: 100, bonus: 60 },
    );

    // Ann has $30 of the shared pool and $25 of her own.
    expect(payout.shares[0].bonuses).toBe(55);
    expect(payout.shares[1].bonuses).toBe(30);

    // Both pots of the owner's money are one figure; the guests' tips are not
    // touched by any of it.
    expect(payout.bonus).toBe(60);
    expect(payout.extras).toBe(25);
    expect(payout.bonuses).toBe(85);
    expect(payout.tips).toBe(100);
    expect(payout.total).toBe(185);
  });

  it("leaves bonuses equal to the pool when nobody has an individual one", () => {
    const payout = computePayout([entry({ id: "a" }), entry({ id: "b" })], {
      tips: 100,
      bonus: 40,
    });

    expect(payout.extras).toBe(0);
    expect(payout.bonuses).toBe(40);
    expect(payout.shares[0].bonuses).toBe(20);
  });

  it("keeps an unticked person's bonuses at nothing", () => {
    const payout = computePayout([entry({ id: "a" }), entry({ id: "b", included: false, extra: 50 })], {
      tips: 100,
      bonus: 40,
    });

    expect(payout.shares[1].bonuses).toBe(0);
    expect(payout.bonuses).toBe(40);
  });

  it("adds an individual bonus on top without diluting anyone else", () => {
    const payout = computePayout(
      [entry({ id: "a", hours: 10, extra: 25 }), entry({ id: "b", hours: 10 })],
      { tips: 100, bonus: 0 },
    );

    expect(payout.shares[0].tipShare).toBe(50);
    expect(payout.shares[1].tipShare).toBe(50);
    expect(payout.shares[0].total).toBe(75);
    expect(payout.shares[1].total).toBe(50);
    expect(payout.extras).toBe(25);
    expect(payout.total).toBe(125);
  });

  it("pays nothing at all to someone who is unticked", () => {
    const payout = computePayout(
      [entry({ id: "a", hours: 10 }), entry({ id: "b", hours: 10, included: false, extra: 40 })],
      { tips: 100, bonus: 60 },
    );

    expect(payout.shares[1]).toMatchObject({ tipShare: 0, bonusShare: 0, extra: 0, total: 0 });
    // Everything goes to the one person left, and their bonus isn't counted.
    expect(payout.shares[0].total).toBe(160);
    expect(payout.people).toBe(1);
    expect(payout.total).toBe(160);
  });

  it("says so when there is money it cannot hand out", () => {
    const nobody = computePayout([entry({ included: false })], { tips: 200, bonus: 50 });
    expect(nobody.unallocated).toBe(250);
    expect(nobody.total).toBe(0);

    // Somebody is on the sheet, but with no hours behind them the tips can't be
    // split by hour — the bonus pool still can.
    const noHours = computePayout([entry({ hours: 0 })], { tips: 200, bonus: 50 });
    expect(noHours.shares[0].bonusShare).toBe(50);
    expect(noHours.unallocated).toBe(200);
  });

  it("adds up to the pools exactly, however awkward the hours", () => {
    const payout = computePayout(
      [
        entry({ id: "a", hours: 10.74 }),
        entry({ id: "b", hours: 5.94 }),
        entry({ id: "c", hours: 5.8 }),
        entry({ id: "d", hours: 4.16 }),
        entry({ id: "e", hours: 6.96 }),
        entry({ id: "f", hours: 7.21 }),
        entry({ id: "g", hours: 6.74 }),
      ],
      { tips: 263.17, bonus: 40 },
    );

    const paid = payout.shares.reduce((sum, share) => sum + share.total, 0);
    expect(paid).toBeCloseTo(303.17, 10);
    expect(payout.total).toBe(303.17);
    expect(payout.unallocated).toBe(0);
  });

  it("keeps hand-typed figures inside sane bounds", () => {
    expect(clampMoney(-10)).toBe(0);
    expect(clampMoney(1e9)).toBe(100_000);
    expect(clampMoney(Number.NaN)).toBe(0);
    expect(clampHours(-4)).toBe(0);
    expect(clampHours(10_000)).toBe(400);
  });
});

describe("reading a time clock export", () => {
  const result = parseTimeEntries(TIME_ENTRIES);

  it("makes one row per person, with their shifts added up", () => {
    expect(result.people).toHaveLength(3);

    const alazia = result.people.find((one) => one.name === "Alazia Vann");
    // Two shifts, one of them with a trailing space on the name.
    expect(alazia?.shifts).toBe(2);
    expect(alazia?.totalHours).toBe(9.94);
    expect(alazia?.payableHours).toBe(9.94);
  });

  it("keeps both hours columns so the basis can be switched", () => {
    const uddhipti = result.people.find((one) => one.name === "Uddhipti Basnet");
    expect(uddhipti?.totalHours).toBe(11.02);
    expect(uddhipti?.payableHours).toBe(10.74);
    expect(hoursOf(uddhipti!, "total")).toBe(11.02);
    expect(hoursOf(uddhipti!, "payable")).toBe(10.74);
  });

  it("carries the clock's anomalies through, so a bad shift is visible", () => {
    const test = result.people.find((one) => one.name === "Example Staff Testing");
    expect(test?.anomalies).toEqual(["AUTO CLOCK-OUT"]);
  });

  it("works out the period the file covers", () => {
    expect(result.from).toBe("2026-08-10");
    expect(result.to).toBe("2026-08-15");
  });

  it("sorts people by name", () => {
    expect(result.people.map((one) => one.name)).toEqual([
      "Alazia Vann",
      "Example Staff Testing",
      "Uddhipti Basnet",
    ]);
  });

  it("skips rows with no name or no hours instead of inventing people", () => {
    const withGaps = parseTimeEntries(
      ["Employee,Total Hours,Payable Hours", ",5.00,5.00", '"Doe, Jane",,', '"Doe, Jane",4.00,4.00'].join(
        "\n",
      ),
    );
    expect(withGaps.people).toHaveLength(1);
    expect(withGaps.people[0].totalHours).toBe(4);
    expect(withGaps.skipped).toBe(2);
  });

  it("gives up on a file that has no employee column", () => {
    expect(parseTimeEntries("Item,Price\nChicken,4.00").people).toEqual([]);
  });
});

describe("reading a tip summary", () => {
  it("takes the report's own total", () => {
    expect(parseTipSummary(TIP_SUMMARY)).toBe(263.17);
  });

  it("works it out from collected less refunded when there is no total", () => {
    expect(parseTipSummary("Tips collected,Tips refunded\n300.00,37.50")).toBe(262.5);
  });

  it("adds up a report broken out by day", () => {
    expect(parseTipSummary("Date,Total tips\n2026-08-10,100.00\n2026-08-11,63.17")).toBe(163.17);
  });

  it("returns nothing for a file that isn't one", () => {
    expect(parseTipSummary("Employee,Total Hours\nJane,5")).toBeNull();
    expect(parseTipSummary("Tips collected,Tips refunded")).toBeNull();
  });
});

describe("telling the two exports apart", () => {
  it("recognises each of them by its headers", () => {
    expect(detectTipsImport(TIME_ENTRIES)).toBe("time");
    expect(detectTipsImport(TIP_SUMMARY)).toBe("tips");
  });

  it("says so when a file is neither", () => {
    expect(detectTipsImport("Item,Description,Price\n1,Chicken,4.00")).toBe("unknown");
    expect(detectTipsImport("")).toBe("unknown");
  });
});

describe("dates", () => {
  it("reads the forms a clock export writes", () => {
    expect(parseEntryDate("Aug 10, 2026")).toBe("2026-08-10");
    expect(parseEntryDate("August 3, 2026")).toBe("2026-08-03");
    expect(parseEntryDate("2026-08-10")).toBe("2026-08-10");
    expect(parseEntryDate("8/10/2026")).toBe("2026-08-10");
    expect(parseEntryDate("nonsense")).toBeNull();
    expect(parseEntryDate("")).toBeNull();
  });

  it("writes the period the way a header should read", () => {
    expect(formatPeriod("2026-08-10", "2026-08-15")).toBe("Aug 10 – Aug 15, 2026");
    expect(formatPeriod("2026-08-10", "2026-08-10")).toBe("Aug 10, 2026");
    expect(formatPeriod("2026-12-30", "2027-01-02")).toBe("Dec 30, 2026 – Jan 2, 2027");
    expect(formatPeriod(null, null)).toBe("");
  });

  it("names the export file after the period", () => {
    expect(payoutFilename("2026-08-10", "2026-08-15")).toBe("tips-2026-08-10-to-2026-08-15.csv");
    expect(payoutFilename("2026-08-10", "2026-08-10")).toBe("tips-2026-08-10.csv");
  });
});

describe("the exported sheet", () => {
  const people = [person({ id: "a", name: "Ann Lee" }), person({ id: "b", name: "Bo Diaz" })];
  const payout = computePayout(
    [entry({ id: "a", hours: 10, extra: 5 }), entry({ id: "b", hours: 10 })],
    { tips: 100, bonus: 20 },
  );

  const csv = toPayoutCsv(people, payout, {
    period: "Aug 10 – Aug 15, 2026",
    basis: "payable",
    note: "Cash from the safe",
  });

  it("writes a row per person and a totals row", () => {
    expect(csv).toContain("Employee,Hours,Tips,Shared bonus,Individual bonus,Bonuses,Total");
    // Ann's $10 share of the pool and her own $5 come to $15 of bonuses.
    expect(csv).toContain("Ann Lee,10.00,50.00,10.00,5.00,15.00,65.00");
    expect(csv).toContain("Bo Diaz,10.00,50.00,10.00,0.00,10.00,60.00");
    expect(csv).toContain("Total (2 people),20.00,100.00,20.00,5.00,25.00,125.00");
  });

  it("explains where the figures came from", () => {
    // Quoted, because the period has a comma in it.
    expect(csv).toContain(`Tips payout,"Aug 10 – Aug 15, 2026"`);
    expect(csv).toContain("Payable hours");
    expect(csv).toContain("Tips from report,100.00");
    // Both kinds of bonus, under one figure.
    expect(csv).toContain("Bonuses,25.00");
    expect(csv).toContain("  Shared pool,20.00");
    expect(csv).toContain("  Individual bonuses,5.00");
    expect(csv).toContain("Notes,Cash from the safe");
  });

  it("leaves out anyone not being paid", () => {
    const without = toPayoutCsv(
      people,
      computePayout([entry({ id: "a", hours: 10 }), entry({ id: "b", included: false })], {
        tips: 100,
        bonus: 0,
      }),
      { period: "", basis: "payable", note: "" },
    );
    expect(without).toContain("Ann Lee");
    expect(without).not.toContain("Bo Diaz");
  });
});
