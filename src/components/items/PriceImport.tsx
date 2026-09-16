"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  FileSpreadsheet,
  LoaderCircle,
  Sparkles,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FIELD_CLASS } from "@/components/admin/field";
import {
  canTakePrice,
  changesFor,
  detectImportKind,
  matchProducts,
  priceChange,
  readPrices,
  type PriceMatch,
  type PriceReading,
  type PricedProduct,
  type SupplierLink,
} from "@/lib/item-prices";
import { compareItems, formatMoney, formatPercent, type Item } from "@/lib/items";
import {
  importPricesAction,
  type PriceImportResult,
} from "@/app/admin/items/actions";

/** A guide or a few months of invoices; anything past this isn't either. */
const MAX_BYTES = 8_000_000;

/** What the owner has settled about one product: an item's id, or nothing. */
type Decisions = Record<string, string>;

/** The file being reviewed, read once and matched once. */
type LoadedFile = {
  name: string;
  reading: PriceReading;
  matches: PriceMatch[];
};

/** "2026-09-14" as it reads on an invoice. */
const formatInvoiceDate = (iso: string): string =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { dateStyle: "medium" }) : "";

/**
 * What the button does. Rows that changed nothing are still worth saving — the
 * product number goes on the record — so it never reads "nothing to do" while
 * there is still something to write.
 */
function applyLabel(changing: number, decided: number): string {
  if (decided === 0) return "Nothing matched yet";
  if (changing === 0) return `Save ${decided} match${decided === 1 ? "" : "es"}`;
  return `Update ${changing} item${changing === 1 ? "" : "s"}`;
}

type Props = {
  items: Item[];
  /** Product numbers already written onto items, which match outright. */
  links: SupplierLink[];
};

/**
 * Filling in what things cost, from the invoice that says so.
 *
 * Prices move every week and the catalogue is only worth reading if its costs
 * are this week's. PFG publishes no API, so their invoice export is the way in —
 * the same file the truck order page reads, put to a different use here.
 *
 * The file is read in the browser: matching a few dozen product descriptions
 * against the catalogue is arithmetic, not a database question, and doing it
 * here means the owner sees the whole proposal before anything is sent
 * anywhere. Nothing is written until Update is pressed, and only for the rows
 * they leave matched.
 */
export function PriceImport({ items, links }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PriceImportResult | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  // Only items a purchase price belongs on — the same set the matcher works
  // from, so a row can't be pointed by hand at something it could never match.
  const choices = useMemo(
    () => items.filter(canTakePrice).sort(compareItems),
    [items],
  );

  const read = async (chosen: File) => {
    setError(null);
    setResult(null);

    if (chosen.size > MAX_BYTES) {
      setError(
        `${chosen.name} is ${(chosen.size / 1024 / 1024).toFixed(1)} MB — too big to be an invoice export.`,
      );
      return;
    }

    const text = await chosen.text().catch(() => null);
    if (text === null) {
      setError("That file couldn't be read.");
      return;
    }
    if (detectImportKind(text) !== "invoice") {
      setError(
        "That doesn't look like an invoice export — it has no invoice numbers or dates on it. " +
          "An order guide only lists the catalogue; the invoice report is the one that says what was charged.",
      );
      return;
    }

    const found = readPrices(text);
    if (found.products.length === 0) {
      setError(
        found.credits > 0
          ? "Every line on that export is a credit, so there are no prices to read."
          : "There were no priced product lines on that export.",
      );
      return;
    }

    const matches = matchProducts(found.products, items, links, found.supplier);
    setFile({ name: chosen.name, reading: found, matches });
    // Only what the matcher is sure of starts out filled in. A guess is offered
    // beside the row it belongs to, for the owner to accept one at a time.
    setDecisions(
      Object.fromEntries(
        matches
          .filter((match) => match.match === "linked" || match.match === "name")
          .map((match) => [match.product.partNumber, match.itemId!]),
      ),
    );
  };

  const clear = () => {
    setFile(null);
    setDecisions({});
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  /** Every product, in the order the owner should read them. */
  const groups = useMemo(() => {
    const changing: Row[] = [];
    const holding: Row[] = [];
    const unmatched: Row[] = [];

    for (const { product, match, itemId: guessed } of file?.matches ?? []) {
      const chosen = decisions[product.partNumber] ?? "";
      const item = chosen ? byId.get(chosen) : undefined;
      const row: Row = {
        product,
        item,
        changes: item ? changesFor(product, item) : [],
        // A guess is only worth offering while the row is still undecided.
        suggestion: !chosen && match === "close" && guessed ? byId.get(guessed) : undefined,
      };

      if (!item) unmatched.push(row);
      else if (row.changes.length > 0) changing.push(row);
      else holding.push(row);
    }

    return { changing, holding, unmatched };
  }, [file, decisions, byId]);

  const decide = (partNumber: string, itemId: string) =>
    setDecisions((current) => ({ ...current, [partNumber]: itemId }));

  /**
   * Every row the owner has matched, whether or not its price moved.
   *
   * The ones that changed nothing still go: a product number the catalogue
   * hasn't seen before is written onto the item either way, and that is what
   * saves the matching being done again next month.
   */
  const decided = [...groups.changing, ...groups.holding];

  const apply = () => {
    if (!file) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const rows = decided.map((row) => ({ itemId: row.item!.id, product: row.product }));
        setResult(await importPricesAction(rows, file.reading.supplier));
        clear();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Those prices couldn't be saved.");
      }
    });
  };

  return (
    <section className="rounded-xl border border-border bg-background shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <FileSpreadsheet className="size-4 shrink-0 text-brand" />
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-base font-bold">Prices from an invoice</span>
          <span className="block text-xs text-muted-foreground">
            Drop in a PFG invoice export and every case price on it lands on the item it belongs to.
          </span>
        </span>
        <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border p-4">
          {/* ------------------------------------------------------- the file */}
          {!file && (
            <>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                aria-label="Invoice export"
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-2.5 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted"
                onChange={(event) => {
                  const chosen = event.target.files?.[0];
                  if (chosen) void read(chosen);
                }}
              />
              <p className="text-xs text-muted-foreground">
                From PFG&rsquo;s ordering site: Reporting → Invoices → export to CSV. Several
                months in one file is fine — each item takes the newest price on it.
              </p>
            </>
          )}

          {error && (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}

          {result && <Result result={result} />}

          {/* ----------------------------------------------------- the review */}
          {file && (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{file.name}</span> —{" "}
                  {file.reading.products.length} product
                  {file.reading.products.length === 1 ? "" : "s"} across{" "}
                  {file.reading.invoiceCount} invoice
                  {file.reading.invoiceCount === 1 ? "" : "s"}, newest{" "}
                  {formatInvoiceDate(file.reading.dates[0])}.
                  {file.reading.credits > 0 &&
                    ` ${file.reading.credits} credit line${file.reading.credits === 1 ? "" : "s"} passed over.`}
                </span>
                <Button variant="ghost" size="sm" disabled={pending} onClick={clear}>
                  <X data-icon="inline-start" />
                  Start over
                </Button>
              </div>

              {groups.changing.length > 0 && (
                <Group
                  title={`${groups.changing.length} item${groups.changing.length === 1 ? "" : "s"} to update`}
                  hint="The invoice disagrees with the record. These are what Update writes."
                >
                  {groups.changing.map((row) => (
                    <ProductRow
                      key={row.product.partNumber}
                      row={row}
                      choices={choices}
                      disabled={pending}
                      onDecide={decide}
                    />
                  ))}
                </Group>
              )}

              {groups.holding.length > 0 && (
                <Group
                  title={`${groups.holding.length} price${groups.holding.length === 1 ? "" : "s"} unchanged`}
                  hint="Matched, and the record already says what the invoice does."
                  collapsed
                >
                  {groups.holding.map((row) => (
                    <ProductRow
                      key={row.product.partNumber}
                      row={row}
                      choices={choices}
                      disabled={pending}
                      onDecide={decide}
                    />
                  ))}
                </Group>
              )}

              {groups.unmatched.length > 0 && (
                <Group
                  title={`${groups.unmatched.length} not matched`}
                  hint="Nothing in the catalogue answers to these. Pick the item yourself, or leave them — a case nobody has a record for is skipped."
                  collapsed
                >
                  {groups.unmatched.map((row) => (
                    <ProductRow
                      key={row.product.partNumber}
                      row={row}
                      choices={choices}
                      disabled={pending}
                      onDecide={decide}
                    />
                  ))}
                </Group>
              )}

              <Button size="lg" disabled={pending || decided.length === 0} onClick={apply}>
                {pending ? (
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Upload data-icon="inline-start" />
                )}
                {pending ? "Updating…" : applyLabel(groups.changing.length, decided.length)}
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** One product on the invoice, as the review shows it. */
type Row = {
  product: PricedProduct;
  /** The item it has been matched to, once something has matched it. */
  item: Item | undefined;
  changes: ReturnType<typeof changesFor>;
  /** A guess worth offering, for a row nobody has settled yet. */
  suggestion: Item | undefined;
};

function Group({
  title,
  hint,
  collapsed = false,
  children,
}: {
  title: string;
  hint: string;
  collapsed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={!collapsed} className="rounded-lg border border-border">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold">
        {title}
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{hint}</span>
      </summary>
      <ul className="divide-y divide-border border-t border-border">{children}</ul>
    </details>
  );
}

function ProductRow({
  row,
  choices,
  disabled,
  onDecide,
}: {
  row: Row;
  choices: Item[];
  disabled: boolean;
  onDecide: (partNumber: string, itemId: string) => void;
}) {
  const { product, item, changes, suggestion } = row;
  const cost = changes.find((change) => change.field === "purchaseCost");
  const moved = cost ? priceChange(cost.from as number | null, cost.to as number) : null;

  return (
    <li className="space-y-2 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-semibold">{product.description}</span>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
          {product.partNumber}
        </code>
        <span className="text-xs text-muted-foreground">
          {[product.brand, product.packSize].filter(Boolean).join(" · ")}
        </span>
        <span className="ml-auto font-mono text-sm tabular-nums">
          {formatMoney(product.cost)}
          <span className="text-xs text-muted-foreground"> / {product.purchaseUnit}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={item?.id ?? ""}
          disabled={disabled}
          aria-label={`The item ${product.description} is`}
          onChange={(event) => onDecide(product.partNumber, event.target.value)}
          className={`${FIELD_CLASS} max-w-full sm:w-80`}
        >
          <option value="">Not in the catalogue — skip</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.code} · {choice.internalName}
            </option>
          ))}
        </select>

        {suggestion && (
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onDecide(product.partNumber, suggestion.id)}
          >
            <Sparkles data-icon="inline-start" />
            {suggestion.internalName}?
          </Button>
        )}
      </div>

      {item && changes.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {changes.map((change) => (
            <li key={change.field}>
              <span className="text-muted-foreground">{change.label}: </span>
              <span className="text-muted-foreground line-through">
                {change.from === null || change.from === "" ? "—" : String(change.from)}
              </span>{" "}
              <span className="font-semibold">{String(change.to)}</span>
              {change.field === "purchaseCost" && moved !== null && (
                <span className={moved > 0 ? "ml-1 text-destructive" : "ml-1 text-emerald-700"}>
                  {moved > 0 ? "+" : ""}
                  {formatPercent(moved)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {item && changes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {item.code} · {item.internalName} — already says this.
        </p>
      )}
    </li>
  );
}

/** What the import did, in a sentence the owner can act on. */
function Result({ result }: { result: PriceImportResult }) {
  const { updated, unchanged, linked, failed } = result;
  return (
    <div role="status" className="rounded-lg bg-muted px-3 py-2 text-xs">
      <p className="font-semibold">
        {updated > 0 ? `${updated} item${updated === 1 ? "" : "s"} updated` : "Nothing to update"}
      </p>
      <ul className="mt-1 space-y-0.5 text-muted-foreground">
        {linked > 0 && (
          <li>
            {linked} product number{linked === 1 ? "" : "s"} written onto the approved supplier, so
            next month&rsquo;s file matches {linked === 1 ? "it" : "them"} outright.
          </li>
        )}
        {unchanged > 0 && <li>{unchanged} already said what the invoice did.</li>}
        {failed.length > 0 && (
          <li className="text-destructive">
            Couldn&rsquo;t save: {failed.join(", ")}. Nothing was half-written — try those again.
          </li>
        )}
      </ul>
    </div>
  );
}
