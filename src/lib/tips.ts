import { matchColumns, parseCsv, toCsv } from "@/lib/csv";
import { formatShortDate, fromISODate } from "@/lib/schedule";

/**
 * Everything the tips payout page understands, with no database or React in it.
 *
 * A payout is built from two exports that arrive separately: the time clock's
 * entries say who worked and for how long, and the sales summary says how much
 * was tipped. Neither is stored anywhere — the page reads them, does the
 * arithmetic, and the owner hands out cash.
 *
 * The money rules are the part worth being careful about:
 *
 *  - **Tips** are shared by the hour, so a double is worth twice a half shift.
 *  - **The bonus pool** is split evenly per person, however long they were on.
 *  - **An individual bonus** goes to one person and is shared with nobody.
 *
 * Every split is exact to the cent — see `allocate`.
 */

/* ------------------------------------------------------------------- people */

/** One person on the payout, as the time clock reported them. */
export type TipsPerson = {
  /** Derived from the name, so importing the same person twice lands on one row. */
  id: string;
  name: string;
  /** Hours on the clock, before unpaid breaks come off. */
  totalHours: number;
  /** What the clock calls payable — total hours, less unpaid break time. */
  payableHours: number;
  /** How many shifts those hours came from. */
  shifts: number;
  /**
   * Anything the clock flagged, e.g. `AUTO CLOCK-OUT`. Worth showing: a shift
   * that closed itself at 4am is hours nobody worked, and it would otherwise
   * quietly take a share of the tips.
   */
  anomalies: string[];
  /** True for a row typed in by hand rather than read from an export. */
  manual?: boolean;
};

/** Which hours column the split is worked out from. */
export const HOURS_BASES = ["payable", "total"] as const;
export type HoursBasis = (typeof HOURS_BASES)[number];

export const HOURS_BASIS_LABELS: Record<HoursBasis, string> = {
  payable: "Payable hours",
  total: "Total hours",
};

export function hoursOf(person: TipsPerson, basis: HoursBasis): number {
  return basis === "total" ? person.totalHours : person.payableHours;
}

/** Sort people the way a payout sheet reads — by name. */
export function comparePeople(a: TipsPerson, b: TipsPerson): number {
  return a.name.localeCompare(b.name);
}

/**
 * "Basnet, Uddhipti" as a person would write it.
 *
 * Time clocks export `Last, First`, and a sheet of names in that form is hard to
 * read down. Anything without a comma is left exactly as it came.
 */
export function displayName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  const comma = name.indexOf(",");
  if (comma === -1) return name;

  const last = name.slice(0, comma).trim();
  const first = name.slice(comma + 1).trim();
  if (!first) return last;
  if (!last) return first;
  return `${first} ${last}`;
}

/** The key two spellings of one person have to agree on to be merged. */
export function personId(name: string): string {
  return displayName(name).toLowerCase();
}

/* ---------------------------------------------------------------- arithmetic */

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Nobody is handing out a million dollars in tips from one week. */
export const MAX_POOL = 100_000;

/** A hand-typed dollar figure, kept sane. */
export function clampMoney(value: number, max = MAX_POOL): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, round2(value)));
}

/** Nobody works more than this in a pay period, however the clock reads. */
export const MAX_HOURS = 400;

export function clampHours(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_HOURS, Math.max(0, round2(value)));
}

/**
 * Split a pot of money by weight, exactly.
 *
 * Rounding each share on its own loses or invents cents — thirds of $263.17
 * paid to the nearest cent leave a penny on the table, and the owner is handing
 * out physical cash that has to add up. So the split is done in whole cents and
 * the leftover ones go to the largest fractional remainders, which is the
 * standard way of apportioning and gives the biggest earners the odd cent.
 *
 * The returned shares always sum to `pool` to the cent, unless there is nothing
 * to divide by — a pool with no weights behind it stays undistributed rather
 * than being quietly dropped somewhere.
 */
export function allocate(pool: number, weights: readonly number[]): number[] {
  const cents = Math.round(pool * 100);
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (cents <= 0 || total <= 0) return weights.map(() => 0);

  const exact = weights.map((weight) => (cents * Math.max(0, weight)) / total);
  const shares = exact.map(Math.floor);
  const spare = cents - shares.reduce((sum, share) => sum + share, 0);

  // Biggest remainder first; ties go to whoever appears first, so the same
  // input always produces the same sheet.
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (let i = 0; i < spare; i++) shares[order[i % order.length].index] += 1;

  return shares.map((share) => share / 100);
}

/* ------------------------------------------------------------------- payout */

/** One person, as the payout is being edited. */
export type PayoutEntry = {
  id: string;
  /** The hours this split uses — from the export, or corrected by hand. */
  hours: number;
  /** Unticked for anyone not being paid out of this pot. */
  included: boolean;
  /** A bonus for this person alone, shared with nobody. */
  extra: number;
};

/** What one person is owed, and where each part of it came from. */
export type PayoutShare = {
  id: string;
  hours: number;
  included: boolean;
  /** Their cut of the tips, by hours worked. */
  tipShare: number;
  /** Their cut of the bonus pool, split evenly. */
  bonusShare: number;
  extra: number;
  total: number;
};

export type PayoutPools = {
  /** Tips off the sales report. */
  tips: number;
  /** Extra the owner is adding, split evenly rather than by the hour. */
  bonus: number;
};

export type Payout = {
  shares: PayoutShare[];
  /** How many people are being paid. */
  people: number;
  /** Their hours, added up. */
  hours: number;
  /** What one hour of work earned. */
  perHour: number;
  /** The flat share of the bonus pool each person gets. */
  perPerson: number;
  tips: number;
  bonus: number;
  extras: number;
  /** Everything being handed out, including the individual bonuses. */
  total: number;
  /**
   * Pool money with nowhere to go — nobody ticked, or nobody with hours. Shown
   * rather than swallowed, so a sheet that doesn't add up says so.
   */
  unallocated: number;
};

/**
 * Work out what everyone gets.
 *
 * Anyone unticked is left at zero across the board, individual bonus included:
 * they are not on this payout, so nothing about them should reach the total.
 */
export function computePayout(entries: readonly PayoutEntry[], pools: PayoutPools): Payout {
  const tips = clampMoney(pools.tips);
  const bonus = clampMoney(pools.bonus);

  const paid = entries.filter((entry) => entry.included);
  const hours = paid.map((entry) => clampHours(entry.hours));

  const byHours = allocate(tips, hours);
  const evenly = allocate(
    bonus,
    paid.map(() => 1),
  );

  const cuts = new Map(
    paid.map((entry, index) => [
      entry.id,
      { tipShare: byHours[index], bonusShare: evenly[index] },
    ]),
  );

  const shares: PayoutShare[] = entries.map((entry) => {
    const cut = cuts.get(entry.id);
    if (!cut) {
      return { ...entry, hours: clampHours(entry.hours), tipShare: 0, bonusShare: 0, extra: 0, total: 0 };
    }
    const extra = clampMoney(entry.extra);
    return {
      id: entry.id,
      hours: clampHours(entry.hours),
      included: true,
      tipShare: cut.tipShare,
      bonusShare: cut.bonusShare,
      extra,
      total: round2(cut.tipShare + cut.bonusShare + extra),
    };
  });

  const totalHours = round2(hours.reduce((sum, value) => sum + value, 0));
  const handedOut = round2(
    shares.reduce((sum, share) => sum + share.tipShare + share.bonusShare, 0),
  );
  const extras = round2(shares.reduce((sum, share) => sum + share.extra, 0));

  return {
    shares,
    people: paid.length,
    hours: totalHours,
    perHour: totalHours > 0 ? tips / totalHours : 0,
    perPerson: paid.length > 0 ? bonus / paid.length : 0,
    tips,
    bonus,
    extras,
    total: round2(handedOut + extras),
    unallocated: round2(tips + bonus - handedOut),
  };
}

/* --------------------------------------------------------------- time clock */

const TIME_ENTRY_ALIASES = {
  employee: ["employee", "employee name", "name", "team member", "staff", "worker"],
  date: ["date", "business date", "shift date", "work date"],
  anomalies: ["anomalies", "anomaly", "exceptions"],
  totalHours: ["total hours", "hours worked", "total time", "hours"],
  payableHours: ["payable hours", "paid hours", "net hours"],
} as const;

type TimeEntryField = keyof typeof TIME_ENTRY_ALIASES;

export type TimeEntriesImport = {
  people: TipsPerson[];
  /** Rows with no name or no hours on them. */
  skipped: number;
  /** The span the file covers, as ISO dates, when it carries a date column. */
  from: string | null;
  to: string | null;
};

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/**
 * A date off a clock export, as ISO.
 *
 * Only used to say what week the sheet covers, so an unreadable one is no
 * reason to reject a row — it just doesn't narrow the range.
 */
export function parseEntryDate(value: string): string | null {
  const text = value.trim();
  if (!text) return null;

  // Already ISO.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // "Aug 10, 2026" — what the clock writes.
  const named = /^([a-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(text);
  if (named) {
    const month = MONTHS.indexOf(named[1].slice(0, 3).toLowerCase());
    if (month === -1) return null;
    return `${named[3]}-${String(month + 1).padStart(2, "0")}-${named[2].padStart(2, "0")}`;
  }

  // "8/10/2026", month first.
  const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(text);
  if (slashed) {
    const year = slashed[3].length === 2 ? `20${slashed[3]}` : slashed[3];
    return `${year}-${slashed[1].padStart(2, "0")}-${slashed[2].padStart(2, "0")}`;
  }

  return null;
}

/** A number off an export: strips `$`, thousands separators and stray spaces. */
function parseNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const cleaned = value.replace(/[$,\s]/g, "").trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Read a time clock export into one row per person.
 *
 * The export is one row per *shift*, so the same person appears every day they
 * worked; this adds those up. Both hours columns are kept rather than one being
 * chosen here, because which of them a payout should use is the owner's call —
 * see `HOURS_BASES`.
 */
export function parseTimeEntries(text: string): TimeEntriesImport {
  const rows = parseCsv(text);
  if (rows.length < 2) return { people: [], skipped: 0, from: null, to: null };

  const [headers, ...body] = rows;
  const columns = matchColumns<TimeEntryField>(headers, TIME_ENTRY_ALIASES);
  if (columns.employee === -1) return { people: [], skipped: 0, from: null, to: null };

  const at = (row: string[], index: number) => (index === -1 ? "" : (row[index] ?? "").trim());

  const found = new Map<string, TipsPerson>();
  const dates: string[] = [];
  let skipped = 0;

  for (const row of body) {
    const raw = at(row, columns.employee);
    if (!raw) {
      skipped++;
      continue;
    }

    const total = parseNumber(at(row, columns.totalHours));
    const payable = parseNumber(at(row, columns.payableHours));
    if (total === null && payable === null) {
      skipped++;
      continue;
    }

    const name = displayName(raw);
    const id = personId(raw);
    const person = found.get(id) ?? {
      id,
      name,
      totalHours: 0,
      payableHours: 0,
      shifts: 0,
      anomalies: [],
    };

    // A file carrying only one of the two columns still has to produce a
    // sensible number for both, or the basis toggle would zero the sheet.
    person.totalHours = round2(person.totalHours + (total ?? payable ?? 0));
    person.payableHours = round2(person.payableHours + (payable ?? total ?? 0));
    person.shifts++;

    const anomaly = at(row, columns.anomalies);
    if (anomaly && !person.anomalies.includes(anomaly)) person.anomalies.push(anomaly);

    found.set(id, person);

    const date = parseEntryDate(at(row, columns.date));
    if (date) dates.push(date);
  }

  dates.sort();

  return {
    people: [...found.values()].sort(comparePeople),
    skipped,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
}

/* ------------------------------------------------------------- tip summary */

const TIP_SUMMARY_ALIASES = {
  total: ["total tips", "tips total"],
  collected: ["tips collected", "tips"],
  refunded: ["tips refunded", "refunds", "refunded"],
} as const;

type TipSummaryField = keyof typeof TIP_SUMMARY_ALIASES;

/**
 * The tips figure off a sales summary.
 *
 * Prefers the report's own total, and works it out from collected less refunded
 * when there isn't one. Returns null when the file isn't a tip summary at all.
 */
export function parseTipSummary(text: string): number | null {
  const rows = parseCsv(text);
  if (rows.length < 2) return null;

  const [headers, ...body] = rows;
  const columns = matchColumns<TipSummaryField>(headers, TIP_SUMMARY_ALIASES);
  if (columns.total === -1 && columns.collected === -1) return null;

  let total = 0;
  let read = false;

  for (const row of body) {
    if (columns.total !== -1) {
      const value = parseNumber(row[columns.total]);
      if (value === null) continue;
      total += value;
    } else {
      const collected = parseNumber(row[columns.collected]);
      if (collected === null) continue;
      total += collected - (parseNumber(row[columns.refunded]) ?? 0);
    }
    read = true;
  }

  return read ? round2(total) : null;
}

/* --------------------------------------------------------------- detection */

export type TipsImportKind = "time" | "tips" | "unknown";

/**
 * Which of the two exports this is.
 *
 * Told apart by their headers rather than asked about — the owner downloaded
 * two reports and shouldn't have to tell the page which one they picked first.
 */
export function detectTipsImport(text: string): TipsImportKind {
  const [headers] = parseCsv(text);
  if (!headers) return "unknown";

  const columns = matchColumns<TimeEntryField>(headers, TIME_ENTRY_ALIASES);
  if (columns.employee !== -1 && (columns.totalHours !== -1 || columns.payableHours !== -1)) {
    return "time";
  }

  const tips = matchColumns<TipSummaryField>(headers, TIP_SUMMARY_ALIASES);
  if (tips.total !== -1 || tips.collected !== -1) return "tips";

  return "unknown";
}

/* ----------------------------------------------------------------- display */

/** "Aug 10 – Aug 15, 2026", or one date, or nothing at all. */
export function formatPeriod(from: string | null, to: string | null): string {
  if (!from && !to) return "";
  if (!from || !to || from === to) {
    const only = fromISODate((from ?? to) as string);
    return `${formatShortDate(only)}, ${only.getFullYear()}`;
  }

  const start = fromISODate(from);
  const end = fromISODate(to);
  return start.getFullYear() === end.getFullYear()
    ? `${formatShortDate(start)} – ${formatShortDate(end)}, ${end.getFullYear()}`
    : `${formatShortDate(start)}, ${start.getFullYear()} – ${formatShortDate(end)}, ${end.getFullYear()}`;
}

/** Money as it goes on the sheet — always two decimals, so columns line up. */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Hours to two decimals, the way the clock reports them. */
export function formatHours(value: number): string {
  return value.toFixed(2);
}

/* ------------------------------------------------------------------ export */

/**
 * The payout as a spreadsheet.
 *
 * Laid out the way it would be written on paper: a row per person, a totals
 * row underneath, then the pools and the note so the sheet explains itself
 * months later without the original exports next to it.
 */
export function toPayoutCsv(
  people: readonly TipsPerson[],
  payout: Payout,
  meta: { period: string; basis: HoursBasis; note: string },
): string {
  const byId = new Map(payout.shares.map((share) => [share.id, share]));

  const rows: (string | number | null)[][] = [
    ["Tips payout", meta.period],
    [HOURS_BASIS_LABELS[meta.basis], "", "", "", ""],
    [],
    ["Employee", "Hours", "Tips", "Bonus", "Individual bonus", "Total"],
  ];

  for (const person of people) {
    const share = byId.get(person.id);
    if (!share?.included) continue;
    rows.push([
      person.name,
      share.hours.toFixed(2),
      share.tipShare.toFixed(2),
      share.bonusShare.toFixed(2),
      share.extra.toFixed(2),
      share.total.toFixed(2),
    ]);
  }

  rows.push([
    `Total (${payout.people} ${payout.people === 1 ? "person" : "people"})`,
    payout.hours.toFixed(2),
    payout.tips.toFixed(2),
    payout.bonus.toFixed(2),
    payout.extras.toFixed(2),
    payout.total.toFixed(2),
  ]);

  rows.push([]);
  rows.push(["Tips from report", payout.tips.toFixed(2)]);
  rows.push(["Per hour", payout.perHour.toFixed(4)]);
  rows.push(["Bonus pool", payout.bonus.toFixed(2)]);
  rows.push(["Per person", payout.perPerson.toFixed(2)]);
  if (payout.unallocated !== 0) rows.push(["Not handed out", payout.unallocated.toFixed(2)]);
  if (meta.note.trim()) rows.push([], ["Notes", meta.note.trim()]);

  return toCsv(rows);
}

/** `tips-2026-08-10-to-2026-08-15.csv`, or dated today when the span is unknown. */
export function payoutFilename(from: string | null, to: string | null): string {
  if (from && to && from !== to) return `tips-${from}-to-${to}.csv`;
  return `tips-${from ?? to ?? new Date().toISOString().slice(0, 10)}.csv`;
}
