"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FIELD_CLASS, LABEL_CLASS } from "./field";
import { DEFAULT_SUPPLIER, formatOrderDate, type OrderGuideField } from "@/lib/truck";
import type { ImportSummary } from "@/app/admin/truck-order/actions";

/** What each matched column is called when the result is read back. */
const FIELD_LABELS: Record<OrderGuideField, string> = {
  code: "item code",
  name: "description",
  brand: "brand",
  packSize: "pack size",
  unit: "unit",
  price: "price",
  category: "category",
  par: "usual order",
};

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

type Props = {
  onImport: (csv: string, supplier: string) => Promise<ImportSummary>;
};

/** What the import did, in a sentence the owner can act on. */
function Result({ result }: { result: ImportSummary }) {
  if (result.kind === "invoice") {
    const { ordersAdded, ordersSkipped, itemsAdded, itemsUpdated, linesAdded, dates } = result;
    return (
      <div role="status" className="rounded-lg bg-muted px-3 py-2 text-xs">
        <p className="font-semibold">
          {ordersAdded > 0
            ? `${plural(ordersAdded, "delivery")} added, ${plural(linesAdded, "line")}`
            : "Nothing new to add"}
        </p>
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          {ordersAdded > 0 && (
            <li>
              Dated {[...new Set(dates)].map(formatOrderDate).join(", ")} — each one is on the
              history list, marked delivered.
            </li>
          )}
          {(itemsAdded > 0 || itemsUpdated > 0) && (
            <li>
              Set list: {itemsAdded} added, {itemsUpdated} updated to the invoiced prices.
            </li>
          )}
          {ordersSkipped > 0 && (
            <li>
              {plural(ordersSkipped, "invoice")} already imported, so {ordersSkipped === 1 ? "it was" : "they were"} left alone.
            </li>
          )}
        </ul>
      </div>
    );
  }

  return (
    <div role="status" className="rounded-lg bg-muted px-3 py-2 text-xs">
      <p className="font-semibold">
        {result.added} added, {result.updated} updated
        {result.skipped > 0 && `, ${plural(result.skipped, "row")} skipped`}
      </p>
      <p className="mt-0.5 text-muted-foreground">
        Read from that file: {result.matched.map((field) => FIELD_LABELS[field]).join(", ")}.
        Anything it didn&apos;t have was left as it was.
      </p>
    </div>
  );
}

/**
 * Bring a file from the distributor in — either kind.
 *
 * PFG publishes no customer API, so what their ordering site exports is the way
 * in. An **invoice export** is the one worth having: it is a record of
 * deliveries that already happened, so it fills in the order history and the
 * set list together, at the prices actually charged. An **order guide** is just
 * the catalogue.
 *
 * Which one it is gets worked out from the file's own headers. The owner
 * downloaded a report; they shouldn't have to tell the page which report it was.
 */
export function ImportGuide({ onImport }: Props) {
  const [supplier, setSupplier] = useState(DEFAULT_SUPPLIER);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
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

  const run = async () => {
    if (!csv.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await onImport(csv, supplier));
      setCsv("");
      setFileName(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That file couldn't be imported.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-background shadow-sm">
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <FileSpreadsheet className="size-4 text-brand" />
          Import from PFG
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Drop in an invoice export and it becomes your order history, with every item and the
          price you actually paid. An order guide works too — that only fills the set list.
        </p>
      </header>

      <div className="space-y-3 p-4">
        <div>
          <label className={LABEL_CLASS} htmlFor="import-file">
            CSV file
          </label>
          <input
            id="import-file"
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
          <label className={LABEL_CLASS} htmlFor="import-paste">
            …or paste it
          </label>
          <textarea
            id="import-paste"
            value={csv}
            onChange={(event) => {
              setCsv(event.target.value);
              setFileName(null);
            }}
            rows={3}
            placeholder="Item #,Description,Pack,Brand,Price"
            className={`mt-1 resize-y font-mono text-xs ${FIELD_CLASS}`}
          />
        </div>

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Not from PFG?</summary>
          <label className={`${LABEL_CLASS} mt-2`} htmlFor="import-supplier">
            Who these items come from
          </label>
          <input
            id="import-supplier"
            value={supplier}
            onChange={(event) => setSupplier(event.target.value)}
            maxLength={80}
            className={`mt-1 ${FIELD_CLASS}`}
          />
          <p className="mt-1">
            Only used for order guides. An invoice already says which branch it came from.
          </p>
        </details>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {result && <Result result={result} />}

        <Button size="sm" onClick={run} disabled={busy || !csv.trim()}>
          {busy ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" />
          ) : (
            <Upload data-icon="inline-start" />
          )}
          {busy ? "Importing…" : fileName ? `Import ${fileName}` : "Import"}
        </Button>
      </div>
    </div>
  );
}
