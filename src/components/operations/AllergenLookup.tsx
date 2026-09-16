"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Search, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { FIELD_CLASS } from "@/components/admin/field";
import {
  ENTRY_KINDS,
  ENTRY_KIND_LABELS,
  allergensPresent,
  contains,
  type AllergenFinding,
  type LookupEntry,
} from "@/lib/allergens";

type Props = {
  entries: LookupEntry[];
  /** The allergen in the address bar, so coming back to the page keeps the answer on screen. */
  initialAllergen: string | null;
  /** Where an item's record lives, for the rows that have one. */
  itemsPath: string;
};

/** Past this many dishes the list is quicker to search than to scroll. */
const SEARCH_FROM = 8;

const ALLERGEN_CHIP = "border-amber-400 bg-amber-100 text-amber-950";

/**
 * The allergen lookup: pick an allergen to see everything that contains it, or
 * pick a dish to see what it contains and where each allergen comes from.
 *
 * Every entry arrives with its allergens already rolled up from the bottom of
 * its build, so a tap here only filters a list.
 */
export function AllergenLookup({ entries, initialAllergen, itemsPath }: Props) {
  const present = useMemo(() => allergensPresent(entries), [entries]);

  const [selected, setSelected] = useState<string | null>(
    present.some(({ allergen }) => allergen === initialAllergen) ? initialAllergen : null,
  );
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const choose = (allergen: string) => {
    const next = selected === allergen ? null : allergen;
    setSelected(next);
    // Replace rather than push: Back should leave the page, not step through taps.
    window.history.replaceState(
      null,
      "",
      next ? `?allergen=${encodeURIComponent(next)}` : window.location.pathname,
    );
  };

  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const matches = selected ? entries.filter((entry) => contains(entry, selected)) : [];

  const menu = entries.filter((entry) => entry.kind === "menu" || entry.kind === "addon");
  const needle = query.trim().toLowerCase();
  const visibleMenu = needle
    ? menu.filter((entry) => entry.name.toLowerCase().includes(needle))
    : menu;

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------- by allergen */}
      <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
        <h2 className="font-heading text-base font-bold">Find by allergen</h2>
        {present.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No allergens are recorded on any item yet.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Tap one to see everything that contains it.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {present.map(({ allergen, count }) => {
                const on = selected === allergen;
                return (
                  <button
                    key={allergen}
                    type="button"
                    aria-pressed={on}
                    onClick={() => choose(allergen)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      on ? ALLERGEN_CHIP : "border-border bg-background hover:bg-muted",
                    )}
                  >
                    {allergen}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-xs tabular-nums",
                        on ? "bg-amber-200" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      {selected && (
        <section
          aria-label={`Everything that contains ${selected}`}
          className="overflow-hidden rounded-xl border border-border bg-background shadow-sm"
        >
          <header className="border-b border-border px-4 py-3">
            <h2 className="font-heading text-base font-bold">Contains {selected}</h2>
            <p className="text-xs text-muted-foreground">
              {matches.length} {matches.length === 1 ? "thing" : "things"}, counting everything
              made from them
            </p>
          </header>
          {ENTRY_KINDS.map((kind) => {
            const group = matches.filter((entry) => entry.kind === kind);
            if (group.length === 0) return null;
            return (
              <div key={kind}>
                <h3 className="border-b border-border bg-muted/60 px-4 py-1.5 text-xs font-semibold text-muted-foreground">
                  {ENTRY_KIND_LABELS[kind]} · {group.length}
                </h3>
                <ul className="divide-y divide-border">
                  {group.map((entry) => (
                    <li key={entry.key}>
                      <ResultRow
                        entry={entry}
                        finding={entry.allergens.find((found) => found.allergen === selected)!}
                        itemsPath={itemsPath}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {/* ---------------------------------------------------------- by dish */}
      <section className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        <header className="space-y-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="font-heading text-base font-bold">Menu items</h2>
            <p className="text-sm text-muted-foreground">Tap a dish to see its allergens.</p>
          </div>
          {menu.length > SEARCH_FROM && (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a dish"
                aria-label="Find a menu item"
                className={`${FIELD_CLASS} w-full pl-9`}
              />
            </div>
          )}
        </header>

        {visibleMenu.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {menu.length === 0
              ? "No menu items yet. They're set up from the admin dashboard."
              : "No dish matches that."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visibleMenu.map((entry) => {
              const isOpen = open.has(entry.key);
              return (
                <li key={entry.key}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => toggle(entry.key)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{entry.name}</span>
                        {entry.kind === "addon" && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
                            Add-on
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        {entry.unchecked.length > 0 && (
                          <TriangleAlert className="size-3 text-amber-700" />
                        )}
                        {countLabel(entry)}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>
                  {isOpen && <DishDetail entry={entry} itemsPath={itemsPath} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground">
        Built from each ingredient&rsquo;s allergen list. It doesn&rsquo;t cover shared fryers, oil
        or prep surfaces.
      </p>
    </div>
  );
}

/** One thing that contains the chosen allergen, and how it gets there. */
function ResultRow({
  entry,
  finding,
  itemsPath,
}: {
  entry: LookupEntry;
  finding: AllergenFinding;
  itemsPath: string;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          {entry.code && (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              {entry.code}
            </code>
          )}
          <span className="font-semibold">{entry.name}</span>
        </span>
        {finding.via.length > 0 && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{sourceText(finding)}</span>
        )}
      </span>
      {entry.code && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
    </>
  );

  const row = "flex items-center gap-3 px-4 py-3";
  return entry.code ? (
    <Link
      href={`${itemsPath}/${encodeURIComponent(entry.code)}`}
      className={`${row} transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset`}
    >
      {body}
    </Link>
  ) : (
    <div className={row}>{body}</div>
  );
}

/** What one dish contains, where each allergen comes from, and what nobody has checked. */
function DishDetail({ entry, itemsPath }: { entry: LookupEntry; itemsPath: string }) {
  return (
    <div className="space-y-3 px-4 pb-4">
      {entry.allergens.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {entry.unchecked.length > 0
            ? "No allergens recorded so far."
            : "None of the major allergens is recorded in anything it's made from."}
        </p>
      ) : (
        <ul className="space-y-2">
          {entry.allergens.map((finding) => (
            <li key={finding.allergen} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span
                className={`rounded-full border px-2.5 py-0.5 text-sm font-semibold ${ALLERGEN_CHIP}`}
              >
                {finding.allergen}
              </span>
              <span className="text-sm text-muted-foreground">{sourceText(finding)}</span>
            </li>
          ))}
        </ul>
      )}

      {entry.unchecked.length > 0 && (
        <p className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
          <span>
            Allergens haven&rsquo;t been recorded for {entry.unchecked.join(", ")}. Until they are,
            don&rsquo;t tell a guest this is free of any allergen.
          </span>
        </p>
      )}

      {entry.code && (
        <Link
          href={`${itemsPath}/${encodeURIComponent(entry.code)}`}
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
        >
          Open the item record
          <ChevronRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

function countLabel(entry: LookupEntry): string {
  const count = entry.allergens.length;
  if (count === 0) return entry.unchecked.length > 0 ? "Not fully checked" : "No allergens";
  return `${count} ${count === 1 ? "allergen" : "allergens"}`;
}

/** "from Dredge → All-purpose flour", plus a note when the record lists it itself. */
function sourceText({ listed, via }: AllergenFinding): string {
  if (via.length === 0) return listed ? "listed on the item itself" : "";
  return `from ${via.join("; ")}${listed ? " (and listed on the item itself)" : ""}`;
}
