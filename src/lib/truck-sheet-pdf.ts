import type { jsPDF } from "jspdf";

import {
  compareItems,
  formatOrderDate,
  groupByCategory,
  todayISO,
  type TruckItem,
} from "@/lib/truck";

/**
 * The blank count sheet — the thing that goes on a clipboard.
 *
 * One row per item and several undated columns beside it, so a single printed
 * page covers several weeks: write the date at the top of the next empty
 * column, walk the walk-in, fill in quantities. It is deliberately a blank
 * form rather than a printout of an order on screen; what it is for is the
 * counting that happens before there is an order at all.
 */

/** Brand chili red, as RGB for jsPDF. Same palette as the schedule export. */
const BRAND: [number, number, number] = [232, 93, 26];
const INK: [number, number, number] = [32, 32, 32];
const MUTED: [number, number, number] = [120, 120, 120];
const LINE: [number, number, number] = [190, 190, 190];
const HAIRLINE: [number, number, number] = [222, 222, 222];
const BAND: [number, number, number] = [238, 238, 238];
const ZEBRA: [number, number, number] = [248, 248, 248];

const MARGIN = 26;

/** How many orders one printed sheet carries. */
export const ORDER_COLUMNS = 6;

const ROW_HEIGHT = 18;
const CATEGORY_HEIGHT = 16;
/** The date box, and the column label under it. */
const DATE_HEIGHT = 20;
const LABEL_HEIGHT = 15;

/** Clip text to `maxWidth`, with an ellipsis when there was more of it. */
function clip(doc: jsPDF, text: string, maxWidth: number): string {
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
  /** Left edge of each column, and its width. */
  nameX: number;
  nameWidth: number;
  packX: number;
  packWidth: number;
  codeX: number;
  codeWidth: number;
  boxesX: number;
  boxWidth: number;
  right: number;
};

function layoutFor(doc: jsPDF): Layout {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const right = pageWidth - MARGIN;
  const usable = right - MARGIN;

  // The write-in boxes get their width first — they are the point of the sheet,
  // and a box too narrow to put "12" in fails at the one job it has. Everything
  // trimmed from here and from pack/code goes to the name, which is set large
  // enough to read on a clipboard and would otherwise clip sooner.
  const boxWidth = 38;
  const boxesWidth = boxWidth * ORDER_COLUMNS;
  const packWidth = 56;
  const codeWidth = 42;
  const nameWidth = usable - boxesWidth - packWidth - codeWidth;

  return {
    pageWidth,
    pageHeight,
    nameX: MARGIN,
    nameWidth,
    packX: MARGIN + nameWidth,
    packWidth,
    codeX: MARGIN + nameWidth + packWidth,
    codeWidth,
    boxesX: MARGIN + nameWidth + packWidth + codeWidth,
    boxWidth,
    right,
  };
}

/** The masthead, drawn once on page one. */
function drawTitle(doc: jsPDF, itemCount: number): number {
  doc.setTextColor(...BRAND);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("JP's Hot Chicken — Truck Order Sheet", MARGIN, MARGIN + 10);

  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(
    `${itemCount} items · ${ORDER_COLUMNS} orders per sheet · printed ${formatOrderDate(todayISO())}`,
    MARGIN,
    MARGIN + 23,
  );

  return MARGIN + 34;
}

/**
 * The column headings, repeated at the top of every page.
 *
 * The date boxes repeat with them: page two's columns have to be labelled the
 * same way page one's are, or there is no telling which order a number belongs
 * to once the sheet runs past a page.
 */
function drawHeader(doc: jsPDF, layout: Layout, y: number): number {
  const { boxesX, boxWidth, right } = layout;

  // Date boxes — deliberately empty, to be written in.
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");

  for (let column = 0; column < ORDER_COLUMNS; column++) {
    const x = boxesX + column * boxWidth;
    doc.rect(x + 2, y + 2, boxWidth - 4, DATE_HEIGHT - 4);
    doc.setTextColor(...MUTED);
    doc.text("DATE", x + 5, y + 9);
  }

  doc.setTextColor(...MUTED);
  doc.setFontSize(7);
  doc.text("Fill in a date, then work down the column", MARGIN, y + 13);

  const labelY = y + DATE_HEIGHT;

  // Label strip.
  doc.setFillColor(...INK);
  doc.rect(MARGIN, labelY, right - MARGIN, LABEL_HEIGHT, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);

  const baseline = labelY + LABEL_HEIGHT / 2 + 2.9;
  doc.text("ITEM", layout.nameX + 4, baseline);
  doc.text("PACK", layout.packX + 3, baseline);
  doc.text("CODE", layout.codeX + 3, baseline);
  for (let column = 0; column < ORDER_COLUMNS; column++) {
    doc.text(
      String(column + 1),
      boxesX + column * boxWidth + boxWidth / 2,
      baseline,
      { align: "center" },
    );
  }

  return labelY + LABEL_HEIGHT;
}

/** The empty write-in cells beside one row, and the lines that separate them. */
function drawBoxes(doc: jsPDF, layout: Layout, y: number, height: number): void {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.6);
  for (let column = 0; column <= ORDER_COLUMNS; column++) {
    const x = layout.boxesX + column * layout.boxWidth;
    doc.line(x, y, x, y + height);
  }
}

export type TruckSheetOptions = {
  items: TruckItem[];
  /** Print each item's usual quantity beside its name, as a prompt. */
  showPars?: boolean;
};

/** Build the blank sheet. */
export async function buildTruckSheetPdf(options: TruckSheetOptions): Promise<jsPDF> {
  const { items, showPars = true } = options;
  // Loaded on demand so jsPDF never ships with the initial dashboard bundle.
  const { jsPDF: JsPdf } = await import("jspdf");

  const doc = new JsPdf({ orientation: "portrait", unit: "pt", format: "letter" });
  const layout = layoutFor(doc);
  const groups = groupByCategory([...items].sort(compareItems));

  let y = drawTitle(doc, items.length);
  y = drawHeader(doc, layout, y);
  let zebra = false;

  const bottom = layout.pageHeight - MARGIN - 14;

  const newPage = () => {
    doc.addPage();
    y = MARGIN;
    y = drawHeader(doc, layout, y);
    zebra = false;
  };

  for (const group of groups) {
    // Never leave a section heading stranded at the foot of a page.
    if (y + CATEGORY_HEIGHT + ROW_HEIGHT > bottom) newPage();

    doc.setFillColor(...BAND);
    doc.rect(MARGIN, y, layout.right - MARGIN, CATEGORY_HEIGHT, "F");

    const bandBaseline = y + CATEGORY_HEIGHT / 2 + 3.2;
    const heading = group.category.toUpperCase();
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(heading, MARGIN + 4, bandBaseline);

    // The count goes beside the heading, not out at the far right, where it
    // would sit under CODE and read like one of the numbers on the sheet.
    const headingWidth = doc.getTextWidth(heading);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`${group.rows.length} items`, MARGIN + 10 + headingWidth, bandBaseline);

    drawBoxes(doc, layout, y, CATEGORY_HEIGHT);
    y += CATEGORY_HEIGHT;

    for (const item of group.rows) {
      if (y + ROW_HEIGHT > bottom) newPage();

      if (zebra) {
        doc.setFillColor(...ZEBRA);
        doc.rect(MARGIN, y, layout.right - MARGIN, ROW_HEIGHT, "F");
      }
      zebra = !zebra;

      const baseline = y + ROW_HEIGHT / 2 + 3.6;

      doc.setTextColor(...INK);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      // The usual quantity rides with the name — it is a prompt while counting,
      // not a column anyone needs to line up.
      const par = showPars && item.parQuantity > 0 ? `   (usual ${item.parQuantity})` : "";
      doc.text(
        clip(doc, `${item.name}${par}`, layout.nameWidth - 8),
        layout.nameX + 4,
        baseline,
      );

      doc.setTextColor(...MUTED);
      doc.setFontSize(7.5);
      doc.text(
        clip(doc, item.packSize || item.unit, layout.packWidth - 6),
        layout.packX + 3,
        baseline,
      );
      doc.text(
        clip(doc, item.supplierItemCode, layout.codeWidth - 6),
        layout.codeX + 3,
        baseline,
      );

      drawBoxes(doc, layout, y, ROW_HEIGHT);

      doc.setDrawColor(...HAIRLINE);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, y + ROW_HEIGHT, layout.right, y + ROW_HEIGHT);

      y += ROW_HEIGHT;
    }
  }

  // Close the table off, then number the pages.
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y, layout.right, y);

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`Page ${page} of ${pages}`, layout.right, layout.pageHeight - MARGIN + 4, {
      align: "right",
    });
  }

  return doc;
}

/** Build the sheet and hand it to the browser as a download. */
export async function exportTruckSheetPdf(options: TruckSheetOptions): Promise<void> {
  const doc = await buildTruckSheetPdf(options);
  await doc.save(`jp-truck-order-sheet-${todayISO()}.pdf`, { returnPromise: true });
}
