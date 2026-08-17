"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Download,
  FileText,
  HandCoins,
  LoaderCircle,
  LogOut,
  Menu,
  Printer,
  StickyNote,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { logout } from "@/app/admin/actions";
import { FIELD_CLASS } from "./field";
import {
  computePayout,
  formatMoney,
  formatPeriod,
  hoursOf,
  payoutFilename,
  personId,
  toPayoutCsv,
  type HoursBasis,
  type TimeEntriesImport,
  type TipsPerson,
} from "@/lib/tips";
import { AdminDrawer } from "./AdminDrawer";
import { PayoutSheet, type RowState } from "./PayoutSheet";
import { TipsImport } from "./TipsImport";
import { TipsPanel } from "./TipsPanel";

/**
 * Everything on the page, as it is saved between visits.
 *
 * A payout is worked out in one sitting and handed out in cash, so none of it
 * belongs in the database — but a half-finished sheet shouldn't die to a
 * refresh either. It lives in this browser and nowhere else.
 */
type Draft = {
  people: TipsPerson[];
  rows: Record<string, RowState>;
  tips: string;
  bonus: string;
  basis: HoursBasis;
  note: string;
  from: string | null;
  to: string | null;
};

const STORAGE_KEY = "jps.tips.draft.v1";

const EMPTY: Draft = {
  people: [],
  rows: {},
  tips: "",
  bonus: "",
  basis: "payable",
  note: "",
  from: null,
  to: null,
};

/** A typed-in dollar or hours figure. Anything unreadable counts as nothing. */
function toNumber(text: string): number {
  const parsed = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** How a person starts out: being paid, at the clock's hours, with no bonus. */
const freshRow = (): RowState => ({ included: true, hours: null, extra: "" });

/** The sheet this browser was last working on. */
function readDraft(): Draft {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? { ...EMPTY, ...(JSON.parse(saved) as Draft) } : EMPTY;
  } catch {
    // A corrupted draft is not worth a broken page; start clean.
    return EMPTY;
  }
}

const subscribeToNothing = () => () => {};

/**
 * True once this is running in a browser, and false through the server render
 * and the hydration pass that has to match it.
 */
function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

/** Push a browser download of text the page generated itself. */
function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The tips payout page.
 *
 * Two reports go in — the time clock's hours and the sales summary's tips — and
 * a sheet of who gets what comes out. The arithmetic is in `lib/tips.ts`; what
 * is here is the editing on top of it, because the reports are a starting point
 * rather than the last word. Hours get corrected, the test account comes off,
 * somebody who wasn't on the clock gets added, and one person gets a little
 * extra for staying late. Nothing is saved to the database: it is worked out in
 * one sitting, printed or exported, and paid in cash.
 */
export function TipsPayout() {
  // The sheet is restored from this browser's own storage, so there is nothing
  // to render until there is a browser. Waiting for the mount — rather than
  // rendering empty and filling it in from an effect — keeps the server's
  // markup and the first client pass identical, and lets the state below be
  // read straight out of storage.
  const mounted = useMounted();
  if (!mounted) return <div className="min-h-screen bg-muted" />;
  return <PayoutEditor />;
}

function PayoutEditor() {
  const [draft, setDraft] = useState<Draft>(readDraft);
  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { people, rows, tips, bonus, basis, note, from, to } = draft;

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // Out of quota or private browsing — the sheet still works, it just
      // won't survive a refresh.
    }
  }, [draft]);

  const patch = useCallback((changes: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...changes }));
  }, []);

  const patchRow = useCallback((id: string, changes: Partial<RowState>) => {
    setDraft((current) => {
      const row = current.rows[id];
      if (!row) return current;
      return { ...current, rows: { ...current.rows, [id]: { ...row, ...changes } } };
    });
  }, []);

  /**
   * Take on a time clock export.
   *
   * The imported people are replaced rather than added to — a second import is
   * a corrected file or a new week, not a second restaurant. Anyone hand-added
   * stays, and everybody who survives the swap keeps the tick and the bonus
   * they already had, so re-importing after a fix doesn't undo an afternoon's
   * work.
   */
  const applyTimeEntries = useCallback((result: TimeEntriesImport) => {
    setDraft((current) => {
      const manual = current.people.filter((person) => person.manual);
      const manualIds = new Set(manual.map((person) => person.id));

      const people = [
        ...result.people.filter((person) => !manualIds.has(person.id)),
        ...manual,
      ].sort((a, b) => a.name.localeCompare(b.name));

      const rows: Record<string, RowState> = {};
      for (const person of people) rows[person.id] = current.rows[person.id] ?? freshRow();

      return { ...current, people, rows, from: result.from, to: result.to };
    });
  }, []);

  const addPerson = useCallback(
    (raw: string): string | null => {
      const name = raw.trim().replace(/\s+/g, " ");
      if (!name) return "Type a name first.";
      if (name.length > 80) return "That name is too long.";

      const id = personId(name);
      if (people.some((person) => person.id === id)) return `${name} is already on the sheet.`;

      setDraft((current) => ({
        ...current,
        people: [
          ...current.people,
          { id, name, totalHours: 0, payableHours: 0, shifts: 0, anomalies: [], manual: true },
        ].sort((a, b) => a.name.localeCompare(b.name)),
        rows: { ...current.rows, [id]: freshRow() },
      }));
      return null;
    },
    [people],
  );

  const removePerson = useCallback((id: string) => {
    setDraft((current) => {
      const rows = { ...current.rows };
      delete rows[id];
      return { ...current, people: current.people.filter((person) => person.id !== id), rows };
    });
  }, []);

  const payout = useMemo(
    () =>
      computePayout(
        people.map((person) => {
          const row = rows[person.id] ?? freshRow();
          return {
            id: person.id,
            hours: row.hours === null ? hoursOf(person, basis) : toNumber(row.hours),
            included: row.included,
            extra: toNumber(row.extra),
          };
        }),
        { tips: toNumber(tips), bonus: toNumber(bonus) },
      ),
    [people, rows, basis, tips, bonus],
  );

  const period = formatPeriod(from, to);

  const exportCsv = () => {
    download(payoutFilename(from, to), toPayoutCsv(people, payout, { period, basis, note }));
  };

  /**
   * The one-page summary for the accountant. jsPDF is a big dependency and this
   * is the only thing on the page that needs it, so it is fetched on the click
   * rather than with the page.
   */
  const exportPdf = async () => {
    setExporting(true);
    setError(null);
    try {
      const { exportTipsPdf } = await import("@/lib/tips-pdf");
      await exportTipsPdf({ people, payout, period, basis, note, from, to });
    } catch (cause) {
      console.error("[tips] Could not build the PDF summary:", cause);
      setError("The PDF couldn't be built. The CSV export has the same figures.");
    } finally {
      setExporting(false);
    }
  };

  const startOver = () => {
    if (people.length > 0 && !window.confirm("Clear this sheet and start again?")) return;
    setDraft(EMPTY);
  };

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
              <HandCoins className="size-4 text-brand" />
              Tips payout
            </h1>
            <p className="text-xs text-muted-foreground">
              {people.length === 0
                ? "Import a time clock export to start"
                : `${period || "No dates on the export"} · ${formatMoney(payout.total)} to hand out`}
            </p>
          </div>

          <Button
            size="sm"
            onClick={exportPdf}
            disabled={exporting || payout.people === 0}
            title="A one-page summary of this payout, laid out for your accountant"
          >
            {exporting ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            ) : (
              <FileText data-icon="inline-start" />
            )}
            {exporting ? "Building…" : "PDF summary"}
          </Button>

          <Button variant="outline" size="sm" onClick={exportCsv} disabled={people.length === 0}>
            <Download data-icon="inline-start" />
            CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            disabled={people.length === 0}
          >
            <Printer data-icon="inline-start" />
            Print
          </Button>

          <Button variant="ghost" size="sm" onClick={startOver} disabled={people.length === 0}>
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

      <AdminDrawer open={menuOpen} view="tips" onOpenChange={setMenuOpen} />

      <div className="flex flex-1 flex-col gap-4 p-4 sm:px-6 lg:flex-row-reverse lg:items-start print:block print:p-0">
        <div className="flex w-full shrink-0 flex-col gap-4 lg:w-80 xl:w-96 print:w-full">
          <TipsPanel
            payout={payout}
            period={period}
            basis={basis}
            tips={tips}
            bonus={bonus}
            onBasis={(value) => patch({ basis: value })}
            onTips={(value) => patch({ tips: value })}
            onBonus={(value) => patch({ bonus: value })}
          />

          <TipsImport
            onTimeEntries={applyTimeEntries}
            onTips={(total) => patch({ tips: total.toFixed(2) })}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <PayoutSheet
            people={people}
            rows={rows}
            payout={payout}
            basis={basis}
            onToggle={(id, included) => patchRow(id, { included })}
            onHours={(id, value) => patchRow(id, { hours: value })}
            onResetHours={(id) => patchRow(id, { hours: null })}
            onExtra={(id, value) => patchRow(id, { extra: value })}
            onRemove={removePerson}
            onAdd={addPerson}
          />

          <div className="rounded-xl border border-border bg-background shadow-sm print:border-0 print:shadow-none">
            <header className="border-b border-border px-4 py-3 print:border-0">
              <h2 className="flex items-center gap-2 font-heading text-base font-bold">
                <StickyNote className="size-4 text-brand" />
                Notes
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground print:hidden">
                Anything worth remembering about this payout. Goes out with the export and the
                printed sheet.
              </p>
            </header>
            <div className="p-4">
              <textarea
                value={note}
                onChange={(event) => patch({ note: event.target.value })}
                rows={3}
                maxLength={2000}
                aria-label="Notes about this payout"
                placeholder="Paid out Sunday night. Shyanne's is in the safe."
                className={`resize-y ${FIELD_CLASS} print:border-0 print:p-0`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
