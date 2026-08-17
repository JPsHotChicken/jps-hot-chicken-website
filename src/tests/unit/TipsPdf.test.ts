import { describe, expect, it } from "vitest";

import { buildTipsPdf, tipsPdfFilename } from "@/lib/tips-pdf";
import { computePayout, type PayoutEntry, type TipsPerson } from "@/lib/tips";

/**
 * jsPDF writes its content streams uncompressed, so the text drawn onto the
 * page can be read straight back out of the output. That is enough to hold the
 * document to what it claims — that the figures on it are the figures it was
 * given, and that nobody is quietly left off it.
 */
async function render(options: {
  people: TipsPerson[];
  entries: PayoutEntry[];
  tips: number;
  bonus?: number;
  note?: string;
}) {
  const payout = computePayout(options.entries, {
    tips: options.tips,
    bonus: options.bonus ?? 0,
  });

  const doc = await buildTipsPdf({
    people: options.people,
    payout,
    period: "Aug 10 – Aug 15, 2026",
    basis: "payable",
    note: options.note ?? "",
    preparedAt: new Date("2026-08-16T12:00:00Z"),
  });

  return { doc, text: doc.output(), payout };
}

function staff(count: number): TipsPerson[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `Employee Number${index}`,
    totalHours: 10,
    payableHours: 10,
    shifts: 3,
    anomalies: [],
  }));
}

const paidEntries = (people: TipsPerson[], extra = 0): PayoutEntry[] =>
  people.map((person) => ({ id: person.id, hours: person.payableHours, included: true, extra }));

describe("the accountant's summary", () => {
  it("is one page", async () => {
    const people = staff(14);
    const { doc } = await render({ people, entries: paidEntries(people), tips: 263.17, bonus: 100 });
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("names every employee being paid", async () => {
    const people = staff(14);
    const { text } = await render({ people, entries: paidEntries(people), tips: 263.17 });

    for (const person of people) expect(text).toContain(person.name);
  });

  it("keeps a large payout on one page without leaving anybody off", async () => {
    const people = staff(34);
    const { doc, text } = await render({
      people,
      entries: paidEntries(people),
      tips: 1840.55,
      bonus: 300,
    });

    expect(doc.getNumberOfPages()).toBe(1);
    for (const person of people) expect(text).toContain(person.name);
    expect(text).not.toContain("more employees");
  });

  it("says so rather than silently dropping people it truly cannot fit", async () => {
    const people = staff(120);
    const { text } = await render({ people, entries: paidEntries(people), tips: 4000 });

    expect(text).toMatch(/more employees/);
    expect(text).toContain("see the CSV export for the complete list");
  });

  it("carries the period, the pools and the total", async () => {
    const people = staff(3);
    const { text } = await render({
      people,
      entries: paidEntries(people, 5),
      tips: 263.17,
      bonus: 100,
    });

    expect(text).toContain("Labor Summary");
    expect(text).toContain("Aug 10");
    expect(text).toContain("263.17"); // tips collected
    expect(text).toContain("100.00"); // bonus pool
    expect(text).toContain("15.00"); // individual bonuses, 3 x $5
    expect(text).toContain("378.17"); // and what they come to
  });

  it("counts individual bonuses in with the bonus pool", async () => {
    const people = staff(3);
    const { text } = await render({
      people,
      entries: paidEntries(people, 5),
      tips: 100,
      bonus: 60,
    });

    // One bonuses figure — the $60 pool and the three $5 awards — rather than
    // the two being presented as separate sources of money.
    expect(text).toContain("BONUSES");
    expect(text).toContain("75.00");
    expect(text).toContain("Add: employer bonuses");
    // With the make-up still spelled out where it is claimed.
    expect(text).toContain("60.00");
    expect(text).toContain("15.00");
    // And the sum against the tips.
    expect(text).toContain("175.00");
  });

  // Parked, not deleted: the basis-of-allocation paragraph is commented out in
  // drawMethod rather than removed, so this is what guards it if it comes back.
  it.skip("states how the money was divided", async () => {
    const people = staff(4);
    const { text } = await render({ people, entries: paidEntries(people), tips: 100, bonus: 40 });

    expect(text).toContain("BASIS OF ALLOCATION");
    expect(text).toContain("payable hours");
    expect(text).toContain("divided equally");
    expect(text).toContain("All amounts in USD");
  });

  it("names anyone left out, so the hours tie back to payroll", async () => {
    const people = staff(3);
    const entries = paidEntries(people);
    entries[2] = { ...entries[2], included: false };

    const { text } = await render({ people, entries, tips: 100 });

    expect(text).toContain("Not included in this distribution");
    expect(text).toContain("Employee Number2");
  });

  it("reconciles, and says when it balances", async () => {
    const people = staff(5);
    const { text } = await render({ people, entries: paidEntries(people), tips: 263.17, bonus: 50 });

    expect(text).toContain("RECONCILIATION");
    expect(text).toContain("Total available for distribution");
    expect(text).toContain("313.17");
    expect(text).toContain("Distributed in full; no residual balance");
  });

  it("flags a payout that does not hand out the whole pool", async () => {
    const people = staff(3);
    // Nobody has any hours, so the tips cannot be split by hour.
    const entries = people.map((person) => ({
      id: person.id,
      hours: 0,
      included: true,
      extra: 0,
    }));

    const { text, payout } = await render({ people, entries, tips: 263.17, bonus: 50 });

    expect(payout.unallocated).toBe(263.17);
    expect(text).toContain("Residual retained, not distributed");
    expect(text).toContain("Does not distribute the full pool");
  });

  it("foots the columns to what was handed out, not to the pools", async () => {
    const people = staff(3);
    const entries = people.map((person) => ({
      id: person.id,
      hours: 0,
      included: true,
      extra: 0,
    }));

    const { text } = await render({ people, entries, tips: 263.17, bonus: 50 });

    // The tips column is all zeroes here, so its total has to be zero too — a
    // footer restating the $263.17 pool under it would not add up. The totals
    // row is the last thing drawn before the reconciliation block.
    const reconciliation = text.indexOf("RECONCILIATION");
    const totalsRow = text.slice(text.lastIndexOf("TOTAL", reconciliation), reconciliation);

    expect(totalsRow).toContain("50.00");
    expect(totalsRow).not.toContain("263.17");
  });

  it("keeps a notes box at the foot of the page whether or not one was typed", async () => {
    const people = staff(3);

    const withNote = await render({
      people,
      entries: paidEntries(people),
      tips: 100,
      note: "Paid out Sunday night",
    });
    expect(withNote.text).toContain("NOTES");
    expect(withNote.text).toContain("Paid out Sunday night");

    // Blank, the box is still there: it is where somebody writes on the printed
    // sheet, and a heading that comes and goes reads as a missing section.
    const without = await render({ people, entries: paidEntries(people), tips: 100 });
    expect(without.text).toContain("NOTES");
  });

  it("still fits one sheet with a full roster and a long note", async () => {
    // The notes card takes real space now, and it is drawn from what the table
    // leaves behind — a busy week with a lot to explain is the worst case.
    const people = staff(34);
    const { doc, text } = await render({
      people,
      entries: paidEntries(people),
      tips: 1840.55,
      bonus: 300,
      note:
        "Paid out in cash Sunday night after close. Sam's Thursday clock-out was corrected by " +
        "hand from 9:12pm to 10:30pm after he forgot to punch, confirmed against the closing " +
        "checklist. Ana's bonus was for covering the Friday dinner rush on her own.",
    });

    expect(doc.getNumberOfPages()).toBe(1);
    expect(text).toContain("NOTES");
    for (const person of people) expect(text).toContain(person.name);
  });

  it("names the file after the period", () => {
    expect(tipsPdfFilename("2026-08-10", "2026-08-15")).toBe(
      "jp-tips-payout-2026-08-10-to-2026-08-15.pdf",
    );
    expect(tipsPdfFilename("2026-08-10", "2026-08-10")).toBe("jp-tips-payout-2026-08-10.pdf");
    expect(tipsPdfFilename(null, null)).toMatch(/^jp-tips-payout-\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});
