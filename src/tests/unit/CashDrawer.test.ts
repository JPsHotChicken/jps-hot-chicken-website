import { describe, it, expect } from "vitest";

import {
  BILLS,
  COINS,
  BANK_TARGET_CENTS,
  countOf,
  formatCents,
  linesFor,
  planBank,
  pushDigits,
  tallyDrawer,
  valueOf,
  type Counts,
} from "@/lib/cash-drawer";

/** A drawer, written the way it gets counted. */
const drawer = (over: Counts = {}): Counts => ({ ...over });

describe("counting what is there", () => {
  it("adds bills and coins up in cents", () => {
    const counts = drawer({ b20: 3, b1: 4, c25: 7, c1: 3 });
    expect(valueOf(counts, BILLS)).toBe(6_400);
    expect(valueOf(counts, COINS)).toBe(178);
  });

  it("ignores negative and fractional counts rather than trusting them", () => {
    expect(countOf({ b20: -4 }, "b20")).toBe(0);
    expect(countOf({ c25: 2.7 }, "c25")).toBe(2);
    expect(countOf({}, "b100")).toBe(0);
  });

  it("lists only the denominations actually present", () => {
    const lines = linesFor(drawer({ c25: 47, c5: 20 }), COINS);
    expect(lines.map((line) => line.denomination.id)).toEqual(["c25", "c5"]);
    expect(lines[0]).toMatchObject({ count: 47, cents: 1_175 });
  });
});

describe("setting the till back to $200", () => {
  it("puts back the coins, then rounds the bills up over the target", () => {
    // $16.42 in coins, so $183.58 to go — and bills only come in whole dollars.
    const counts = drawer({
      b100: 2,
      b50: 1,
      b20: 12,
      b10: 8,
      b5: 14,
      b1: 43,
      c25: 47,
      c10: 31,
      c5: 20,
      c1: 57,
    });
    const bank = planBank(counts);

    expect(bank.coinCents).toBe(1_642);
    expect(bank.needCents).toBe(18_400);
    expect(bank.billCents).toBe(18_400);
    expect(bank.totalCents).toBe(20_042);
    expect(bank.overCents).toBe(42);
    expect(bank.short).toBe(false);
  });

  it("never leaves the till under $200", () => {
    // Every coin count from none to a full slot: the till lands at or over.
    for (let quarters = 0; quarters <= 40; quarters++) {
      for (const pennies of [0, 1, 7, 49, 99]) {
        const bank = planBank(drawer({ b1: 300, c25: quarters, c1: pennies }));
        expect(bank.totalCents).toBeGreaterThanOrEqual(BANK_TARGET_CENTS);
        // The slack is the round-up and nothing more, when change is on hand.
        expect(bank.overCents).toBeLessThan(100);
      }
    }
  });

  it("wants a full $200 in bills when there are no coins", () => {
    expect(planBank(drawer({ b20: 20 })).needCents).toBe(20_000);
  });

  it("keeps the small bills in the till and lets the big ones drop", () => {
    // Both make $200. The till gets the ones; the hundreds are the drop's problem.
    const bank = planBank(drawer({ b100: 2, b1: 200 }));
    expect(bank.bills).toEqual({ b1: 200 });
  });

  it("takes the closest it can when the drawer has no small change", () => {
    // $184 is wanted and the drawer is all twenties, so $200 is as close as it gets.
    const bank = planBank(drawer({ b20: 10, c25: 47, c10: 31, c5: 20, c1: 57 }));
    expect(bank.needCents).toBe(18_400);
    expect(bank.bills).toEqual({ b20: 10 });
    expect(bank.overCents).toBe(1_642);
    expect(bank.short).toBe(false);
  });

  it("finds the smallest overshoot rather than the first one", () => {
    // $157 cannot be made without a five, so $160 it is — and 2x$10 + 7x$20
    // beats 8x$20 because it leaves the till holding more notes.
    const bank = planBank(drawer({ b100: 1, b50: 1, b20: 10, b10: 3, b1: 2, c25: 174, c1: 17 }));
    expect(bank.needCents).toBe(15_700);
    expect(bank.bills).toEqual({ b10: 2, b20: 7 });
    expect(bank.totalCents).toBe(20_367);
  });

  it("asks for no bills when the coins alone cover the target", () => {
    const bank = planBank(drawer({ b20: 5, c25: 900 }));
    expect(bank.needCents).toBe(0);
    expect(bank.bills).toEqual({});
    expect(bank.short).toBe(false);
  });

  it("says so when the drawer cannot reach $200", () => {
    const bank = planBank(drawer({ b20: 3, b1: 5, c25: 4 }));
    expect(bank.short).toBe(true);
    expect(bank.bills).toEqual({ b20: 3, b1: 5 });
    expect(bank.totalCents).toBe(6_600);
  });
});

describe("the close-out", () => {
  it("drops the bills the till did not need, and never a coin", () => {
    const counts = drawer({
      b100: 2,
      b50: 1,
      b20: 12,
      b10: 8,
      b5: 14,
      b1: 43,
      c25: 47,
      c10: 31,
      c5: 20,
      c1: 57,
    });
    const tally = tallyDrawer(counts, 69_942);

    expect(tally.countedCents).toBe(69_942);
    expect(tally.overShortCents).toBe(0);
    expect(tally.bank.bills).toEqual({ b1: 39, b5: 13, b10: 8 });
    expect(tally.dropBills).toEqual({ b100: 2, b50: 1, b20: 12, b5: 1, b1: 4 });
    expect(tally.dropCents).toBe(49_900);
    // Counted money all lands somewhere: in the till or in the drop.
    expect(tally.bank.totalCents + tally.dropCents).toBe(tally.countedCents);
  });

  it("reports a drawer that came up short against the POS", () => {
    const tally = tallyDrawer(drawer({ b20: 15, c25: 4 }), 30_500);
    expect(tally.countedCents).toBe(30_100);
    expect(tally.overShortCents).toBe(-400);
  });

  it("reports a drawer that came up over", () => {
    const tally = tallyDrawer(drawer({ b20: 15, c25: 4 }), 29_875);
    expect(tally.overShortCents).toBe(225);
  });

  it("leaves nothing to drop when the till could not be filled", () => {
    const tally = tallyDrawer(drawer({ b20: 3, b1: 5 }), 6_500);
    expect(tally.bank.short).toBe(true);
    expect(tally.dropCents).toBe(0);
  });
});

describe("typing on the pad", () => {
  it("fills a money field from the right, so $2.05 is 2-0-5", () => {
    let digits = "";
    for (const key of ["2", "0", "5"]) digits = pushDigits(digits, key, 7);
    expect(digits).toBe("205");
  });

  it("drops a keypress that would overflow the field", () => {
    expect(pushDigits("999", "9", 3)).toBe("999");
    expect(pushDigits("99", "00", 3)).toBe("99");
  });

  it("does not keep leading zeros around", () => {
    expect(pushDigits("0", "5", 3)).toBe("5");
    expect(pushDigits("", "0", 3)).toBe("0");
  });
});

describe("showing money", () => {
  it("always spells out the cents", () => {
    expect(formatCents(20_042)).toBe("$200.42");
    expect(formatCents(20_000)).toBe("$200.00");
    expect(formatCents(0)).toBe("$0.00");
  });
});
