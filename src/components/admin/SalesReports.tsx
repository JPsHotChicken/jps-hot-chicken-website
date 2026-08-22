"use client";

import { useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  LogOut,
  Menu,
  Printer,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { logout } from "@/app/admin/actions";
import { LABEL_CLASS } from "./field";
import { AdminDrawer } from "./AdminDrawer";
import { readWorkbook, SpreadsheetError } from "@/lib/spreadsheet";
import {
  accountantFigures,
  formatMoney,
  ownerFigures,
  readSalesReport,
  SalesReportError,
  type Figure,
  type SalesReport,
} from "@/lib/sales-report";
import type { ReportKind } from "@/lib/sales-report-pdf";

/**
 * Reports.
 *
 * One spreadsheet goes in — the sales summary Toast produces — and two pages
 * come out of it: the owner's, which carries what the week did and what to take
 * to the bank, and the accountant's, which carries only the two figures they
 * are ever asked for.
 *
 * The pages are shown on screen at the size they print at, rather than as a
 * table with a download button underneath. They exist to be read at a glance
 * and that is the only thing worth checking before printing one, so the preview
 * is the document rather than a summary of it.
 *
 * Nothing is uploaded. The file is opened in this browser, the six figures come
 * off it, and neither the file nor the figures outlive the tab.
 */

const TABS: { kind: ReportKind; label: string; hint: string }[] = [
  { kind: "owner", label: "Owner's report", hint: "The week, and what to bank" },
  { kind: "accountant", label: "Accountant report", hint: "Gross sales and DoorDash" },
];

export function SalesReports() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [kind, setKind] = useState<ReportKind>("owner");
  const [reading, setReading] = useState(false);
  const [exporting, setExporting] = useState<ReportKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const read = async (file: File) => {
    setReading(true);
    setError(null);
    try {
      const parsed = readSalesReport(await readWorkbook(await file.arrayBuffer()));
      setReport(parsed);
      setFileName(file.name);
      setKind("owner");
    } catch (cause) {
      // The two errors this can raise are both written for the owner — one says
      // the file wasn't a spreadsheet, the other that it wasn't the right one.
      // Anything else is a bug and should not be dressed up as advice.
      if (cause instanceof SpreadsheetError || cause instanceof SalesReportError) {
        setError(cause.message);
      } else {
        console.error("[reports] Could not read the export:", cause);
        setError("That file couldn't be read.");
      }
      setReport(null);
      setFileName(null);
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /**
   * jsPDF is a big dependency and these two buttons are the only things on the
   * page that need it, so it is fetched on the click rather than with the page.
   */
  const exportPdf = async (which: ReportKind) => {
    if (!report) return;
    setExporting(which);
    setError(null);
    try {
      const { exportSalesPdf } = await import("@/lib/sales-report-pdf");
      await exportSalesPdf(which, report);
    } catch (cause) {
      console.error("[reports] Could not build the PDF:", cause);
      setError("The PDF couldn't be built. The figures on screen are the same ones.");
    } finally {
      setExporting(null);
    }
  };

  const startOver = () => {
    setReport(null);
    setFileName(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const figures = report
    ? kind === "owner"
      ? ownerFigures(report)
      : accountantFigures(report)
    : [];

  return (
    <div className="flex min-h-screen flex-col bg-muted print:bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur print:hidden">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>

          <div className="mr-auto">
            <h1 className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight">
              <FileText className="size-4 text-brand" />
              Reports
            </h1>
            <p className="text-xs text-muted-foreground">
              {report
                ? `${report.periodLabel || "No dates on the export"}${
                    report.location ? ` · ${report.location}` : ""
                  }`
                : "Upload a Toast sales summary to start"}
            </p>
          </div>

          <Button
            size="sm"
            onClick={() => exportPdf(kind)}
            disabled={!report || exporting !== null}
            title="Download the report you're looking at"
          >
            {exporting === kind ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            ) : (
              <Download data-icon="inline-start" />
            )}
            {exporting === kind ? "Building…" : "Download PDF"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            disabled={!report}
          >
            <Printer data-icon="inline-start" />
            Print
          </Button>

          <Button variant="ghost" size="sm" onClick={startOver} disabled={!report}>
            <Trash2 data-icon="inline-start" />
            Start over
          </Button>

          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </form>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive sm:px-6"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="flex-1">{error}</p>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss"
              onClick={() => setError(null)}
            >
              <X />
            </Button>
          </div>
        )}
      </header>

      <AdminDrawer open={menuOpen} view="reports" onOpenChange={setMenuOpen} />

      <div className="flex flex-1 flex-col gap-4 p-4 sm:px-6 print:p-0">
        <Upload
          fileRef={fileRef}
          fileName={fileName}
          reading={reading}
          onFile={(file) => void read(file)}
        />

        {report && (
          <>
            <div
              role="tablist"
              aria-label="Reports"
              className="flex flex-wrap gap-2 print:hidden"
            >
              {TABS.map((tab) => {
                const active = tab.kind === kind;
                return (
                  <button
                    key={tab.kind}
                    role="tab"
                    type="button"
                    aria-selected={active}
                    onClick={() => setKind(tab.kind)}
                    className={`rounded-xl border px-4 py-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                      active
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{tab.label}</span>
                    <span
                      className={`block text-xs ${active ? "text-brand/80" : "text-muted-foreground"}`}
                    >
                      {tab.hint}
                    </span>
                  </button>
                );
              })}

              <Button
                variant="outline"
                size="sm"
                className="ml-auto self-center"
                onClick={() => exportPdf(kind === "owner" ? "accountant" : "owner")}
                disabled={exporting !== null}
                title="Download the other report without switching to it"
              >
                {exporting !== null && exporting !== kind ? (
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Download data-icon="inline-start" />
                )}
                {kind === "owner" ? "Accountant PDF" : "Owner's PDF"}
              </Button>
            </div>

            {report.missing.length > 0 && (
              <div
                role="status"
                className="flex items-start gap-2 rounded-xl border border-brand/40 bg-brand/5 px-4 py-3 text-sm print:hidden"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-brand" />
                <p>
                  <span className="font-semibold">{report.missing.join(", ")}</span> couldn&apos;t
                  be found on that export, so {report.missing.length === 1 ? "it is" : "they are"}{" "}
                  left off the report. Check you downloaded the Sales Summary rather than another
                  one.
                </p>
              </div>
            )}

            <Preview kind={kind} report={report} figures={figures} />
          </>
        )}
      </div>
    </div>
  );
}

/** The file, and the one line explaining which file it should be. */
function Upload({
  fileRef,
  fileName,
  reading,
  onFile,
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  fileName: string | null;
  reading: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background shadow-sm print:hidden">
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <FileSpreadsheet className="size-4 text-brand" />
          Sales summary
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          The Sales Summary export from Toast, for whatever period you want the reports to cover.
          Upload it as it downloaded — nothing leaves this browser.
        </p>
      </header>

      <div className="space-y-2 p-4">
        <label className={LABEL_CLASS} htmlFor="reports-file">
          Spreadsheet
        </label>
        <input
          id="reports-file"
          ref={fileRef}
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={reading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
          }}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-2.5 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
        />

        {(reading || fileName) && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {reading && <LoaderCircle className="size-3 animate-spin" />}
            {reading ? "Reading…" : `Read from ${fileName}.`}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The report itself, on screen.
 *
 * Deliberately the same shape as the PDF: the same figures in the same order at
 * the same enormous size, so what is checked here is what comes out of the
 * printer. The sizes step down on a narrow screen — the phone is where this
 * actually gets read, standing at the safe.
 */
function Preview({
  kind,
  report,
  figures,
}: {
  kind: ReportKind;
  report: SalesReport;
  figures: Figure[];
}) {
  const title = kind === "owner" ? "Owner's Report" : "Accountant Report";

  return (
    <article className="rounded-xl border border-border bg-background p-6 shadow-sm sm:p-10 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      {report.location && (
        <p className="text-xs font-bold tracking-[0.14em] text-muted-foreground uppercase">
          {report.location}
        </p>
      )}
      <p className="mt-1 text-sm font-bold tracking-[0.14em] text-brand uppercase sm:text-base">
        {title}
      </p>
      <p className="mt-2 font-heading text-4xl font-bold tracking-tight text-balance sm:text-5xl">
        {report.periodLabel || report.period || "No dates on the export"}
      </p>

      <hr className="mt-5 border-0 border-t-2 border-brand" />

      <dl className="divide-y divide-border">
        {figures.map((figure) => {
          const highlighted = figure.key === "totalCash";
          return (
            <div
              key={figure.key}
              className={`py-7 sm:py-9 ${highlighted ? "-mx-4 bg-brand/5 px-4 sm:-mx-6 sm:px-6" : ""}`}
            >
              <dt
                className={`text-xs font-bold tracking-[0.14em] uppercase sm:text-sm ${
                  highlighted ? "text-brand" : "text-muted-foreground"
                }`}
              >
                {figure.label}
              </dt>
              <dd className="mt-1.5 font-heading text-[clamp(2.5rem,11vw,5.5rem)] leading-none font-bold tracking-tight tabular-nums">
                {formatMoney(figure.amount)}
              </dd>
              {figure.key === "doorDash" && report.doorDashSources.length > 1 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {report.doorDashSources.join(" and ")}, combined.
                </p>
              )}
            </div>
          );
        })}
      </dl>

      <p className="mt-6 border-t border-border pt-3 text-xs text-muted-foreground">
        Read from the Toast sales summary
        {report.generated ? `, generated ${report.generated}` : ""}.
      </p>
    </article>
  );
}
