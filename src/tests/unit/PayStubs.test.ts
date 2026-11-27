import { describe, expect, it } from "vitest";

import {
  checkTotal,
  formatPayDate,
  mondayOfISO,
  payWeekOf,
  readCheckAmounts,
  matchName,
  normalizeName,
  parsePayrollText,
  readPayrollDates,
  suggestAssignments,
  toISODateFromSlashes,
  type PayrollAlias,
  type RosterEntry,
} from "@/lib/pay-stubs";

/** The roster as the owner keeps it — short names, one word each. */
const ROSTER: RosterEntry[] = [
  { id: "e-alazia", name: "alazia" },
  { id: "e-gabby", name: "Gabby" },
  { id: "e-javier", name: "Javier" },
  { id: "e-jordan", name: "Jordan" },
  { id: "e-malaisha", name: "Malaisha" },
  { id: "e-rissi", name: "Rissi" },
  { id: "e-samjhana", name: "Samjhana" },
  { id: "e-shayera", name: "Shayera" },
  { id: "e-shyanne", name: "Shyanne" },
  { id: "e-uddipti", name: "Uddipti" },
];

/** How the pay run prints the same people. */
const PAYROLL_NAMES = [
  "Samjhana Basnet",
  "Uddhipti Basnet",
  "Marrissia D Bermudez",
  "Shayera A Epps",
  "Jordan A Godfrey",
  "Cydayne Holt",
  "Malaisha N Johnson",
  "Javier L Madsen",
  "Gabrielle A Muschette",
  "Francis N Ravera",
  "Shyanne H Tandy",
  "Alazia D Vann",
];

/** One page of the real payroll PDF, as its text comes out. */
const page = (name: string, extra = "") => `
Check date: Pay to the order of: SSN:
Rate Hours Amount Deductions Amount Wages
Period end: Period begin:
JPS HOT CHICKEN TN INC
*************0.00$
08/19/26
15
${name}
${name}
US BANK
3334 Greenspoint Dr
Clarksville, TN 37042
7581 15 08/19/26 08/10/26 08/16/26
FICA-SS 20.56 FICA-MED 4.81
${extra}
Net Check
Total Pay
`;

describe("normalizeName", () => {
  it("ignores case, punctuation and stray spacing", () => {
    expect(normalizeName("  O'Neil-Smith,  Jr. ")).toBe("oneilsmith jr");
    expect(normalizeName("Alazia D Vann")).toBe("alazia d vann");
  });
});

describe("matchName", () => {
  it("matches a roster first name against the printed legal name", () => {
    expect(matchName("Samjhana Basnet", ROSTER)).toEqual({
      employeeId: "e-samjhana",
      match: "exact",
    });
  });

  it("forgives a spelling drift of a letter or two", () => {
    // The roster says "Uddipti"; payroll prints "Uddhipti".
    expect(matchName("Uddhipti Basnet", ROSTER)).toEqual({
      employeeId: "e-uddipti",
      match: "fuzzy",
    });
  });

  it("finds a short name living inside the legal one", () => {
    // "Rissi" is how the owner writes "Marrissia".
    expect(matchName("Marrissia D Bermudez", ROSTER)).toEqual({
      employeeId: "e-rissi",
      match: "fuzzy",
    });
  });

  it("gives up rather than guessing at a nickname it cannot see", () => {
    // "Gabby" for "Gabrielle" shares nothing a machine can rely on.
    expect(matchName("Gabrielle A Muschette", ROSTER)).toEqual({
      employeeId: null,
      match: "none",
    });
  });

  it("leaves people who are not on the roster unmatched", () => {
    expect(matchName("Cydayne Holt", ROSTER).employeeId).toBeNull();
    expect(matchName("Francis N Ravera", ROSTER).employeeId).toBeNull();
  });

  it("uses a remembered payroll name ahead of any guessing", () => {
    const aliases: PayrollAlias[] = [
      { employeeId: "e-gabby", payrollName: "Gabrielle A Muschette" },
    ];
    expect(matchName("Gabrielle A Muschette", ROSTER, aliases)).toEqual({
      employeeId: "e-gabby",
      match: "alias",
    });
  });

  it("reads a remembered name regardless of how it was typed", () => {
    const aliases: PayrollAlias[] = [
      { employeeId: "e-gabby", payrollName: "gabrielle a. muschette" },
    ];
    expect(matchName("Gabrielle A Muschette", ROSTER, aliases).match).toBe("alias");
  });
});

describe("suggestAssignments", () => {
  const pages = PAYROLL_NAMES.map((payrollName, i) => ({
    pageNumber: i + 1,
    payrollName,
  }));

  it("settles the whole pay run, leaving only what it cannot know", () => {
    const suggestions = suggestAssignments(pages, ROSTER);
    const assigned = suggestions.filter((s) => s.employeeId);
    const unassigned = suggestions.filter((s) => !s.employeeId).map((s) => s.payrollName);

    expect(assigned).toHaveLength(9);
    expect(unassigned).toEqual([
      "Cydayne Holt",
      "Gabrielle A Muschette",
      "Francis N Ravera",
    ]);
  });

  it("never hands one person two pages", () => {
    const twins = [
      { pageNumber: 1, payrollName: "Jordan A Godfrey" },
      { pageNumber: 2, payrollName: "Jordan B Whitfield" },
    ];
    const suggestions = suggestAssignments(twins, ROSTER);
    const owners = suggestions.map((s) => s.employeeId);

    expect(owners.filter((id) => id === "e-jordan")).toHaveLength(1);
    expect(owners.filter((id) => id === null)).toHaveLength(1);
  });

  it("lets a remembered name win the person off a weaker guess", () => {
    const aliases: PayrollAlias[] = [
      { employeeId: "e-jordan", payrollName: "Jordan B Whitfield" },
    ];
    const twins = [
      { pageNumber: 1, payrollName: "Jordan A Godfrey" },
      { pageNumber: 2, payrollName: "Jordan B Whitfield" },
    ];
    const suggestions = suggestAssignments(twins, ROSTER, aliases);

    expect(suggestions[1]).toMatchObject({ employeeId: "e-jordan", match: "alias" });
    expect(suggestions[0].employeeId).toBeNull();
  });

  it("passes a page with no readable name straight through", () => {
    const suggestions = suggestAssignments(
      [{ pageNumber: 1, payrollName: null }],
      ROSTER,
    );
    expect(suggestions[0]).toEqual({
      pageNumber: 1,
      payrollName: null,
      employeeId: null,
      match: "none",
    });
  });
});

describe("dates", () => {
  it("reads a two digit year as this century", () => {
    expect(toISODateFromSlashes("08/19/26")).toBe("2026-08-19");
    expect(toISODateFromSlashes("13/19/26")).toBeNull();
    expect(toISODateFromSlashes("nonsense")).toBeNull();
  });

  it("tells the pay date from the period it covers", () => {
    expect(readPayrollDates(["08/19/26", "08/10/26", "08/16/26", "08/19/26"])).toEqual({
      periodStart: "2026-08-10",
      periodEnd: "2026-08-16",
      payDate: "2026-08-19",
    });
  });

  it("keeps only the pay date when the pages carry less than expected", () => {
    expect(readPayrollDates(["08/19/26"])).toEqual({
      periodStart: null,
      periodEnd: null,
      payDate: "2026-08-19",
    });
  });

  it("reads as a plain date, not a moment in time", () => {
    // Parsed as UTC this lands on Aug 18 for anyone west of Greenwich.
    expect(formatPayDate("2026-08-19")).toBe("Aug 19, 2026");
    expect(formatPayDate(null)).toBe("No date");
  });
});

describe("parsePayrollText", () => {
  const pageTexts = PAYROLL_NAMES.map((name) => page(name));

  it("reads a name off every page of a real pay run", () => {
    const parsed = parsePayrollText(pageTexts);
    expect(parsed.pages.map((p) => p.payrollName)).toEqual(PAYROLL_NAMES);
    expect(parsed.pages.map((p) => p.pageNumber)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("takes the dates off the pages", () => {
    expect(parsePayrollText(pageTexts)).toMatchObject({
      payDate: "2026-08-19",
      periodStart: "2026-08-10",
      periodEnd: "2026-08-16",
    });
  });

  it("ignores the form's own labels and the company's own name", () => {
    // "JPS HOT CHICKEN TN INC" and "US BANK" print on every page, in capitals.
    const parsed = parsePayrollText(pageTexts);
    expect(parsed.pages.map((p) => p.payrollName)).not.toContain("US BANK");
  });

  it("reports a page it cannot read a name from rather than inventing one", () => {
    const parsed = parsePayrollText([
      ...pageTexts,
      "JPS HOT CHICKEN TN INC\n08/19/26\nNet Check\nTotal Pay\n",
    ]);
    expect(parsed.pages.at(-1)!.payrollName).toBeNull();
  });
});

/**
 * The Wages table as unpdf reads it off a real check: this check first, then the
 * year to date, each starting with a Weekly line.
 */
const CHECK_TEXT = [
  "Rate Hours Amount Deductions AmountWages",
  "13.00 9.89Weekly 128.57 19.50 0.00 26.00 0.00 9.89 128.57",
  "Reported Tips 31.56 0.00 0.00 31.56",
  "FICA-SS 9.92",
  "153.34Weekly 1,944.53 0.00 0.00 153.34 1,944.53",
  "Reported Tips 306.84 0.00 0.00 306.84",
  "Bonus 8.88 0.00 0.00 8.88",
].join("\n");

describe("readCheckAmounts", () => {
  it("reads this check's pay and tips, not the year to date", () => {
    expect(readCheckAmounts(CHECK_TEXT)).toEqual({
      wages: 128.57,
      tips: 31.56,
      bonus: 0,
      hours: 9.89,
    });
  });

  it("takes the row total, so overtime counts", () => {
    const text = [
      "12.00 40.00Weekly 480.00 18.00 4.18 75.24 24.00 0.00 44.18 555.24",
      "Reported Tips 30.02 0.00 0.00 30.02",
      "Bonus 37.08 0.00 0.00 37.08",
      "40.00Weekly 480.00 4.18 75.24 0.00 44.18 555.24",
    ].join("\n");
    expect(readCheckAmounts(text)).toEqual({ wages: 555.24, tips: 30.02, bonus: 37.08, hours: 44.18 });
  });

  it("reads thousands", () => {
    expect(readCheckAmounts("1.00 1.00Weekly 1,234.50 1.00 1,234.50")?.wages).toBe(1234.5);
  });

  it("gives up rather than guessing when there's no Weekly line", () => {
    expect(readCheckAmounts("Net Check\n147.89")).toBeNull();
  });

  it("adds pay, tips and bonus without float drift", () => {
    expect(checkTotal({ wages: 128.57, tips: 31.56, bonus: 0 })).toBe(160.13);
  });
});

describe("payWeekOf", () => {
  it("finds the Monday of a Monday-to-Sunday period", () => {
    expect(mondayOfISO("2026-11-15")).toBe("2026-11-09");
    expect(
      payWeekOf({ payDate: "2026-11-16", periodStart: "2026-11-09", periodEnd: "2026-11-15" }),
    ).toBe("2026-11-09");
  });

  it("puts a period printed a day early on the week it mostly covers", () => {
    expect(
      payWeekOf({ payDate: "2026-11-02", periodStart: "2026-10-25", periodEnd: "2026-11-01" }),
    ).toBe("2026-10-26");
  });

  it("falls back to the week before the pay date", () => {
    expect(payWeekOf({ payDate: "2026-08-19", periodStart: null, periodEnd: null })).toBe(
      "2026-08-10",
    );
  });
});
