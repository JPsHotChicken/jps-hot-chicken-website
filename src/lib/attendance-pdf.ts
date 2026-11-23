import {
  attendanceFilename,
  formatEntryDate,
  formatEntryTime,
  type AttendanceEntry,
} from "@/lib/attendance";

/**
 * One staff member's attendance record, as a printable PDF.
 *
 * Built to read on a black-and-white printer: nothing relies on colour, and the
 * reason column wraps rather than being cut off, since the reason is the part
 * that matters if the sheet is ever put in front of somebody.
 */

const BRAND: [number, number, number] = [232, 93, 26];
const INK: [number, number, number] = [32, 32, 32];
const MUTED: [number, number, number] = [120, 120, 120];
const LINE: [number, number, number] = [200, 200, 200];
const ZEBRA: [number, number, number] = [246, 246, 246];

const MARGIN = 40;
const LINE_HEIGHT = 13;
const ROW_PAD = 6;

/** jsPDF's Helvetica is WinAnsi-only; flatten the characters it would garble. */
function printable(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0a\x0d\x20-\x7e -ÿ]/g, "?");
}

export type AttendancePdfOptions = {
  name: string;
  entries: AttendanceEntry[];
  from: string;
  to: string;
};

export async function exportAttendancePdf({ name, entries, from, to }: AttendancePdfOptions) {
  // Loaded on demand so jsPDF never ships with the initial page bundle.
  const { jsPDF: JsPdf } = await import("jspdf");
  const doc = new JsPdf({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const right = pageWidth - MARGIN;

  // Oldest first on paper: a record reads top to bottom as it happened.
  const rows = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );

  const columns = { date: MARGIN + 8, time: MARGIN + 150, reason: MARGIN + 225 };
  const reasonWidth = right - columns.reason - 8;

  doc.setTextColor(...BRAND);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("JP's Hot Chicken", MARGIN, MARGIN + 10);

  doc.setTextColor(...INK);
  doc.setFontSize(22);
  doc.text("Attendance record", MARGIN, MARGIN + 40);

  doc.setFontSize(13);
  doc.text(printable(name), MARGIN, MARGIN + 62);

  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const range =
    from || to
      ? `${from ? formatEntryDate(from) : "Start"} to ${to ? formatEntryDate(to) : "today"}`
      : "All dates";
  doc.text(`${range} - ${rows.length} entr${rows.length === 1 ? "y" : "ies"}`, MARGIN, MARGIN + 78);
  const now = new Date();
  doc.text(
    `Prepared ${now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
    MARGIN,
    MARGIN + 92,
  );

  let y = MARGIN + 116;

  const drawHeader = () => {
    doc.setDrawColor(...INK);
    doc.setLineWidth(1);
    doc.line(MARGIN, y, right, y);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("DATE", columns.date, y + 14);
    doc.text("TIME", columns.time, y + 14);
    doc.text("REASON", columns.reason, y + 14);
    y += 20;
    doc.line(MARGIN, y, right, y);
  };

  drawHeader();

  if (rows.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setTextColor(...MUTED);
    doc.setFontSize(10);
    doc.text("No entries in this range.", columns.date, y + 18);
  }

  doc.setFontSize(10);
  rows.forEach((entry, index) => {
    doc.setFont("helvetica", "normal");
    const lines: string[] = doc.splitTextToSize(printable(entry.reason), reasonWidth);
    const height = lines.length * LINE_HEIGHT + ROW_PAD * 2;

    if (y + height > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
    }

    if (index % 2 === 1) {
      doc.setFillColor(...ZEBRA);
      doc.rect(MARGIN, y, right - MARGIN, height, "F");
    }

    const baseline = y + ROW_PAD + 9;
    doc.setTextColor(...INK);
    doc.text(formatEntryDate(entry.date), columns.date, baseline);
    doc.text(formatEntryTime(entry.time), columns.time, baseline);
    doc.text(lines, columns.reason, baseline);

    y += height;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, right, y);
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`${printable(name)} - page ${page} of ${pages}`, right, pageHeight - 20, {
      align: "right",
    });
  }

  await doc.save(attendanceFilename(name, from, to, "pdf"), { returnPromise: true });
}
