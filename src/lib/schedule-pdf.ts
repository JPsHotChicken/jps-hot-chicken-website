import type { jsPDF } from "jspdf";

import {
  DAY_KEYS,
  DAY_LABELS,
  HOURS,
  employeeWeek,
  compareEmployees,
  datesForWeek,
  formatHourBlock,
  formatRange,
  formatShortDate,
  formatWeekRange,
  isClosedDay,
  isClosingShift,
  SHIFT_GROUP_LABELS,
  type Employee,
  type WeekSchedule,
} from "@/lib/schedule";

/** Brand chili red, as RGB for jsPDF. */
const BRAND: [number, number, number] = [232, 93, 26];
const INK: [number, number, number] = [32, 32, 32];
const MUTED: [number, number, number] = [120, 120, 120];
const LINE: [number, number, number] = [205, 205, 205];
const FILL: [number, number, number] = [248, 236, 229];
const CLOSED_FILL: [number, number, number] = [240, 240, 240];

const MARGIN = 28;

/** Shrink text until it fits `maxWidth`, preferring "First L." over an ellipsis. */
function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  if (doc.getTextWidth(text) <= maxWidth) return text;

  const [first, ...rest] = text.split(" ");
  if (rest.length > 0) {
    const abbreviated = `${first} ${rest[rest.length - 1][0]}.`;
    if (doc.getTextWidth(abbreviated) <= maxWidth) return abbreviated;
  }

  let clipped = first ?? text;
  while (clipped.length > 1 && doc.getTextWidth(`${clipped}…`) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

/* ------------------------------------------------------- page 1: whole week */

function drawWeekOverview(
  doc: jsPDF,
  week: WeekSchedule,
  employees: Employee[],
  rowCount: number,
  weekStartISO: string,
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const nameById = new Map(employees.map((e) => [e.id, e.name]));
  const dates = datesForWeek(weekStartISO);

  // Title block.
  doc.setTextColor(...BRAND);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("JP's Hot Chicken — Weekly Schedule", MARGIN, MARGIN + 8);

  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(formatWeekRange(weekStartISO), MARGIN, MARGIN + 24);

  const tableTop = MARGIN + 36;
  const dayColWidth = 66;
  const numColWidth = 20;
  const hourColWidth = (pageWidth - MARGIN * 2 - dayColWidth - numColWidth) / HOURS.length;
  const headerHeight = 16;

  // Closed days collapse to a single band instead of a block of empty rows.
  const totalBodyRows = DAY_KEYS.reduce(
    (total, day) => total + (isClosedDay(day) ? 1 : rowCount),
    0,
  );
  // A few points of slack so rounding can't push the last day onto page 2 —
  // the whole week is meant to fit on page one.
  const available = pageHeight - tableTop - MARGIN - headerHeight - 6;
  const rowHeight = Math.max(9, Math.min(18, available / totalBodyRows));

  let y = tableTop;

  const drawHeaderRow = () => {
    doc.setFillColor(...INK);
    doc.rect(MARGIN, y, pageWidth - MARGIN * 2, headerHeight, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);

    doc.text("Day", MARGIN + 4, y + headerHeight / 2 + 2.5);
    doc.text("#", MARGIN + dayColWidth + numColWidth / 2, y + headerHeight / 2 + 2.5, {
      align: "center",
    });
    HOURS.forEach((hour, index) => {
      const x = MARGIN + dayColWidth + numColWidth + index * hourColWidth + hourColWidth / 2;
      doc.text(formatHourBlock(hour), x, y + headerHeight / 2 + 2.5, { align: "center" });
    });
    y += headerHeight;
  };

  drawHeaderRow();

  DAY_KEYS.forEach((day) => {
    const closed = isClosedDay(day);
    const blockRows = closed ? 1 : rowCount;
    const blockHeight = blockRows * rowHeight;

    // Start a new page if this day's block would run off the bottom.
    if (y + blockHeight > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
      drawHeaderRow();
    }

    const blockTop = y;

    // Day label cell, spanning the whole block.
    doc.setFillColor(250, 250, 250);
    doc.rect(MARGIN, blockTop, dayColWidth, blockHeight, "F");
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(DAY_LABELS[day], MARGIN + 4, blockTop + 10);
    // The date goes on a second line, but only when the block is tall enough
    // for it (a one-row closed day isn't).
    if (blockHeight >= 22) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(formatShortDate(dates[day]), MARGIN + 4, blockTop + 19);
    }

    if (closed) {
      doc.setFillColor(...CLOSED_FILL);
      doc.rect(MARGIN + dayColWidth, blockTop, pageWidth - MARGIN * 2 - dayColWidth, rowHeight, "F");
      doc.setTextColor(...MUTED);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(
        "CLOSED — everyone off",
        MARGIN + dayColWidth + (pageWidth - MARGIN * 2 - dayColWidth) / 2,
        blockTop + rowHeight / 2 + 3,
        { align: "center" },
      );
      y += rowHeight;
    } else {
      for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
        const rowY = blockTop + rowIndex * rowHeight;

        doc.setTextColor(...MUTED);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.text(String(rowIndex + 1), MARGIN + dayColWidth + numColWidth / 2, rowY + rowHeight / 2 + 2, {
          align: "center",
        });

        HOURS.forEach((_, hourIndex) => {
          const employeeId = week[day]?.[rowIndex]?.[hourIndex] ?? null;
          if (!employeeId) return;
          const name = nameById.get(employeeId);
          if (!name) return;

          const x = MARGIN + dayColWidth + numColWidth + hourIndex * hourColWidth;
          doc.setFillColor(...FILL);
          doc.rect(x, rowY, hourColWidth, rowHeight, "F");
          doc.setTextColor(...INK);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.5);
          doc.text(fitText(doc, name, hourColWidth - 4), x + hourColWidth / 2, rowY + rowHeight / 2 + 2, {
            align: "center",
          });
        });
      }
      y += blockHeight;
    }

    // Grid lines for the block. Closed days get no internal hour lines — they
    // would slice through the "CLOSED" label.
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.4);
    if (!closed) {
      for (let i = 0; i <= HOURS.length; i++) {
        const x = MARGIN + dayColWidth + numColWidth + i * hourColWidth;
        doc.line(x, blockTop, x, y);
      }
      for (let i = 1; i < blockRows; i++) {
        const lineY = blockTop + i * rowHeight;
        doc.line(MARGIN + dayColWidth, lineY, pageWidth - MARGIN, lineY);
      }
    }
    doc.line(MARGIN + dayColWidth, blockTop, MARGIN + dayColWidth, y);
    doc.setLineWidth(0.8);
    doc.setDrawColor(...INK);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
  });
}

/* --------------------------------------------- one page per employee */

/** "Monday, Thursday and Friday" */
function joinList(items: string[]): string {
  if (items.length < 2) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * A tinted callout with an accent bar down its left edge. Wraps its own text,
 * and moves to a new page rather than running off the bottom of this one.
 * Returns the y coordinate just below the box it drew.
 */
function drawNote(
  doc: jsPDF,
  options: {
    x: number;
    y: number;
    width: number;
    title: string;
    body: string;
    accent: [number, number, number];
    fill: [number, number, number];
  },
): number {
  const { x, width, title, body, accent, fill } = options;
  const padding = 11;
  const textX = x + padding + 5;
  const textWidth = width - padding * 2 - 5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  const titleLines = doc.splitTextToSize(title, textWidth) as string[];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  // A note can be a single headline, in which case it gets no body lines.
  const bodyLines = body ? (doc.splitTextToSize(body, textWidth) as string[]) : [];

  const height = padding * 2 + titleLines.length * 14 + bodyLines.length * 12;

  let top = options.y;
  if (top + height > doc.internal.pageSize.getHeight() - MARGIN) {
    doc.addPage("letter", "portrait");
    top = MARGIN;
  }

  doc.setFillColor(...fill);
  doc.roundedRect(x, top, width, height, 3, 3, "F");
  doc.setFillColor(...accent);
  doc.rect(x, top + 2, 3.5, height - 4, "F");

  let textY = top + padding + 9;
  doc.setTextColor(...accent);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  titleLines.forEach((line) => {
    doc.text(line, textX, textY);
    textY += 14;
  });

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  bodyLines.forEach((line) => {
    doc.text(line, textX, textY);
    textY += 12;
  });

  return top + height;
}

function drawEmployeePage(
  doc: jsPDF,
  employee: Employee,
  week: WeekSchedule,
  weekStartISO: string,
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const dates = datesForWeek(weekStartISO);
  const { days, totalHours } = employeeWeek(week, employee.id);

  // Name.
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.text(employee.name, MARGIN, MARGIN + 20);

  // Date range + group.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...MUTED);
  doc.text(
    `${formatWeekRange(weekStartISO)}  ·  ${SHIFT_GROUP_LABELS[employee.group]}`,
    MARGIN,
    MARGIN + 38,
  );

  // The days this person is on for the 8–9 PM hour, i.e. closing.
  const closingDays = days.filter(({ ranges }) => isClosingShift(ranges)).map(({ label }) => label);

  // Total hours badge — sized to its text so the number is never clipped.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const badgeLabel = `Total hours this week: ${totalHours}`;
  const badgeWidth = doc.getTextWidth(badgeLabel) + 20;
  doc.setFillColor(...BRAND);
  doc.roundedRect(MARGIN, MARGIN + 48, badgeWidth, 26, 4, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(badgeLabel, MARGIN + 10, MARGIN + 65);

  // Closing shifts change when you actually get to leave, so they get a marker
  // at the top of the page as well as the full explanation further down.
  if (closingDays.length > 0) {
    doc.setFontSize(10.5);
    const pillLabel = "CLOSING SHIFT";
    doc.setFillColor(...INK);
    doc.roundedRect(MARGIN + badgeWidth + 8, MARGIN + 48, doc.getTextWidth(pillLabel) + 20, 26, 4, 4, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(pillLabel, MARGIN + badgeWidth + 18, MARGIN + 65);
  }

  let y = MARGIN + 96;

  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, y - 14, pageWidth - MARGIN, y - 14);

  days.forEach(({ label, day, closed, ranges }) => {
    const dayHours = ranges.reduce((total, range) => total + (range.end - range.start), 0);

    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(label, MARGIN, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(formatShortDate(dates[day]), MARGIN, y + 13);

    const valueX = MARGIN + 130;
    if (closed) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11);
      doc.setTextColor(...MUTED);
      doc.text("Closed — off", valueX, y);
    } else if (ranges.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11);
      doc.setTextColor(...MUTED);
      doc.text("Off", valueX, y);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...INK);
      ranges.forEach((range, index) => {
        doc.text(formatRange(range), valueX, y + index * 15);
      });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...MUTED);
      doc.text(`${dayHours} h`, pageWidth - MARGIN, y, { align: "right" });
    }

    // Advance past the tallest column in this row.
    y += Math.max(34, ranges.length * 15 + 19);

    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.4);
    doc.line(MARGIN, y - 14, pageWidth - MARGIN, y - 14);
  });

  const noteWidth = pageWidth - MARGIN * 2;
  y += 6;

  if (closingDays.length > 0) {
    y =
      drawNote(doc, {
        x: MARGIN,
        y,
        width: noteWidth,
        title: "Closing shift",
        body:
          `You are scheduled to close on ${joinList(closingDays)}. Closing staff are ` +
          "expected to stay until the restaurant is fully closed down, which is typically " +
          "between 9:15 and 9:45 PM. Please plan your evening accordingly, and speak with " +
          "your manager if this creates a conflict.",
        accent: BRAND,
        fill: FILL,
      }) + 10;
  }

  drawNote(doc, {
    x: MARGIN,
    y,
    width: noteWidth,
    title: "The times above are a very close approximation of your shift, not absolute hours.",
    body: "",
    accent: INK,
    fill: CLOSED_FILL,
  });
}

/* ------------------------------------------------------------------ export */

/**
 * How much of the schedule to export. `all` is not one document: it downloads a
 * zip holding the week sheet plus a separate PDF per person, so each sheet can
 * be handed out on its own.
 */
export type ExportScope =
  | { kind: "all" }
  | { kind: "week" }
  | { kind: "employee"; employeeId: string };

/** A scope that describes exactly one file. */
type FileScope = Exclude<ExportScope, { kind: "all" }>;

export type SchedulePdfOptions = {
  week: WeekSchedule;
  employees: Employee[];
  rowCount: number;
  weekStartISO: string;
  scope?: ExportScope;
};

type FilePdfOptions = Omit<SchedulePdfOptions, "scope"> & { scope: FileScope };

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "employee"
  );
}

/** Build the single document a file scope describes. */
export async function buildSchedulePdf(options: FilePdfOptions): Promise<jsPDF> {
  const { week, employees, rowCount, weekStartISO, scope } = options;
  // Loaded on demand so jsPDF never ships with the initial dashboard bundle.
  const { jsPDF: JsPdf } = await import("jspdf");

  // A single person's sheet is portrait, so it has to be the page the document
  // is created with — jsPDF fixes the first page's orientation at construction.
  if (scope.kind === "employee") {
    const employee = employees.find((candidate) => candidate.id === scope.employeeId);
    if (!employee) throw new Error(`No employee with id ${scope.employeeId}`);
    const doc = new JsPdf({ orientation: "portrait", unit: "pt", format: "letter" });
    drawEmployeePage(doc, employee, week, weekStartISO);
    return doc;
  }

  const doc = new JsPdf({ orientation: "landscape", unit: "pt", format: "letter" });
  drawWeekOverview(doc, week, employees, rowCount, weekStartISO);
  return doc;
}

function fileNameFor({ weekStartISO, employees, scope }: FilePdfOptions): string {
  if (scope.kind === "employee") {
    const employee = employees.find((candidate) => candidate.id === scope.employeeId);
    return `jp-schedule-${slugify(employee?.name ?? "")}-${weekStartISO}.pdf`;
  }
  return `jp-schedule-sheet-${weekStartISO}.pdf`;
}

/** Every file in the full export: the week sheet, then one sheet per person. */
function fileScopes(employees: Employee[]): FileScope[] {
  return [
    { kind: "week" },
    // Same order as the sidebar, so the zip lists people the familiar way.
    ...[...employees]
      .sort(compareEmployees)
      .map((employee): FileScope => ({ kind: "employee", employeeId: employee.id })),
  ];
}

/** The zip, and the folder inside it: `jp-schedule-week-of-2026-08-03`. */
function weekFolderName(weekStartISO: string): string {
  return `jp-schedule-week-of-${weekStartISO}`;
}

/** Hand a blob to the browser as a download. */
function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  // Safari only honours the download on an anchor that is in the document.
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Download the whole week as a single zip: one folder holding the schedule
 * sheet and every person's own PDF. One file keeps the browser's
 * multiple-download prompt out of the way and keeps the week together.
 */
async function exportWeekZip(options: SchedulePdfOptions): Promise<void> {
  const folder = weekFolderName(options.weekStartISO);
  const contents: Record<string, Uint8Array> = {};

  for (const scope of fileScopes(options.employees)) {
    const fileOptions = { ...options, scope };
    const doc = await buildSchedulePdf(fileOptions);
    contents[fileNameFor(fileOptions)] = new Uint8Array(doc.output("arraybuffer"));
  }

  // Loaded on demand, like jsPDF — neither belongs in the dashboard bundle.
  const { zipSync } = await import("fflate");
  // The PDFs are already compressed internally, so deflating again only costs
  // time; `level: 0` stores them as they are.
  const zipped = zipSync({ [folder]: contents }, { level: 0 });

  saveBlob(new Blob([zipped as BlobPart], { type: "application/zip" }), `${folder}.zip`);
}

/** Run the export the scope asks for. */
export async function exportSchedulePdf(options: SchedulePdfOptions): Promise<void> {
  const scope = options.scope ?? { kind: "all" };
  if (scope.kind === "all") return exportWeekZip(options);

  const fileOptions = { ...options, scope };
  const doc = await buildSchedulePdf(fileOptions);
  await doc.save(fileNameFor(fileOptions), { returnPromise: true });
}
