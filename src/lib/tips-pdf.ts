import type { jsPDF } from "jspdf";

import {
  HOURS_BASIS_LABELS,
  formatHours,
  type HoursBasis,
  type Payout,
  type PayoutShare,
  type TipsPerson,
} from "@/lib/tips";

/**
 * The one-page payout summary — the thing that goes to the accountant.
 *
 * It is a record of a cash distribution rather than a working sheet, so it is
 * built to answer the questions somebody outside the business will ask of it:
 * where the money came from, how it was divided, who received it, and whether
 * it adds up. That last one is why the reconciliation block is there at all —
 * cash going out with no paper behind it is exactly what an accountant has to
 * chase, and a total that proves itself saves the phone call.
 *
 * One page is the point. Everything is measured against the space left on the
 * sheet and the rows tighten to fit, rather than the document quietly running
 * onto a second page nobody prints.
 */

/** Brand chili red, as RGB for jsPDF. Same palette as the other exports. */
const BRAND: [number, number, number] = [232, 93, 26];
const INK: [number, number, number] = [32, 32, 32];
const MUTED: [number, number, number] = [120, 120, 120];
const LINE: [number, number, number] = [190, 190, 190];
const HAIRLINE: [number, number, number] = [226, 226, 226];
const ZEBRA: [number, number, number] = [247, 247, 247];
const CARD: [number, number, number] = [245, 245, 245];
/** Warm tint for the notes card, so it is not read as another figures card. */
const NOTE_CARD: [number, number, number] = [253, 245, 238];

const MARGIN = 40;

/**
 * Rows stretch to use the page and tighten when there are a lot of them.
 *
 * The ceiling stops a short payout from becoming a widely spaced list. The
 * floor is set low deliberately: this is a financial document, and a tight row
 * that keeps every employee on it beats a comfortable one that leaves people
 * off. At the floor a payout of around forty still fits a single page, which is
 * past anything this business runs.
 */
const MAX_ROW_HEIGHT = 26;
const MIN_ROW_HEIGHT = 8;

/** Type that stays legible at the row height it is set in. */
function fontForRow(rowHeight: number): number {
  if (rowHeight >= 16) return 9;
  if (rowHeight >= 13) return 8;
  if (rowHeight >= 10) return 7.2;
  return 6.6;
}

type Column = {
  label: string;
  width: number;
  align: "left" | "right";
};

/**
 * The table's columns, in order.
 *
 * The money columns are right-aligned and the widths are fixed rather than
 * proportional, because a column of figures that shifts position between rows
 * is unreadable — and these are read by someone adding them up.
 *
 * There are two money columns and no more: what the guests tipped the employee
 * and what the employer added on top. How a bonus was arrived at — a share of
 * the pool, an individual award, or both — is a matter of method rather than of
 * payment, so it is stated once in the basis paragraph instead of being carried
 * as columns the reader has to add across.
 */
const COLUMNS: Column[] = [
  { label: "EMPLOYEE", width: 220, align: "left" },
  { label: "SHIFTS", width: 50, align: "right" },
  { label: "HOURS", width: 66, align: "right" },
  { label: "TIPS", width: 98, align: "right" },
  { label: "BONUSES", width: 98, align: "right" },
];

const amount = (value: number) =>
  value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Every figure on the page is money, and every one of them says so. */
const money = (value: number) => `$${amount(value)}`;

/** Clip text to `maxWidth`, with an ellipsis when there was more of it. */
function clip(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && doc.getTextWidth(`${clipped}…`) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

/** "August 16, 2026" — spelled out, so there is no reading it the other way round. */
function longDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Where each column starts, left to right. */
function columnEdges(): number[] {
  const edges: number[] = [];
  let x = MARGIN;
  for (const column of COLUMNS) {
    edges.push(x);
    x += column.width;
  }
  return edges;
}

/** Draw one row of cells against the column grid. */
function drawRow(doc: jsPDF, cells: string[], y: number, height: number, pad = 5): void {
  const edges = columnEdges();
  const baseline = y + height / 2 + doc.getFontSize() * 0.35;

  cells.forEach((text, index) => {
    const column = COLUMNS[index];
    const x = edges[index];
    if (column.align === "right") {
      doc.text(text, x + column.width - pad, baseline, { align: "right" });
    } else {
      doc.text(clip(doc, text, column.width - pad * 2), x + pad, baseline);
    }
  });
}

export type TipsPdfOptions = {
  people: readonly TipsPerson[];
  payout: Payout;
  /** The pay period, already written out, e.g. "Aug 10 – Aug 15, 2026". */
  period: string;
  basis: HoursBasis;
  note: string;
  /** Overridable so the document is reproducible in a test. */
  preparedAt?: Date;
};

/** The masthead. Returns the y to carry on from. */
function drawTitle(doc: jsPDF, options: TipsPdfOptions, right: number): number {
  const { period, payout, preparedAt = new Date() } = options;

  // Named with the location: there is more than one store, and a cash payout
  // record has to say which one's employees it accounts for.
  doc.setTextColor(...BRAND);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("JP's Hot Chicken Trenton", MARGIN, MARGIN + 12);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Labor Summary", MARGIN, MARGIN + 28);

  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    period ? `Pay period: ${period}` : "Pay period: not stated on the source report",
    MARGIN,
    MARGIN + 41,
  );
  doc.text(`Prepared ${longDate(preparedAt)}`, MARGIN, MARGIN + 52);

  // The figure the whole page exists to support, set where the eye lands first.
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("TOTAL DISTRIBUTED", right, MARGIN + 14, { align: "right" });

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.text(money(payout.total), right, MARGIN + 34, { align: "right" });

  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    `${payout.people} ${payout.people === 1 ? "employee" : "employees"} · ${formatHours(payout.hours)} hours`,
    right,
    MARGIN + 48,
    { align: "right" },
  );

  return MARGIN + 68;
}

/**
 * Where the money came from, across the page.
 *
 * Two cards, because there are only two kinds of money here however many ways
 * it is divided: what the guests tipped, and what the employer added. The
 * split between the shared pool and the individual awards is a detail of the
 * second, so it rides underneath it rather than standing as a third source.
 *
 * The total they come to is already the figure at the top of the page, so no
 * card repeats it — the reconciliation is where the sum gets proved.
 */
function drawCards(doc: jsPDF, payout: Payout, y: number, right: number): number {
  const breakdown =
    payout.extras > 0
      ? `Employer funded — ${money(payout.bonus)} shared, ${money(payout.extras)} individual`
      : "Employer funded, split evenly";

  const cards: [string, string, string][] = [
    ["TIPS COLLECTED", money(payout.tips), "Guest tips, per POS report"],
    ["BONUSES", money(payout.bonuses), breakdown],
  ];

  const height = 46;
  const gap = 10;
  const width = (right - MARGIN - gap * (cards.length - 1)) / cards.length;

  cards.forEach(([label, value, hint], index) => {
    const x = MARGIN + index * (width + gap);

    doc.setFillColor(...CARD);
    doc.roundedRect(x, y, width, height, 3, 3, "F");

    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(label, x + 8, y + 13);

    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(clip(doc, value, width - 16), x + 8, y + 30);

    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(hint, x + 8, y + 40);
  });

  return y + height + 16;
}

/** How the money was divided, in a sentence somebody can check the table against. */
function drawMethod(doc: jsPDF, options: TipsPdfOptions, y: number, right: number): number {
  const { payout, basis } = options;

  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y, right, y);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  //doc.text("BASIS OF ALLOCATION", MARGIN, y + 14);

  const rate = payout.perHour > 0 ? `$${payout.perHour.toFixed(4)} per hour` : "not distributed";
  const headcount = `${payout.people} ${payout.people === 1 ? "employee" : "employees"}`;

  // The per-person figures are deliberately not quoted as exact amounts: both
  // pools are apportioned to whole cents, so individual shares differ by up to
  // a penny from the arithmetic mean. The table carries the amounts actually
  // paid, and it is those that sum to the pool.
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  // Wrapped rather than clipped: this is the paragraph that explains how the
  // table was arrived at, and half of it is worse than none.
  // const lines: string[] = [
  //   `Tips were pooled and allocated in proportion to ${HOURS_BASIS_LABELS[basis].toLowerCase()} worked (${rate}).`,
  //   `The bonus pool was divided equally between the ${headcount} paid, regardless of hours worked.`,
  //   "Individual bonuses were awarded to named employees, and are included in that employee's bonuses figure.",
  //   "Pool shares are apportioned to whole cents, so equal shares may differ by $0.01. All amounts in USD.",
  // ].flatMap((line) => doc.splitTextToSize(line, right - MARGIN) as string[]);

  // lines.forEach((line, index) => {
  //   doc.text(line, MARGIN, y + 26 + index * 10);
  // });

  return y;//+ 26 + lines.length * 10 + 6;
}

/** The column headings, on their dark band. */
function drawTableHead(doc: jsPDF, y: number, right: number): number {
  const height = 16;

  doc.setFillColor(...INK);
  doc.rect(MARGIN, y, right - MARGIN, height, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  drawRow(doc, COLUMNS.map((column) => column.label), y, height);

  return y + height;
}

/**
 * How tall the reconciliation block is, needed before it can be drawn: the
 * table above it is sized from whatever space it leaves behind.
 */
function reconciliationHeight(payout: Payout): number {
  return payout.unallocated === 0 ? 68 : 78;
}

/**
 * The note is the one part of the page nobody else can reconstruct.
 *
 * Everything above it is arithmetic that can be re-derived from the source
 * reports; the note is where whoever ran the payout says what happened — who
 * was paid late, why somebody's hours look wrong, what was agreed. Set as a
 * grey footnote it gets skipped, so it gets a card of its own, a warm ground
 * against the grey ones, a brand rule down its edge, and body type larger than
 * anything else on the sheet.
 */
const NOTE_LINE_HEIGHT = 13;
const NOTE_FONT_SIZE = 9.5;
const MAX_NOTE_LINES = 4;

/** Height of the notes block including the gap above it; zero when there is no note. */
function notesHeight(lines: readonly string[]): number {
  return lines.length > 0 ? 41 + lines.length * NOTE_LINE_HEIGHT : 0;
}

function drawNotes(doc: jsPDF, lines: readonly string[], y: number, right: number): number {
  const top = y + 10;
  const height = notesHeight(lines) - 10;

  doc.setFillColor(...NOTE_CARD);
  doc.roundedRect(MARGIN, top, right - MARGIN, height, 3, 3, "F");

  // Inside the rounded corners, so the rule sits on the card's straight edge.
  doc.setFillColor(...BRAND);
  doc.rect(MARGIN, top + 3, 3, height - 6, "F");

  doc.setTextColor(...BRAND);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("NOTES", MARGIN + 16, top + 18);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(NOTE_FONT_SIZE);
  lines.forEach((line, index) => {
    doc.text(line, MARGIN + 16, top + 35 + index * NOTE_LINE_HEIGHT);
  });

  return top + height;
}

/**
 * The block that proves the page adds up.
 *
 * Written as a sum rather than a set of figures so it can be read straight
 * down: what came in on the left, what went out on the right, and a line
 * saying whether they agree.
 */
function drawReconciliation(
  doc: jsPDF,
  payout: Payout,
  y: number,
  right: number,
): number {
  const balanced = payout.unallocated === 0;
  const height = reconciliationHeight(payout);

  doc.setFillColor(...CARD);
  doc.roundedRect(MARGIN, y, right - MARGIN, height, 3, 3, "F");

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("RECONCILIATION", MARGIN + 10, y + 15);

  // Bonuses are one line with their make-up spelled out, rather than two
  // additions that have to be recognised as the same kind of money.
  const rows: [string, number][] = [
    ["Tips collected per POS report", payout.tips],
    [
      payout.extras > 0
        ? `Add: employer bonuses (${money(payout.bonus)} shared, ${money(payout.extras)} individual)`
        : "Add: employer bonuses",
      payout.bonuses,
    ],
  ];

  // The left column is a sum, so it is set out as one: the parts, a rule, and
  // the figure they come to. What the right column then claims was paid out has
  // something to be checked against.
  const labelX = MARGIN + 10;
  const valueX = MARGIN + 280;
  // Labels are clipped short of the figures rather than allowed to run into
  // them: the bonuses line carries its make-up and so grows with the money.
  const labelWidth = valueX - labelX - 44;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  rows.forEach(([label, value], index) => {
    const lineY = y + 30 + index * 11;
    doc.setTextColor(...MUTED);
    doc.text(clip(doc, label, labelWidth), labelX, lineY);
    doc.setTextColor(...INK);
    doc.text(money(value), valueX, lineY, { align: "right" });
  });

  const ruleY = y + 30 + rows.length * 11 - 7;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.6);
  doc.line(labelX, ruleY, valueX, ruleY);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Total available for distribution", labelX, ruleY + 12);
  doc.text(money(payout.tips + payout.bonuses), valueX, ruleY + 12, { align: "right" });

  // The claim being made, against the sum on the left.
  const claimX = MARGIN + 320;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Total distributed to employees", claimX, y + 36);
  doc.text(money(payout.total), right - 10, y + 36, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(
    balanced
      ? "Distributed in full; no residual balance."
      : `Residual retained, not distributed: ${money(payout.unallocated)}.`,
    claimX,
    y + 50,
  );

  if (!balanced) {
    doc.setTextColor(...BRAND);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text("Does not distribute the full pool.", claimX, y + 63);
  }

  return y + height;
}

/**
 * Build the summary.
 *
 * Rows are sized from the space actually left once the fixed furniture is
 * placed, so a payout of eight and a payout of thirty both come out as one
 * sheet. Past what the smallest row can fit, the list is truncated with a line
 * saying so — a page that silently dropped employees would be worse than one
 * that admits it, and the CSV export carries the complete list.
 */
export async function buildTipsPdf(options: TipsPdfOptions): Promise<jsPDF> {
  const { people, payout, note } = options;
  // Loaded on demand so jsPDF never ships with the initial dashboard bundle.
  const { jsPDF: JsPdf } = await import("jspdf");

  const doc = new JsPdf({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const right = pageWidth - MARGIN;

  const shares = new Map(payout.shares.map((share) => [share.id, share]));
  const paid = people.filter((person) => shares.get(person.id)?.included);
  const excluded = people.filter((person) => !shares.get(person.id)?.included);

  // The totals row foots the columns above it rather than restating the pools.
  // The two are the same whenever the money all went out, and when it didn't —
  // nobody with any hours, so the tips could not be split — a footer showing
  // the pool under a column of zeroes is the first thing that would be queried.
  // The pools are still on the page, in the cards and the reconciliation.
  const sum = (of: (share: PayoutShare) => number) =>
    Math.round(paid.reduce((total, person) => total + of(shares.get(person.id)!), 0) * 100) / 100;

  const distributed = {
    tips: sum((share) => share.tipShare),
    bonuses: sum((share) => share.bonuses),
  };

  let y = drawTitle(doc, options, right);
  y = drawCards(doc, payout, y, right);
  y = drawMethod(doc, options, y, right);
  y = drawTableHead(doc, y, right);

  // Everything below the table has to be placed before the rows can be sized:
  // the totals line, the reconciliation block, the notes and the footer are
  // fixed costs, and what is left over is what the list has to fit into.
  // Wrapped at the size it will be drawn at — splitTextToSize measures in
  // whatever font is current, and the table head above left it at 7pt bold.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(NOTE_FONT_SIZE);
  const noteLines: string[] = note.trim()
    ? (doc.splitTextToSize(note.trim(), right - MARGIN - 32) as string[]).slice(0, MAX_NOTE_LINES)
    : [];
  const noteBlock = notesHeight(noteLines);
  const excludedHeight = excluded.length > 0 ? 22 : 0;
  const totalsHeight = 20;
  const footerHeight = 26;

  const available =
    pageHeight -
    MARGIN -
    footerHeight -
    noteBlock -
    excludedHeight -
    reconciliationHeight(payout) -
    12 -
    totalsHeight -
    y;

  const rowHeight =
    paid.length > 0
      ? Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, available / paid.length))
      : MAX_ROW_HEIGHT;
  const fits = Math.max(0, Math.floor(available / rowHeight));
  const listed = paid.slice(0, fits);
  const dropped = paid.length - listed.length;

  listed.forEach((person, index) => {
    const share = shares.get(person.id)!;

    if (index % 2 === 1) {
      doc.setFillColor(...ZEBRA);
      doc.rect(MARGIN, y, right - MARGIN, rowHeight, "F");
    }

    doc.setTextColor(...INK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontForRow(rowHeight));

    drawRow(
      doc,
      [
        person.name,
        person.manual ? "—" : String(person.shifts),
        formatHours(share.hours),
        money(share.tipShare),
        money(share.bonuses),
      ],
      y,
      rowHeight,
    );

    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y + rowHeight, right, y + rowHeight);

    y += rowHeight;
  });

  if (dropped > 0) {
    doc.setTextColor(...BRAND);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.text(
      `+ ${dropped} more ${dropped === 1 ? "employee" : "employees"} — see the CSV export for the complete list.`,
      MARGIN + 5,
      y + 11,
    );
    y += 16;
  }

  // Totals.
  doc.setDrawColor(...LINE);
  doc.setLineWidth(1);
  doc.line(MARGIN, y, right, y);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  drawRow(
    doc,
    [
      `TOTAL — ${payout.people} ${payout.people === 1 ? "employee" : "employees"}`,
      "",
      formatHours(payout.hours),
      money(distributed.tips),
      money(distributed.bonuses),
    ],
    y,
    totalsHeight,
  );
  y += totalsHeight;

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y, right, y);
  y += 12;

  y = drawReconciliation(doc, payout, y, right);

  // Anyone on the time report who was not paid from this pot. Without this the
  // hours here won't tie back to payroll, and the difference looks like an error.
  if (excluded.length > 0) {
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(
      clip(
        doc,
        `Not included in this distribution: ${excluded.map((person) => person.name).join(", ")}.`,
        right - MARGIN,
      ),
      MARGIN,
      y + 14,
    );
    y += excludedHeight;
  }

  if (noteLines.length > 0) {
    y = drawNotes(doc, noteLines, y, right);
  }

  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(
    "Prepared from time clock and point-of-sale reports. Tips distributed to employees in cash.",
    MARGIN,
    pageHeight - MARGIN + 6,
  );

  return doc;
}

/** `jp-tips-payout-2026-08-10-to-2026-08-15.pdf`. */
export function tipsPdfFilename(from: string | null, to: string | null): string {
  const today = new Date().toISOString().slice(0, 10);
  if (from && to && from !== to) return `jp-tips-payout-${from}-to-${to}.pdf`;
  return `jp-tips-payout-${from ?? to ?? today}.pdf`;
}

/** Build the summary and hand it to the browser as a download. */
export async function exportTipsPdf(
  options: TipsPdfOptions & { from: string | null; to: string | null },
): Promise<void> {
  const doc = await buildTipsPdf(options);
  await doc.save(tipsPdfFilename(options.from, options.to), { returnPromise: true });
}
