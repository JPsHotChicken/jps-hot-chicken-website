"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FIELD_CLASS, LABEL_CLASS } from "./field";
import {
  detectTipsImport,
  formatMoney,
  formatPeriod,
  parseTimeEntries,
  parseTipSummary,
  type TimeEntriesImport,
} from "@/lib/tips";

type Props = {
  /** A time clock export: who worked, and for how long. */
  onTimeEntries: (result: TimeEntriesImport) => void;
  /** A sales summary: how much was tipped. */
  onTips: (total: number) => void;
};

/** What the last file did, in a sentence the owner can check against the report. */
type Result = { message: string; detail: string };

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * The way both exports get in.
 *
 * There are two files and they are told apart by their own headers, so the
 * owner drops in whichever they downloaded first and the page works out what it
 * is. Nothing is uploaded anywhere — the file is read in the browser, and only
 * the numbers on screen ever exist.
 */
export function TipsImport({ onTimeEntries, onTips }: Props) {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const readFile = async (file: File) => {
    setError(null);
    setResult(null);
    try {
      setCsv(await file.text());
      setFileName(file.name);
    } catch {
      setError("That file couldn't be read.");
    }
  };

  const clear = () => {
    setCsv("");
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const run = () => {
    if (!csv.trim()) return;
    setError(null);
    setResult(null);

    const kind = detectTipsImport(csv);

    if (kind === "time") {
      const parsed = parseTimeEntries(csv);
      if (parsed.people.length === 0) {
        setError("That looks like a time clock export, but there were no hours on it.");
        return;
      }
      onTimeEntries(parsed);
      const period = formatPeriod(parsed.from, parsed.to);
      setResult({
        message: `${plural(parsed.people.length, "person", "people")} on the sheet`,
        detail: [
          period && `Hours for ${period}.`,
          parsed.skipped > 0 &&
            `${plural(parsed.skipped, "row")} had no name or hours and ${parsed.skipped === 1 ? "was" : "were"} skipped.`,
          "This replaces the hours on the sheet. Anyone still on it keeps their tick and their bonus, and people added by hand stay.",
        ]
          .filter(Boolean)
          .join(" "),
      });
      clear();
      return;
    }

    if (kind === "tips") {
      const total = parseTipSummary(csv);
      if (total === null) {
        setError("That looks like a tip summary, but no tips figure could be read off it.");
        return;
      }
      onTips(total);
      setResult({
        message: `Tips set to ${formatMoney(total)}`,
        detail: "Straight off the report. Change it below if the cash drawer disagrees.",
      });
      clear();
      return;
    }

    setError(
      "That file is neither a time clock export nor a tip summary — it has no employee or tips column.",
    );
  };

  return (
    <div className="rounded-xl border border-border bg-background shadow-sm print:hidden">
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <FileSpreadsheet className="size-4 text-brand" />
          Import a report
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Drop in the time clock export for everyone&apos;s hours, and the tip summary for the
          total. Either order — the page works out which is which.
        </p>
      </header>

      <div className="space-y-3 p-4">
        <div>
          <label className={LABEL_CLASS} htmlFor="tips-file">
            CSV file
          </label>
          <input
            id="tips-file"
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
            }}
            className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-2.5 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
          />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="tips-paste">
            …or paste it
          </label>
          <textarea
            id="tips-paste"
            value={csv}
            onChange={(event) => {
              setCsv(event.target.value);
              setFileName(null);
            }}
            rows={3}
            placeholder="Employee,Date,Total Hours,Payable Hours"
            className={`mt-1 resize-y font-mono text-xs ${FIELD_CLASS}`}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {result && (
          <div role="status" className="rounded-lg bg-muted px-3 py-2 text-xs">
            <p className="font-semibold">{result.message}</p>
            <p className="mt-0.5 text-muted-foreground">{result.detail}</p>
          </div>
        )}

        <Button size="sm" onClick={run} disabled={!csv.trim()}>
          <Upload data-icon="inline-start" />
          {fileName ? `Read ${fileName}` : "Read it"}
        </Button>
      </div>
    </div>
  );
}
