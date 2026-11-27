/**
 * Reading a payroll PDF and working out whose page is whose.
 *
 * The accountant sends one PDF per pay run with a page per person. Nothing in
 * it is machine-readable — no employee ids, no codes — so the only handle on a
 * page is the name printed on it, and the roster holds short names ("Rissi",
 * "Gabby") rather than the legal names payroll prints ("Marrissia D Bermudez").
 * Everything here is the guessing that closes that gap, kept pure so it can be
 * tested against real pages without a database or a PDF library.
 *
 * The owner always gets the last word: a suggestion is only ever a pre-filled
 * dropdown, and nothing is released until every page has been settled by hand.
 */

/** How a page came to be attached to somebody, weakest last. */
export type MatchSource = "alias" | "exact" | "fuzzy" | "none";

/** Strongest first — used to settle two pages competing for one person. */
const MATCH_RANK: Record<MatchSource, number> = { alias: 3, exact: 2, fuzzy: 1, none: 0 };

export type ParsedPage = {
  /** 1-based, matching the page order in the uploaded file. */
  pageNumber: number;
  /** The name as payroll printed it, or null when no name could be read. */
  payrollName: string | null;
  /** This check's pay and tips, or null when the layout couldn't be read. */
  amounts: CheckAmounts | null;
};

/** The money on one check, before taxes, as the left-hand Wages table prints it. */
export type CheckAmounts = {
  /** The Weekly line's total: regular, overtime and double time together. */
  wages: number;
  /** The Reported Tips line; 0 when the check has none. */
  tips: number;
  /** The Bonus line; 0 when the check has none. */
  bonus: number;
  /** Total hours on the Weekly line, or null if they didn't read cleanly. */
  hours: number | null;
};

export type ParsedPayroll = {
  pages: ParsedPage[];
  /** ISO dates read off the pages; null when the pages didn't carry them. */
  payDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

export type RosterEntry = {
  id: string;
  name: string;
};

/** A payroll name the owner has already tied to somebody, so it is now certain. */
export type PayrollAlias = {
  employeeId: string;
  payrollName: string;
};

export type PageSuggestion = {
  pageNumber: number;
  payrollName: string | null;
  employeeId: string | null;
  match: MatchSource;
};

/* ------------------------------------------------------------------ names */

/** Lowercased, punctuation dropped, whitespace collapsed. */
export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.,'’`-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The name's words with middle initials dropped — "marrissia d bermudez"
 * becomes ["marrissia", "bermudez"]. Payroll prints initials, the roster never
 * does, so they only ever get in the way of a comparison.
 */
function nameParts(value: string): string[] {
  return normalizeName(value)
    .split(" ")
    .filter((part) => part.length > 1);
}

/** Levenshtein distance, capped by returning early once it cannot help. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * True when a short roster name plausibly refers to this payroll word.
 *
 * Two things happen in practice and both have to pass: a shortening that lives
 * inside the longer name ("Rissi" inside "Marrissia"), and a spelling that
 * drifts by a letter or two ("Uddipti" for "Uddhipti"). Anything looser starts
 * handing one person another person's pay.
 */
function looksLikeSameName(rosterWord: string, payrollWord: string): boolean {
  if (rosterWord.length < 3 || payrollWord.length < 3) return false;
  if (payrollWord.includes(rosterWord) || rosterWord.includes(payrollWord)) return true;
  const allowed = Math.min(rosterWord.length, payrollWord.length) >= 6 ? 2 : 1;
  return editDistance(rosterWord, payrollWord) <= allowed;
}

/** The best guess at who a payroll name belongs to, and how sure that is. */
export function matchName(
  payrollName: string,
  roster: RosterEntry[],
  aliases: PayrollAlias[] = [],
): { employeeId: string | null; match: MatchSource } {
  const normalized = normalizeName(payrollName);

  // An alias is a decision the owner already made — it outranks any guessing.
  const alias = aliases.find((entry) => normalizeName(entry.payrollName) === normalized);
  if (alias) return { employeeId: alias.employeeId, match: "alias" };

  const payrollWords = nameParts(payrollName);

  for (const person of roster) {
    const rosterWords = nameParts(person.name);
    if (rosterWords.length === 0) continue;
    // The whole roster name, or its first word standing in for the first name.
    const whole = rosterWords.join(" ") === payrollWords.join(" ");
    const firstName = rosterWords.length === 1 && rosterWords[0] === payrollWords[0];
    if (whole || firstName) return { employeeId: person.id, match: "exact" };
  }

  for (const person of roster) {
    const rosterWords = nameParts(person.name);
    if (rosterWords.length === 0) continue;
    const hit = rosterWords.every((rosterWord) =>
      payrollWords.some((payrollWord) => looksLikeSameName(rosterWord, payrollWord)),
    );
    if (hit) return { employeeId: person.id, match: "fuzzy" };
  }

  return { employeeId: null, match: "none" };
}

/**
 * A suggested owner for every page, with nobody suggested twice.
 *
 * Two pages pointing at one person means at least one of them is wrong, and a
 * wrong assignment here shows somebody else's wages and bank details. The
 * stronger claim keeps the person; the weaker page is handed back unassigned
 * for the owner to settle.
 */
export function suggestAssignments(
  pages: Pick<ParsedPage, "pageNumber" | "payrollName">[],
  roster: RosterEntry[],
  aliases: PayrollAlias[] = [],
): PageSuggestion[] {
  const suggestions: PageSuggestion[] = pages.map((page) => ({
    pageNumber: page.pageNumber,
    payrollName: page.payrollName,
    ...(page.payrollName
      ? matchName(page.payrollName, roster, aliases)
      : { employeeId: null, match: "none" as const }),
  }));

  const claimed = new Map<string, PageSuggestion>();
  for (const suggestion of suggestions) {
    if (!suggestion.employeeId) continue;
    const holder = claimed.get(suggestion.employeeId);
    if (!holder) {
      claimed.set(suggestion.employeeId, suggestion);
      continue;
    }
    const loser =
      MATCH_RANK[suggestion.match] > MATCH_RANK[holder.match] ? holder : suggestion;
    const winner = loser === holder ? suggestion : holder;
    claimed.set(winner.employeeId!, winner);
    loser.employeeId = null;
    loser.match = "none";
  }

  return suggestions;
}

/* ------------------------------------------------------------------ dates */

/** "08/19/26" → "2026-08-19". Null for anything that isn't that shape. */
export function toISODateFromSlashes(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, month, day, year] = match;
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) {
    return null;
  }
  return `20${year}-${month}-${day}`;
}

/**
 * The three dates a pay run carries, told apart by their order.
 *
 * Every page prints the period it covers and the date the cheque is dated, and
 * the cheque is always dated after the period it pays for — so sorted, the
 * dates read: period start, period end, pay date. Fewer than three distinct
 * dates means the layout isn't what we expect, and it is better to leave the
 * fields empty for the owner to fill than to guess wrong on a date.
 */
export function readPayrollDates(dates: string[]): {
  payDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
} {
  const iso = [...new Set(dates.map(toISODateFromSlashes).filter(Boolean) as string[])].sort();
  if (iso.length < 3) {
    return { payDate: iso.at(-1) ?? null, periodStart: null, periodEnd: null };
  }
  return { periodStart: iso[0], periodEnd: iso[1], payDate: iso.at(-1)! };
}

/* --------------------------------------------------------------- the pages */

/** Two to four title-case words — how a person's name reads, and little else. */
const NAME_LINE = /^[A-Z][A-Za-z'’.-]+(?: [A-Z][A-Za-z'’.-]*\.?){1,3}$/;

/** A line printed on nearly every page is a form label, not somebody's name. */
function boilerplateOf(pages: string[][], pageCount: number): Set<string> {
  const appearances = new Map<string, number>();
  for (const lines of pages) {
    for (const line of new Set(lines)) {
      appearances.set(line, (appearances.get(line) ?? 0) + 1);
    }
  }
  const threshold = Math.max(2, Math.ceil(pageCount * 0.8));
  return new Set(
    [...appearances].filter(([, count]) => count >= threshold).map(([line]) => line),
  );
}

/**
 * Whose page is this, read from the text of the page itself.
 *
 * Rather than knowing where payroll prints the name — which changes the moment
 * the accountant changes software — this leans on two things that hold for any
 * layout: the employee's name is the text that repeats most on their own page,
 * and anything printed on every page is a form label rather than a name. The
 * company and the bank are dropped by requiring title case, since those print
 * in capitals.
 */
export function readPayrollName(lines: string[], boilerplate: Set<string>): string | null {
  const counts = new Map<string, number>();
  for (const line of lines) {
    if (boilerplate.has(line)) continue;
    if (line !== line.toUpperCase() && NAME_LINE.test(line)) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;
  // Most repeated wins; ties go to whichever was printed first.
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

/** Everything worth knowing about an uploaded payroll PDF, from its page text. */
export function parsePayrollText(pageTexts: string[]): ParsedPayroll {
  const pages = pageTexts.map((text) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const boilerplate = boilerplateOf(pages, pages.length);

  const dates: string[] = [];
  for (const lines of pages) {
    dates.push(...(lines.join(" ").match(/\b\d{2}\/\d{2}\/\d{2}\b/g) ?? []));
  }

  return {
    pages: pages.map((lines, index) => ({
      pageNumber: index + 1,
      payrollName: readPayrollName(lines, boilerplate),
      amounts: readCheckAmounts(pageTexts[index]),
    })),
    ...readPayrollDates(dates),
  };
}

/* ----------------------------------------------------------------- amounts */

/** "1,944.53" and "128.57" alike; every amount on the check has two decimals. */
const MONEY = /\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2}/g;

function moneyIn(text: string): number[] {
  return (text.match(MONEY) ?? []).map((value) => Number(value.replace(/,/g, "")));
}

/** The last amount on the first line starting with `label`, or 0 when it isn't printed. */
function lineTotal(lines: string[], label: RegExp): number {
  const line = lines.find((entry) => label.test(entry));
  return line ? (moneyIn(line.replace(label, "")).at(-1) ?? 0) : 0;
}

/**
 * This check's pay, tips and bonus, read off the Wages table on the left.
 *
 * The table is printed twice on every page: once for this check, then again
 * for the year to date. Both start with a "Weekly" line, so everything before
 * the second one belongs to this check. On each line the last figure is that
 * row's Total column, which is what has to be read — on the Weekly line the
 * first figure after the label is regular pay only, and overtime sits further
 * along. The figure before the total is the row's total hours.
 *
 * Null when there's no Weekly line at all, which means the layout has changed
 * and a guess would show somebody the wrong pay.
 */
export function readCheckAmounts(pageText: string): CheckAmounts | null {
  const lines = pageText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const weekly = lines.findIndex((line) => /\d\s*Weekly\s+\d/.test(line));
  if (weekly === -1) return null;
  const yearToDate = lines.findIndex(
    (line, index) => index > weekly && /\d\s*Weekly\s+\d/.test(line),
  );
  const thisCheck = yearToDate === -1 ? lines : lines.slice(0, yearToDate);

  const figures = moneyIn(lines[weekly].slice(lines[weekly].indexOf("Weekly")));
  if (figures.length === 0) return null;

  return {
    wages: figures.at(-1)!,
    tips: lineTotal(thisCheck, /^Reported Tips\b/),
    bonus: lineTotal(thisCheck, /^Bonus\b/),
    hours: figures.length >= 2 ? figures.at(-2)! : null,
  };
}

/**
 * Pay, tips and bonus together: what the week earned, before taxes. Not always
 * the check's own Total Pay — older checks leave reported tips out of it.
 */
export function checkTotal(amounts: Pick<CheckAmounts, "wages" | "tips" | "bonus">): number {
  return Math.round((amounts.wages + amounts.tips + amounts.bonus) * 100) / 100;
}

/* ------------------------------------------------------------------- weeks */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days since the epoch for an ISO date, so date maths ignores time zones. */
function dayNumber(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

function isoOfDayNumber(days: number): string {
  return new Date(days * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday of the week an ISO date falls in. */
export function mondayOfISO(iso: string): string {
  const days = dayNumber(iso);
  // 1970-01-01 was a Thursday, so day 0 is three days after a Monday.
  const sinceMonday = (((days + 3) % 7) + 7) % 7;
  return isoOfDayNumber(days - sinceMonday);
}

/** The ISO date `count` days after (or before) another. */
export function addDaysISO(iso: string, count: number): string {
  return isoOfDayNumber(dayNumber(iso) + count);
}

/**
 * The Monday of the week a check pays for.
 *
 * Pay periods run Monday to Sunday, but payroll sometimes prints a start date
 * a day early (Sunday Oct 25 – Sunday Nov 1). So rather than trust the start
 * date, this takes the week the period overlaps most. With no period at all,
 * the week before the pay date is the best guess, since checks are dated
 * after the week they pay for.
 */
export function payWeekOf(stub: {
  payDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}): string | null {
  if (stub.periodStart && stub.periodEnd && stub.periodStart <= stub.periodEnd) {
    const start = dayNumber(stub.periodStart);
    const end = dayNumber(stub.periodEnd);
    let best: { monday: string; overlap: number } | null = null;
    for (
      let monday = mondayOfISO(stub.periodStart);
      monday <= stub.periodEnd;
      monday = addDaysISO(monday, 7)
    ) {
      const first = Math.max(start, dayNumber(monday));
      const last = Math.min(end, dayNumber(monday) + 6);
      const overlap = last - first + 1;
      if (!best || overlap > best.overlap) best = { monday, overlap };
    }
    return best?.monday ?? null;
  }
  if (stub.payDate) return mondayOfISO(addDaysISO(stub.payDate, -7));
  return null;
}

/** "$1,944.53" */
export function formatMoney(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/* ---------------------------------------------------------------- display */

/** "Aug 19, 2026" from an ISO date, in the store's own reading of the day. */
export function formatPayDate(iso: string | null): string {
  if (!iso) return "No date";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
