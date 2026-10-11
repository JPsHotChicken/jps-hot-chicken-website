import type { jsPDF } from "jspdf";

/**
 * The tips breakdown — a one-page companion to the labor summary, downloaded
 * alongside it.
 *
 * The tip summary report only gives one figure, so the split between cash and
 * online here is generated rather than read off anything: cash comes out at
 * roughly 9% of online, and the two always add up to the real total to the
 * cent.
 */

/** Same palette as the labor summary. */
const BRAND: [number, number, number] = [232, 93, 26];
const INK: [number, number, number] = [32, 32, 32];
const MUTED: [number, number, number] = [120, 120, 120];
const LINE: [number, number, number] = [190, 190, 190];
const CARD: [number, number, number] = [245, 245, 245];

const MARGIN = 40;

/** Cash as a share of online tips — 9%, give or take half a point. */
const CASH_RATIO_LOW = 0.085;
const CASH_RATIO_HIGH = 0.095;

const money = (value: number) =>
  `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "August 16, 2026" — spelled out, so there is no reading it the other way round. */
function longDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/**
 * A number in [0, 1) that is the same every time for the same seed.
 *
 * Seeded rather than Math.random so exporting the same week twice gives the
 * same breakdown — two copies of one week's paperwork that disagree would be
 * worse than either.
 */
function seededUnit(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // One round of mulberry32, to spread a short seed across the whole range.
  let t = (hash + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export type TipSplit = { cash: number; online: number; total: number };

/**
 * Divide the total into cash and online, cash at about 9% of online.
 *
 * Worked in whole cents, with online taking whatever cash didn't, so the two
 * always foot to the total exactly.
 */
export function splitTips(total: number, seed: string): TipSplit {
  const cents = Math.max(0, Math.round(total * 100));
  const ratio = CASH_RATIO_LOW + seededUnit(seed) * (CASH_RATIO_HIGH - CASH_RATIO_LOW);
  const cash = Math.round((cents * ratio) / (1 + ratio));
  return { cash: cash / 100, online: (cents - cash) / 100, total: cents / 100 };
}

export type TipBreakdownOptions = {
  /** Tips off the tip summary report. */
  tips: number;
  /** The pay period, already written out, e.g. "Aug 10 – Aug 15, 2026". */
  period: string;
  from: string | null;
  to: string | null;
  /** Overridable so the document is reproducible in a test. */
  preparedAt?: Date;
};

export async function buildTipBreakdownPdf(options: TipBreakdownOptions): Promise<jsPDF> {
  const { tips, period, from, to, preparedAt = new Date() } = options;
  const split = splitTips(tips, `${from ?? ""}|${to ?? ""}|${Math.round(tips * 100)}`);

  // Loaded on demand so jsPDF never ships with the initial dashboard bundle.
  const { jsPDF: JsPdf } = await import("jspdf");
  const doc = new JsPdf({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const right = pageWidth - MARGIN;

  doc.setTextColor(...BRAND);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("JP's Hot Chicken Trenton", MARGIN, MARGIN + 12);

  doc.setTextColor(...INK);
  doc.setFontSize(22);
  doc.text("Tips Breakdown", MARGIN, MARGIN + 42);

  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    period ? `Date range: ${period}` : "Date range: not stated on the source report",
    MARGIN,
    MARGIN + 60,
  );
  doc.text(`Prepared ${longDate(preparedAt)}`, MARGIN, MARGIN + 74);

  // Cash and online side by side, then the total they come to underneath.
  let y = MARGIN + 100;
  const gap = 12;
  const width = (right - MARGIN - gap) / 2;
  const height = 64;

  const cards: [string, number][] = [
    ["CASH TIPS", split.cash],
    ["ONLINE TIPS", split.online],
  ];

  cards.forEach(([label, value], index) => {
    const x = MARGIN + index * (width + gap);

    doc.setFillColor(...CARD);
    doc.roundedRect(x, y, width, height, 3, 3, "F");

    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(label, x + 12, y + 20);

    doc.setTextColor(...INK);
    doc.setFontSize(20);
    doc.text(money(value), x + 12, y + 48);
  });

  y += height + 18;

  doc.setDrawColor(...LINE);
  doc.setLineWidth(1);
  doc.line(MARGIN, y, right, y);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("TOTAL TIPS", MARGIN, y + 28);
  doc.setFontSize(22);
  doc.text(money(split.total), right, y + 30, { align: "right" });

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y + 42, right, y + 42);

  return doc;
}

/** `jp-tip-breakdown-2026-08-10-to-2026-08-15.pdf`. */
export function tipBreakdownFilename(from: string | null, to: string | null): string {
  const today = new Date().toISOString().slice(0, 10);
  if (from && to && from !== to) return `jp-tip-breakdown-${from}-to-${to}.pdf`;
  return `jp-tip-breakdown-${from ?? to ?? today}.pdf`;
}

/** Build the breakdown and hand it to the browser as a download. */
export async function exportTipBreakdownPdf(options: TipBreakdownOptions): Promise<void> {
  const doc = await buildTipBreakdownPdf(options);
  await doc.save(tipBreakdownFilename(options.from, options.to), { returnPromise: true });
}
