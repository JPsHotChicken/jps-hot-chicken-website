import type { jsPDF } from "jspdf";

import {
  BAND_POINTS,
  PERIOD_LABELS,
  RATING_MAX,
  formatBands,
  formatTarget,
  sheetFilename,
  type Sheet,
  type SheetPeriod,
  type SheetRow,
} from "@/lib/performance";

/**
 * The sheet that goes on a clipboard.
 *
 * This is the point of the whole feature, so it is built as a form to be
 * written on rather than a printout of something already known. Each row
 * carries its target and its band cutoffs at the left, empty cells across the
 * middle, and G / A / R to circle at the right — everything needed to fill it
 * in and know how it went without the app open.
 *
 * It is also built to survive a black-and-white printer, which is what a
 * restaurant office has. Nothing is distinguished by colour alone: the bands
 * are printed as text on every row, and the circles are lettered.
 */

/** Brand chili red, as RGB for jsPDF. Same palette as the schedule export. */
const BRAND: [number, number, number] = [232, 93, 26];
const INK: [number, number, number] = [32, 32, 32];
const MUTED: [number, number, number] = [120, 120, 120];
const LINE: [number, number, number] = [190, 190, 190];
const HAIRLINE: [number, number, number] = [222, 222, 222];
const BAND_FILL: [number, number, number] = [238, 238, 238];
const ZEBRA: [number, number, number] = [248, 248, 248];

const MARGIN = 26;

/** Two lines of text per row: the name, and the bands under it. */
const ROW_HEIGHT = 26;
const CATEGORY_HEIGHT = 16;
const LABEL_HEIGHT = 15;

/**
 * Rewrite the characters jsPDF's built-in Helvetica cannot draw.
 *
 * That font is WinAnsi-encoded, so anything outside it comes out as mojibake
 * rather than as a missing glyph — `>=` silently becomes `"e` on the printed
 * page. The screen keeps the real symbols, which are better to read; only the
 * PDF is flattened, and only on the way out.
 */
const UNPRINTABLE: Record<string, string> = {
  "\u2265": ">=",
  "\u2264": "<=",
  "\u00b1": "+/-",
  "\u2013": "-",
  "\u2014": "-",
  "\u2212": "-",
  "\u2248": "~",
  "\u2026": "...",
};

const ASCII_ONLY = new RegExp(`[${Object.keys(UNPRINTABLE).join("")}]`, "g");

export const printable = (text: string): string =>
  text.replace(ASCII_ONLY, (char) => UNPRINTABLE[char]);

/** Clip text to `maxWidth`, with an ellipsis when there was more of it. */
function clip(doc: jsPDF, raw: string, maxWidth: number): string {
  const text = printable(raw);
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && doc.getTextWidth(`${clipped}…`) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

type Layout = {
  pageWidth: number;
  pageHeight: number;
  nameX: number;
  nameWidth: number;
  targetX: number;
  targetWidth: number;
  weightX: number;
  weightWidth: number;
  cellsX: number;
  cellWidth: number;
  columns: number;
  gradeX: number;
  gradeWidth: number;
  right: number;
};

/**
 * How wide one write-in cell is.
 *
 * A week's seven columns have to fit across the page, so they are narrow; a
 * single-value sheet has the same space to spend on one box and spends it,
 * because a wide box invites a written note beside the number and a narrow one
 * doesn't.
 */
function cellWidthFor(columns: number): number {
  if (columns === 1) return 92;
  return columns <= 5 ? 40 : 30;
}

function layoutFor(doc: jsPDF, columns: number): Layout {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const right = pageWidth - MARGIN;
  const usable = right - MARGIN;

  const cellWidth = cellWidthFor(columns);
  const gradeWidth = 52;
  const weightWidth = 26;
  const targetWidth = 60;
  // Whatever is left goes to the metric name, which carries two lines of text
  // and is the only column that can usefully absorb the slack.
  const nameWidth = usable - cellWidth * columns - gradeWidth - weightWidth - targetWidth;

  const targetX = MARGIN + nameWidth;
  const weightX = targetX + targetWidth;
  const cellsX = weightX + weightWidth;

  return {
    pageWidth,
    pageHeight,
    nameX: MARGIN,
    nameWidth,
    targetX,
    targetWidth,
    weightX,
    weightWidth,
    cellsX,
    cellWidth,
    columns,
    gradeX: cellsX + cellWidth * columns,
    gradeWidth,
    right,
  };
}

/** The masthead: who the sheet is for, and the period it covers. */
function drawTitle(doc: jsPDF, sheet: Sheet, layout: Layout, y: number): number {
  doc.setTextColor(...BRAND);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("JP'S HOT CHICKEN — PERFORMANCE SHEET", MARGIN, y + 8);

  doc.setTextColor(...INK);
  doc.setFontSize(17);
  doc.text(clip(doc, sheet.title, layout.right - MARGIN - 150), MARGIN, y + 27);

  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(clip(doc, sheet.subtitle, layout.right - MARGIN - 150), MARGIN, y + 39);

  // The period box is deliberately empty. The sheet knows it covers a week; it
  // has no business guessing which one, and a wrong date printed on a form is
  // worse than a blank asking for the right one.
  const boxWidth = 138;
  const boxX = layout.right - boxWidth;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.rect(boxX, y + 4, boxWidth, 30);

  doc.setTextColor(...MUTED);
  doc.setFontSize(6.5);
  doc.text(`${PERIOD_LABELS[sheet.period].toUpperCase()} STARTING`, boxX + 6, y + 14);
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.5);
  doc.line(boxX + 6, y + 28, boxX + boxWidth - 6, y + 28);

  return y + 48;
}

/**
 * The scoring key.
 *
 * Printed on every sheet because the arithmetic is done by hand at the end of
 * the week, by whoever is holding it, and a rule that lives in the app is a
 * rule that gets guessed at on paper.
 */
function drawKey(doc: jsPDF, sheet: Sheet, layout: Layout, y: number): number {
  const height = 20;
  doc.setFillColor(...ZEBRA);
  doc.rect(MARGIN, y, layout.right - MARGIN, height, "F");

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("HOW TO SCORE", MARGIN + 5, y + 8);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.setFontSize(6.8);
  doc.text(
    "Write the number, then circle G, A or R against the bands on that row.",
    MARGIN + 5,
    y + 16,
  );
  doc.text(
    printable(
      `G = ${BAND_POINTS.green}   A = ${BAND_POINTS.amber}   R = ${BAND_POINTS.red}` +
        `   ·   Score = sum of (points × weight) ÷ ${sheet.totalWeight || 1} total weight`,
    ),
    MARGIN + 250,
    y + 12,
  );

  return y + height + 6;
}

/** The column headings, repeated at the top of every page of a long sheet. */
function drawHeader(doc: jsPDF, sheet: Sheet, layout: Layout, y: number): number {
  doc.setFillColor(...INK);
  doc.rect(MARGIN, y, layout.right - MARGIN, LABEL_HEIGHT, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);

  const baseline = y + LABEL_HEIGHT / 2 + 2.7;
  doc.text("METRIC", layout.nameX + 4, baseline);
  doc.text("TARGET", layout.targetX + 3, baseline);
  doc.text("WT", layout.weightX + layout.weightWidth / 2, baseline, { align: "center" });

  sheet.columns.forEach((label, index) => {
    doc.text(
      printable(label.toUpperCase()),
      layout.cellsX + index * layout.cellWidth + layout.cellWidth / 2,
      baseline,
      { align: "center" },
    );
  });

  doc.text("G  A  R", layout.gradeX + layout.gradeWidth / 2, baseline, { align: "center" });

  return y + LABEL_HEIGHT;
}

/** The vertical rules that turn one row into separate boxes. */
function drawGrid(doc: jsPDF, layout: Layout, y: number, height: number): void {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.6);
  for (const x of [layout.targetX, layout.weightX, layout.cellsX, layout.gradeX, layout.right]) {
    doc.line(x, y, x, y + height);
  }
  doc.line(MARGIN, y, MARGIN, y + height);
}

/** The rules between one row's write-in cells, skipped when the row is merged. */
function drawCellRules(doc: jsPDF, layout: Layout, row: SheetRow, y: number, height: number) {
  if (row.merged) return;
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.5);
  for (let column = 1; column < layout.columns; column++) {
    const x = layout.cellsX + column * layout.cellWidth;
    doc.line(x, y + 3, x, y + height - 3);
  }
}

/** An empty tick box, for the pass/fail rows. */
function drawCheckbox(doc: jsPDF, x: number, y: number, size = 8): void {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.7);
  doc.rect(x, y, size, size);
}

/**
 * What goes inside a row's write-in area before anyone writes on it.
 *
 * Most rows get nothing — an empty box is the clearest possible prompt for a
 * number. Pass/fail rows get boxes to tick, because "Y" and "N" written by four
 * different people are four different marks to read back.
 */
function drawCells(doc: jsPDF, layout: Layout, row: SheetRow, y: number, height: number): void {
  if (row.metric.type !== "pass_fail") return;

  const middle = y + height / 2;

  if (row.merged) {
    const x = layout.cellsX + 8;
    drawCheckbox(doc, x, middle - 4);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Pass", x + 11, middle + 2.4);

    const failX = x + 38;
    drawCheckbox(doc, failX, middle - 4);
    doc.text("Fail", failX + 11, middle + 2.4);
    return;
  }

  for (let column = 0; column < layout.columns; column++) {
    const centre = layout.cellsX + column * layout.cellWidth + layout.cellWidth / 2;
    drawCheckbox(doc, centre - 4, middle - 4);
  }
}

/** The three lettered circles to ring at the end of a row. */
function drawGrades(doc: jsPDF, layout: Layout, y: number, height: number): void {
  const middle = y + height / 2;
  const radius = 6;
  const gap = 15;
  const start = layout.gradeX + layout.gradeWidth / 2 - gap;

  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);

  ["G", "A", "R"].forEach((letter, index) => {
    const x = start + index * gap;
    doc.circle(x, middle, radius);
    doc.text(letter, x, middle + 2.4, { align: "center" });
  });
}

/** One metric's row. */
function drawRow(doc: jsPDF, layout: Layout, row: SheetRow, y: number, zebra: boolean): void {
  const { metric } = row;

  if (zebra) {
    doc.setFillColor(...ZEBRA);
    doc.rect(MARGIN, y, layout.right - MARGIN, ROW_HEIGHT, "F");
  }

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(clip(doc, metric.name, layout.nameWidth - 8), layout.nameX + 4, y + 11);

  // The bands ride under the name. This is the line that makes the sheet work
  // away from a screen: it is what turns a number just written down into a
  // judgement about the number, without anybody having to remember the target.
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  const bands = formatBands(metric);
  const tags = [
    metric.lagging ? "lagging" : "leading",
    metric.type === "rating" ? `1-${RATING_MAX}` : metric.unit.trim(),
  ].filter(Boolean);
  doc.text(
    clip(doc, [bands, tags.join(" · ")].filter(Boolean).join("   ·   "), layout.nameWidth - 8),
    layout.nameX + 4,
    y + 20,
  );

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    clip(doc, formatTarget(metric), layout.targetWidth - 6),
    layout.targetX + 3,
    y + ROW_HEIGHT / 2 + 2.8,
  );

  doc.setTextColor(...MUTED);
  doc.setFontSize(7.5);
  doc.text(
    String(metric.weight),
    layout.weightX + layout.weightWidth / 2,
    y + ROW_HEIGHT / 2 + 2.6,
    { align: "center" },
  );

  drawCells(doc, layout, row, y, ROW_HEIGHT);
  drawCellRules(doc, layout, row, y, ROW_HEIGHT);
  drawGrades(doc, layout, y, ROW_HEIGHT);
  drawGrid(doc, layout, y, ROW_HEIGHT);

  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y + ROW_HEIGHT, layout.right, y + ROW_HEIGHT);
}

/** The totals box and the ruled lines under it. */
function drawFooter(doc: jsPDF, layout: Layout, y: number): number {
  const height = 34;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.rect(MARGIN, y, layout.right - MARGIN, height);

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("TOTALS", MARGIN + 6, y + 12);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.setFontSize(7.5);

  const rule = (label: string, x: number, width: number) => {
    doc.text(label, x, y + 26);
    const from = x + doc.getTextWidth(label) + 4;
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.5);
    doc.line(from, y + 27, x + width, y + 27);
  };

  rule("Greens", MARGIN + 6, 72);
  rule("Ambers", MARGIN + 90, 72);
  rule("Reds", MARGIN + 174, 66);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.setFontSize(8.5);
  const scoreX = layout.right - 168;
  doc.text("WEIGHTED SCORE", scoreX, y + 12);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.rect(scoreX, y + 16, 64, 14);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.setFontSize(7.5);
  doc.text("/ 100", scoreX + 70, y + 26);

  doc.text("Reviewed by", scoreX + 100, y + 26);
  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.5);
  doc.line(scoreX + 138, y + 27, layout.right - 6, y + 27);

  return y + height;
}

/** Two ruled lines for whatever the numbers didn't capture. */
function drawNotes(doc: jsPDF, layout: Layout, y: number): number {
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("NOTES", MARGIN, y + 10);

  doc.setDrawColor(...HAIRLINE);
  doc.setLineWidth(0.5);
  doc.line(MARGIN + 32, y + 11, layout.right, y + 11);
  doc.line(MARGIN, y + 25, layout.right, y + 25);

  return y + 30;
}

/** Draw one sheet, starting on the current page. */
function drawSheet(doc: jsPDF, sheet: Sheet): void {
  const layout = layoutFor(doc, sheet.columns.length);
  const bottom = layout.pageHeight - MARGIN - 12;

  let y = drawTitle(doc, sheet, layout, MARGIN);
  y = drawKey(doc, sheet, layout, y);
  y = drawHeader(doc, sheet, layout, y);
  let zebra = false;

  const newPage = () => {
    doc.addPage();
    y = drawHeader(doc, sheet, layout, MARGIN);
    zebra = false;
  };

  if (sheet.metricCount === 0) {
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      "No metrics are assigned here yet — assign some in the builder, then print again.",
      MARGIN + 6,
      y + 20,
    );
    y += 34;
  }

  for (const group of sheet.groups) {
    // Never leave a section heading stranded at the foot of a page.
    if (y + CATEGORY_HEIGHT + ROW_HEIGHT > bottom) newPage();

    doc.setFillColor(...BAND_FILL);
    doc.rect(MARGIN, y, layout.right - MARGIN, CATEGORY_HEIGHT, "F");

    const baseline = y + CATEGORY_HEIGHT / 2 + 3.2;
    const heading = printable(group.category.toUpperCase());
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.text(heading, MARGIN + 4, baseline);
    // Measured while the heading's own font is still set — `getTextWidth` reads
    // whatever font is current, so taking this after the switch to the smaller
    // one puts the count on top of the heading it is meant to follow.
    const headingWidth = doc.getTextWidth(heading);

    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(
      `${group.rows.length} metric${group.rows.length === 1 ? "" : "s"}`,
      MARGIN + 10 + headingWidth,
      baseline,
    );

    drawGrid(doc, layout, y, CATEGORY_HEIGHT);
    y += CATEGORY_HEIGHT;

    for (const row of group.rows) {
      // The footer has to fit under the last row, or the totals box lands on a
      // page of its own with nothing to total.
      if (y + ROW_HEIGHT > bottom) newPage();
      drawRow(doc, layout, row, y, zebra);
      zebra = !zebra;
      y += ROW_HEIGHT;
    }
  }

  if (y + 70 > bottom) newPage();
  y = drawFooter(doc, layout, y + 8);
  drawNotes(doc, layout, y + 4);
}

export type PerformancePdfOptions = {
  sheets: readonly Sheet[];
  /** Fixed by the tests; defaults to now. */
  preparedAt?: Date;
};

/** Build the sheets, one starting on each new page. */
export async function buildPerformancePdf(options: PerformancePdfOptions): Promise<jsPDF> {
  const { sheets, preparedAt = new Date() } = options;
  // Loaded on demand so jsPDF never ships with the initial dashboard bundle.
  const { jsPDF: JsPdf } = await import("jspdf");

  const doc = new JsPdf({ orientation: "portrait", unit: "pt", format: "letter" });

  if (sheets.length === 0) {
    doc.setFontSize(11);
    doc.text("There is nothing to print yet.", MARGIN, MARGIN + 20);
    return doc;
  }

  sheets.forEach((sheet, index) => {
    if (index > 0) doc.addPage();
    drawSheet(doc, sheet);
  });

  const stamp = preparedAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text(`Printed ${stamp}`, MARGIN, height - MARGIN + 4);
    doc.text(`Page ${page} of ${pages}`, width - MARGIN, height - MARGIN + 4, { align: "right" });
  }

  return doc;
}

/** Build the sheets and hand them to the browser as a download. */
export async function exportPerformancePdf(
  sheets: readonly Sheet[],
  period: SheetPeriod,
): Promise<void> {
  const doc = await buildPerformancePdf({ sheets });
  await doc.save(sheetFilename(sheets, period), { returnPromise: true });
}
