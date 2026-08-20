"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Filter, Plus, Search, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FIELD_CLASS } from "@/components/admin/field";
import {
  ALLERGENS,
  EMPTY_FILTERS,
  ITEM_SCOPES,
  ITEM_SCOPE_LABELS,
  ITEM_STATUSES,
  ITEM_STATUS_LABELS,
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  STORAGE_ZONES,
  STORAGE_ZONE_LABELS,
  filterItems,
  formatUnitCost,
  type CatalogueRow,
  type ItemFilters,
  type ItemStatus,
  type ItemType,
} from "@/lib/items";

const STATUS_BADGE: Record<ItemStatus, string> = {
  active: "bg-emerald-100 text-emerald-900",
  seasonal: "bg-amber-100 text-amber-900",
  regional: "bg-sky-100 text-sky-900",
  test: "bg-violet-100 text-violet-900",
  discontinued: "bg-neutral-200 text-neutral-700",
};

type Props = {
  rows: CatalogueRow[];
  categories: string[];
  /** Editing is only ever true on `/admin/items`; the crew's copy is a view. */
  canEdit: boolean;
  /** Where a row links to — the same surface the list is being read on. */
  basePath: string;
};

/**
 * The catalogue list: search, filters, and one row per item.
 *
 * Costs and missing-data counts arrive already worked out, so typing in the
 * search box only filters an array rather than re-walking the bill of materials.
 */
export function ItemsBrowser({ rows, categories, canEdit, basePath }: Props) {
  const [filters, setFilters] = useState<ItemFilters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const set = <K extends keyof ItemFilters>(key: K, value: ItemFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const byId = useMemo(() => new Map(rows.map((row) => [row.item.id, row])), [rows]);

  const visible = useMemo(
    () =>
      filterItems(
        rows.map((row) => row.item),
        filters,
        (item) => byId.get(item.id)?.gaps ?? 0,
      ).map((item) => byId.get(item.id)!),
    [rows, filters, byId],
  );

  const incomplete = rows.filter((row) => row.gaps > 0).length;
  const activeFilters = Object.entries(filters).filter(
    ([key, value]) => key !== "query" && value !== "all" && value !== false,
  ).length;

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------------ search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filters.query}
            onChange={(event) => set("query", event.target.value)}
            placeholder="Code, name, or alias"
            aria-label="Search the catalogue"
            className={`${FIELD_CLASS} w-full pl-9`}
          />
        </div>
        <Button
          variant={showFilters || activeFilters > 0 ? "secondary" : "outline"}
          size="lg"
          onClick={() => setShowFilters((open) => !open)}
        >
          <Filter data-icon="inline-start" />
          Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
        </Button>
        {canEdit && (
          <Button size="lg" render={<Link href={`${basePath}/new`} />}>
            <Plus data-icon="inline-start" />
            New item
          </Button>
        )}
      </div>

      {showFilters && (
        <div className="grid gap-3 rounded-xl border border-border bg-background p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
          <Choice
            label="Type"
            value={filters.type}
            onChange={(value) => set("type", value as ItemType | "all")}
            options={ITEM_TYPES.map((type) => [type, ITEM_TYPE_LABELS[type]])}
          />
          <Choice
            label="Status"
            value={filters.status}
            onChange={(value) => set("status", value as ItemStatus | "all")}
            options={ITEM_STATUSES.map((status) => [status, ITEM_STATUS_LABELS[status]])}
          />
          <Choice
            label="Category"
            value={filters.category}
            onChange={(value) => set("category", value)}
            options={categories.map((category) => [category, category])}
          />
          <Choice
            label="Allergen"
            value={filters.allergen}
            onChange={(value) => set("allergen", value)}
            options={ALLERGENS.map((allergen) => [allergen, allergen])}
          />
          <Choice
            label="Storage"
            value={filters.storageZone}
            onChange={(value) => set("storageZone", value as ItemFilters["storageZone"])}
            options={STORAGE_ZONES.filter((zone) => zone !== "none").map((zone) => [
              zone,
              STORAGE_ZONE_LABELS[zone],
            ])}
          />
          <Choice
            label="Scope"
            value={filters.scope}
            onChange={(value) => set("scope", value as ItemFilters["scope"])}
            options={ITEM_SCOPES.map((scope) => [scope, ITEM_SCOPE_LABELS[scope]])}
          />

          <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
            <input
              type="checkbox"
              checked={filters.incompleteOnly}
              onChange={(event) => set("incompleteOnly", event.target.checked)}
              className="size-4 accent-[var(--brand)]"
            />
            Only records with something missing
            {incomplete > 0 && (
              <span className="text-muted-foreground">({incomplete} of {rows.length})</span>
            )}
          </label>

          {(activeFilters > 0 || filters.query) && (
            <div className="sm:col-span-2 lg:col-span-3">
              <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                <X data-icon="inline-start" />
                Clear filters
              </Button>
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------------------- list */}
      {visible.length === 0 ? (
        <p className="rounded-xl border border-border bg-background p-10 text-center text-sm text-muted-foreground shadow-sm">
          {rows.length === 0
            ? "Nothing in the catalogue yet."
            : "No item matches those filters."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
          <ul className="divide-y divide-border">
            {visible.map(({ item, unitCost, gaps, usedBy }) => (
              <li key={item.id}>
                <Link
                  href={`${basePath}/${encodeURIComponent(item.code)}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        {item.code}
                      </code>
                      <span className="font-semibold">{item.internalName}</span>
                      {item.status !== "active" && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${STATUS_BADGE[item.status]}`}
                        >
                          {ITEM_STATUS_LABELS[item.status]}
                        </span>
                      )}
                      {gaps > 0 && (
                        <span className="inline-flex items-center gap-1 text-[0.7rem] font-semibold text-amber-700">
                          <TriangleAlert className="size-3" />
                          {gaps} missing
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {ITEM_TYPE_LABELS[item.type]}
                      {item.category && ` · ${item.category}`}
                      {usedBy > 0 && ` · used by ${usedBy}`}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-sm tabular-nums">
                      {formatUnitCost(unitCost)}
                    </span>
                    {item.stockUnit && (
                      <span className="block text-[0.7rem] text-muted-foreground">
                        per {item.stockUnit}
                      </span>
                    )}
                  </span>

                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!canEdit && rows.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Read-only. The catalogue is edited from the admin dashboard.
        </p>
      )}
    </div>
  );
}

/** A filter dropdown whose first option is always "any". */
function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${FIELD_CLASS} w-full`}
      >
        <option value="all">Any</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
