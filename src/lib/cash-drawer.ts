/**
 * Counting the drawer down at close — no React and no database in it, just the
 * arithmetic.
 *
 * A count answers three questions in order. What does the POS say should be in
 * the till? What is actually in it? And how does the difference get settled?
 * Settling it is always the same move: every coin goes back, enough bills go
 * back on top of the coins to set the till at $200, and whatever is left over
 * is the drop.
 *
 * Everything here is integer cents. Counting money in floating point is how a
 * drawer ends up a penny short for reasons nobody can explain the next morning.
 */

/** What the till is set back to before the next shift opens. */
export const BANK_TARGET_CENTS = 20_000;

/* ----------------------------------------------------------- denominations */

export type DenominationKind = "bill" | "coin";

export type Denomination = {
  id: string;
  kind: DenominationKind;
  /** Face value in cents. */
  cents: number;
  /** How the counting row is labelled, e.g. "$20s". */
  label: string;
  /** One of them, spelled out — "$20", "25c" — for the put-back instructions. */
  each: string;
  /** Names its home in the till: "the quarter slot", "seven twenties". */
  singular: string;
};

/** Largest first, which is the order a stack of bills gets counted in. */
export const BILLS: Denomination[] = [
  { id: "b100", kind: "bill", cents: 10_000, label: "$100s", each: "$100", singular: "hundred" },
  { id: "b50", kind: "bill", cents: 5_000, label: "$50s", each: "$50", singular: "fifty" },
  { id: "b20", kind: "bill", cents: 2_000, label: "$20s", each: "$20", singular: "twenty" },
  { id: "b10", kind: "bill", cents: 1_000, label: "$10s", each: "$10", singular: "ten" },
  { id: "b5", kind: "bill", cents: 500, label: "$5s", each: "$5", singular: "five" },
  { id: "b1", kind: "bill", cents: 100, label: "$1s", each: "$1", singular: "one" },
];

export const COINS: Denomination[] = [
  { id: "c25", kind: "coin", cents: 25, label: "Quarters", each: "25¢", singular: "quarter" },
  { id: "c10", kind: "coin", cents: 10, label: "Dimes", each: "10¢", singular: "dime" },
  { id: "c5", kind: "coin", cents: 5, label: "Nickels", each: "5¢", singular: "nickel" },
  { id: "c1", kind: "coin", cents: 1, label: "Pennies", each: "1¢", singular: "penny" },
];

export const DENOMINATIONS: Denomination[] = [...BILLS, ...COINS];

/** How many of each denomination, keyed by id. A missing key means none. */
export type Counts = Record<string, number>;

/** Read one count defensively: never negative, never a fraction of a coin. */
export const countOf = (counts: Counts, id: string): number =>
  Math.max(0, Math.trunc(counts[id] ?? 0));

/** What a set of counts is worth, in cents. */
export function valueOf(counts: Counts, denominations: readonly Denomination[]): number {
  return denominations.reduce((sum, d) => sum + d.cents * countOf(counts, d.id), 0);
}

/* -------------------------------------------------------------- the $200 bank */

export type BankPlan = {
  /** Every coin counted goes back, so the coins are the floor the bills sit on. */
  coinCents: number;
  /** Whole dollars of bills wanted on top of the coins, rounded up. */
  needCents: number;
  /** How many of each bill go back in the till. */
  bills: Counts;
  billCents: number;
  /** What the till holds once it is set: coins plus bills. */
  totalCents: number;
  /** How far past $200 that lands. Under a dollar unless the drawer ran out of change. */
  overCents: number;
  /** True when the drawer never held enough bills to reach $200 at all. */
  short: boolean;
};

/**
 * Work out which bills go back in the till.
 *
 * The coins are already in there, so the bills only have to cover the rest —
 * and bills come in whole dollars, so they can only get so close. Rounding up
 * is the deliberate part: the till is left at or just over $200, never under,
 * which is why a set till reads $200.43 rather than $200.00.
 *
 * Which bills is a bounded coin-change problem rather than a greedy walk. The
 * plan is the smallest amount reachable at or above the target, and among the
 * ways to reach that amount, the one using the most notes — because for a fixed
 * total, more notes means smaller ones, and small notes are what a till needs
 * to make change with. The hundreds and fifties fall out into the drop, which
 * is where they belong.
 */
export function planBank(counts: Counts): BankPlan {
  const coinCents = valueOf(counts, COINS);
  const needCents = Math.max(0, Math.ceil((BANK_TARGET_CENTS - coinCents) / 100) * 100);
  const bills = fillWithBills(counts, needCents);
  const billCents = valueOf(bills, BILLS);
  const totalCents = coinCents + billCents;

  return {
    coinCents,
    needCents,
    bills,
    billCents,
    totalCents,
    overCents: totalCents - BANK_TARGET_CENTS,
    short: billCents < needCents,
  };
}

/** Every bill in the drawer, when there is no choice to make about it. */
const everyBill = (counts: Counts): Counts =>
  Object.fromEntries(
    BILLS.map((bill) => [bill.id, countOf(counts, bill.id)]).filter(([, n]) => (n as number) > 0),
  );

function fillWithBills(counts: Counts, needCents: number): Counts {
  if (needCents <= 0) return {};

  // Whole dollars from here down; no bill is worth a fraction of one.
  const need = needCents / 100;
  const denoms = BILLS.map((bill) => ({
    id: bill.id,
    value: bill.cents / 100,
    count: countOf(counts, bill.id),
  }));

  const purse = denoms.reduce((sum, d) => sum + d.value * d.count, 0);
  // Not enough to reach the target, or exactly enough: the whole drawer stays.
  if (purse <= need) return everyBill(counts);

  // The window to search. Filling smallest-note-first either lands on the
  // target or stops just under it with every remaining note bigger than the
  // gap — so one more note, worth at most $100, always clears it. Nothing above
  // `need + 100` can ever be the answer.
  const cap = Math.min(purse, need + 100);

  // `best[a]` is the most notes that make exactly `a` dollars, or -1 for an
  // amount that cannot be made. `taken[i][a]` remembers how many of the i-th
  // denomination that answer used, so the plan can be walked back out.
  let best = new Array<number>(cap + 1).fill(-1);
  best[0] = 0;
  const taken: number[][] = [];

  for (const denom of denoms) {
    const next = new Array<number>(cap + 1).fill(-1);
    const used = new Array<number>(cap + 1).fill(0);

    for (let amount = 0; amount <= cap; amount++) {
      const limit = Math.min(denom.count, Math.floor(amount / denom.value));
      for (let k = 0; k <= limit; k++) {
        const rest = best[amount - k * denom.value];
        if (rest < 0) continue;
        if (rest + k > next[amount]) {
          next[amount] = rest + k;
          used[amount] = k;
        }
      }
    }

    best = next;
    taken.push(used);
  }

  let target = -1;
  for (let amount = need; amount <= cap; amount++) {
    if (best[amount] >= 0) {
      target = amount;
      break;
    }
  }
  // Unreachable given the window above, but a drawer count is no place to throw.
  if (target < 0) return everyBill(counts);

  const bills: Counts = {};
  let amount = target;
  for (let i = denoms.length - 1; i >= 0; i--) {
    const k = taken[i][amount];
    if (k > 0) bills[denoms[i].id] = k;
    amount -= k * denoms[i].value;
  }

  return bills;
}

/* --------------------------------------------------------------- the count */

export type DrawerCount = {
  /** What the POS says should be in the till. */
  expectedCents: number;
  billCents: number;
  coinCents: number;
  /** What was actually counted. */
  countedCents: number;
  /** Counted less expected: positive is over the drawer, negative is short. */
  overShortCents: number;
  bank: BankPlan;
  /** The bills left once the till is set — the drop. */
  dropBills: Counts;
  dropCents: number;
};

/** The whole close-out, from a set of counts and what the POS expected. */
export function tallyDrawer(counts: Counts, expectedCents: number): DrawerCount {
  const billCents = valueOf(counts, BILLS);
  const coinCents = valueOf(counts, COINS);
  const countedCents = billCents + coinCents;
  const bank = planBank(counts);

  const dropBills: Counts = {};
  for (const bill of BILLS) {
    const left = countOf(counts, bill.id) - countOf(bank.bills, bill.id);
    if (left > 0) dropBills[bill.id] = left;
  }

  return {
    expectedCents,
    billCents,
    coinCents,
    countedCents,
    overShortCents: countedCents - expectedCents,
    bank,
    dropBills,
    dropCents: valueOf(dropBills, BILLS),
  };
}

/** One line of a put-back or banding instruction. */
export type DenominationLine = {
  denomination: Denomination;
  count: number;
  cents: number;
};

/** The denominations actually present, in the order they get handled. */
export function linesFor(
  counts: Counts,
  denominations: readonly Denomination[],
): DenominationLine[] {
  return denominations
    .map((denomination) => ({
      denomination,
      count: countOf(counts, denomination.id),
      cents: denomination.cents * countOf(counts, denomination.id),
    }))
    .filter((line) => line.count > 0);
}

/* ------------------------------------------------------------- formatting */

/** Cents as money, always to the cent: 20067 -> "$200.67". */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/* ------------------------------------------------------------- pad entry */

/** How many digits a field will hold — a money amount, and a count of notes. */
export const MONEY_DIGITS = 7;
export const COUNT_DIGITS = 3;

/**
 * Add a keypress to a field.
 *
 * Digits fill from the right the way a till does: on a money field "2", "0",
 * "5" reads $2.05, so an amount is typed straight off the POS screen without
 * hunting for a decimal point. A press that would overflow the field is
 * dropped rather than silently truncating what is already there.
 */
export function pushDigits(digits: string, key: string, max: number): string {
  const next = (digits + key).replace(/^0+(?=\d)/, "");
  return next.length > max ? digits : next;
}

/** What a field of typed digits is worth. Money is cents; a count is a count. */
export const valueFromDigits = (digits: string): number => (digits ? Number(digits) : 0);
