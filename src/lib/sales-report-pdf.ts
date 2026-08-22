import type { jsPDF } from "jspdf";

import {
  FIGURE_LABELS,
  accountantFigures,
  formatMoney,
  ownerFigures,
  type Figure,
  type SalesReport,
} from "@/lib/sales-report";

/**
 * The two pages that come off a sales summary.
 *
 * Both are read the same way and neither is worked through: somebody glances at
 * a figure, writes it into a book or a tax form, and moves on. So the whole
 * page is given over to making the numbers unmissable — a handful of figures,
 * set as large as the paper allows, one to a line, with nothing else competing
 * for the eye. There are no tables here and no supporting detail on purpose;
 * the export the figures came from is still on the owner's machine for anyone
 * who wants to check the working.
 *
 * The type is sized against the page rather than fixed, so the accountant's two
 * figures come out roughly twice the height of the owner's five and both pages
 * are as large as they can be. Where a figure is too wide for the paper — a
 * seven-figure week — it steps down until it fits rather than running off the
 * edge.
 */

/** Brand chili red, as RGB for jsPDF. Same palette as the other exports. */
const BRAND: [number, number, number] = [232, 93, 26];
const INK: [number, number, number] = [32, 32, 32];
const MUTED: [number, number, number] = [120, 120, 120];
const HAIRLINE: [number, number, number] = [226, 226, 226];
/** Warm tint behind the one figure on the page that is an instruction. */
const HIGHLIGHT: [number, number, number] = [253, 245, 238];

const MARGIN = 44;

/** Which of the two pages is being built. */
export type ReportKind = "owner" | "accountant";

const TITLES: Record<ReportKind, string> = {
  owner: "Owner's Report",
  accountant: "Accountant Report",
};

/**
 * The figure the owner acts on rather than files. It is the only number on
 * either page that turns into a physical errand, so it is the only one tinted.
 * Taken from the shared labels so the tint cannot drift onto the wrong row if
 * the wording ever changes.
 */
const HIGHLIGHTED = FIGURE_LABELS.totalCash;

/** The figures each page carries, in the order they are printed. */
export function figuresFor(kind: ReportKind, report: SalesReport): Figure[] {
  return kind === "owner" ? ownerFigures(report) : accountantFigures(report);
}

/**
 * The largest size at which `text` still fits `maxWidth`.
 *
 * Stepping down beats wrapping: a dollar figure broken across two lines is
 * harder to read than a smaller one on a single line, and this whole page
 * exists to be read at a glance.
 */
function fitFontSize(doc: jsPDF, text: string, maxWidth: number, start: number): number {
  let size = start;
  doc.setFontSize(size);
  while (size > 10 && doc.getTextWidth(text) > maxWidth) {
    size -= 1;
    doc.setFontSize(size);
  }
  return size;
}

/** Small, spaced capitals — the label above a figure, and the line above that. */
function drawEyebrow(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  size: number,
  color: [number, number, number],
): void {
  doc.setTextColor(...color);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.setCharSpace(size * 0.09);
  doc.text(text.toUpperCase(), x, y);
  doc.setCharSpace(0);
}

/** Everything above the figures: who, what, and — largest of the three — when. */
function drawHeading(doc: jsPDF, kind: ReportKind, report: SalesReport, right: number): number {
  let y = MARGIN + 9;

  if (report.location) {
    drawEyebrow(doc, report.location, MARGIN, y, 9.5, MUTED);
    y += 20;
  }

  drawEyebrow(doc, TITLES[kind], MARGIN, y, 15, BRAND);
  y += 42;

  // The date. Asked for at the top of both pages, and set second only to the
  // figures themselves — a report of the wrong week is worse than no report,
  // and the period is the only thing on the page that says which week it is.
  const period = report.periodLabel || report.period || "";
  if (period) {
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    const size = fitFontSize(doc, period, right - MARGIN, 34);
    doc.text(period, MARGIN, y);
    y += size * 0.36;
  }

  y += 16;
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(2.5);
  doc.line(MARGIN, y, right, y);

  return y;
}

/** Cap height of Helvetica, as a fraction of its point size. */
const CAP_HEIGHT = 0.717;

const LABEL_SIZE = 12.5;

/**
 * One figure, filling the height it has been given.
 *
 * The label sits above the number rather than beside it so the number itself
 * gets the full width of the page, which is what decides how large it can be.
 *
 * The two are then centred in the row *as a pair*, rather than the label being
 * pinned to the top and the figure to the bottom. On the accountant's page,
 * where two figures share a whole sheet, pinning left a hand's width of paper
 * between a label and the number it names — and a label that far from its
 * figure has stopped labelling it.
 */
function drawFigure(
  doc: jsPDF,
  figure: Figure,
  top: number,
  height: number,
  right: number,
  last: boolean,
): void {
  const highlighted = figure.label === HIGHLIGHTED;

  if (highlighted) {
    doc.setFillColor(...HIGHLIGHT);
    doc.rect(MARGIN - 10, top, right - MARGIN + 20, height, "F");
  }

  const value = formatMoney(figure.amount);
  doc.setFont("helvetica", "bold");
  // As large as the row can hold, then as large as the paper can hold — the
  // width is what actually binds once a figure runs past six digits.
  const size = fitFontSize(doc, value, right - MARGIN, Math.min(112, Math.max(30, height * 0.5)));

  const gap = Math.min(18, size * 0.22);
  const groupTop = top + (height - (LABEL_SIZE + gap + size * CAP_HEIGHT)) / 2;

  drawEyebrow(doc, figure.label, MARGIN, groupTop + LABEL_SIZE, LABEL_SIZE, highlighted ? BRAND : MUTED);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(size);
  doc.text(value, MARGIN, groupTop + LABEL_SIZE + gap + size * CAP_HEIGHT);

  if (!last) {
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, top + height, right, top + height);
  }
}

/** Where the figures came from, so the page can be checked against the export. */
function drawFootnote(doc: jsPDF, report: SalesReport, y: number): void {
  const parts = ["Read from the Toast sales summary"];
  if (report.generated) parts.push(`generated ${report.generated}`);

  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setCharSpace(0);
  doc.text(`${parts.join(", ")}.`, MARGIN, y);

  if (report.missing.length > 0) {
    // A figure that could not be found is left off the page entirely, so the
    // page has to say so — otherwise a short report reads like a complete one.
    doc.setTextColor(...BRAND);
    doc.text(`Not found on the export: ${report.missing.join(", ")}.`, MARGIN, y + 11);
  }
}

/** Build one of the two reports. */
export async function buildSalesPdf(kind: ReportKind, report: SalesReport): Promise<jsPDF> {
  // Loaded on demand so jsPDF never ships with the dashboard bundle.
  const { jsPDF: JsPdf } = await import("jspdf");
  const doc = new JsPdf({ unit: "pt", format: "letter", orientation: "portrait" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const right = pageWidth - MARGIN;

  doc.setLineHeightFactor(1.1);

  const headingBottom = drawHeading(doc, kind, report, right);

  const figures = figuresFor(kind, report);
  const footnoteHeight = report.missing.length > 0 ? 34 : 22;
  const top = headingBottom + 14;
  const available = pageHeight - MARGIN - footnoteHeight - top;

  if (figures.length > 0) {
    const height = available / figures.length;
    figures.forEach((figure, index) => {
      drawFigure(doc, figure, top + height * index, height, right, index === figures.length - 1);
    });
  } else {
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text("No figures could be read off the export.", MARGIN, top + 24);
  }

  drawFootnote(doc, report, pageHeight - MARGIN);

  doc.setProperties({
    title: `${TITLES[kind]} — ${report.periodLabel || report.period || ""}`.trim(),
    subject: report.location ?? "JP's Hot Chicken",
  });

  return doc;
}

/** `2026-08-10-to-2026-08-21`, or a single date when the export covers one day. */
function periodSlug(report: SalesReport): string {
  const iso = (value: string): string | null => {
    const [month, day, year] = value.trim().split("/").map(Number);
    if (!month || !day || year == null) return null;
    const full = year < 100 ? 2000 + year : year;
    return `${full}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  const [from, to] = (report.period ?? "").split("-").map((part) => part.trim());
  const start = from ? iso(from) : null;
  const end = to ? iso(to) : null;

  if (start && end && start !== end) return `${start}-to-${end}`;
  return start ?? new Date().toISOString().slice(0, 10);
}

/** `jp-owners-report-2026-08-10-to-2026-08-21.pdf`. */
export function salesPdfFilename(kind: ReportKind, report: SalesReport): string {
  const name = kind === "owner" ? "owners-report" : "accountant-report";
  return `jp-${name}-${periodSlug(report)}.pdf`;
}

/** Build one of the reports and hand it to the browser as a download. */
export async function exportSalesPdf(kind: ReportKind, report: SalesReport): Promise<void> {
  const doc = await buildSalesPdf(kind, report);
  await doc.save(salesPdfFilename(kind, report), { returnPromise: true });
}
