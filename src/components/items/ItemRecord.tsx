"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  History,
  Lock,
  LogOut,
  Menu,
  Pencil,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { AdminDrawer } from "@/components/admin/AdminDrawer";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/admin/field";
import { logout } from "@/app/admin/actions";
import {
  ALLERGENS,
  FIELD_GROUPS,
  FIELD_GROUP_LABELS,
  ITEM_SCOPES,
  ITEM_SCOPE_LABELS,
  ITEM_STATUSES,
  ITEM_STATUS_LABELS,
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  STORAGE_ZONES,
  STORAGE_ZONE_LABELS,
  foodCostPercent,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatUnitCost,
  hasGroup,
  type Gap,
  type Item,
  type ItemCost,
  type ItemSupplier,
  type ItemType,
  type Location,
  type Revision,
  type Supplier,
} from "@/lib/items";
import {
  addComponentAction,
  deleteItemAction,
  removeComponentAction,
  removeItemSupplierAction,
  setItemSupplierAction,
  updateItemAction,
  type ItemFormInput,
} from "@/app/admin/items/actions";

export type Candidate = {
  id: string;
  code: string;
  name: string;
  stockUnit: string;
  portionUnit: string;
};

type Props = {
  item: Item;
  cost: ItemCost;
  gaps: Gap[];
  usedBy: { code: string; name: string; type: ItemType }[];
  candidates: Candidate[];
  suppliers: Supplier[];
  itemSuppliers: ItemSupplier[];
  locations: Location[];
  itemLocationIds: string[];
  revisions: Revision[];
  /** Only ever true on `/admin/items`. Elsewhere this is a read-only view. */
  canEdit: boolean;
  /** Where sibling item links point — the surface this record is being read on. */
  basePath: string;
  /**
   * Which page chrome to wear. The dashboard gets the drawer and the sign-out
   * the rest of `/admin` has; the crew's copy gets a back arrow to the
   * catalogue and nothing to press.
   */
  chrome: "operations" | "admin";
};

/** The form's own state — every field as text, which is how inputs work. */
function toForm(item: Item): ItemFormInput {
  const text = (value: number | null) => (value === null ? "" : String(value));
  return {
    code: item.code,
    type: item.type,
    internalName: item.internalName,
    customerName: item.customerName,
    aliases: item.aliases,
    category: item.category,
    subcategory: item.subcategory,
    status: item.status,
    purchaseUnit: item.purchaseUnit,
    packSize: item.packSize,
    purchaseCost: text(item.purchaseCost),
    parLevel: text(item.parLevel),
    reorderPoint: text(item.reorderPoint),
    stockUnit: item.stockUnit,
    portionUnit: item.portionUnit,
    stockPerPurchaseUnit: text(item.stockPerPurchaseUnit),
    portionsPerStockUnit: text(item.portionsPerStockUnit),
    yieldFactor: text(item.yieldFactor),
    batchYieldQuantity: text(item.batchYieldQuantity),
    recipeUrl: item.recipeUrl,
    menuPrice: text(item.menuPrice),
    allergens: item.allergens,
    storageZone: item.storageZone,
    storageTemp: item.storageTemp,
    shelfLifeDays: text(item.shelfLifeDays),
    dateLabelRule: item.dateLabelRule,
    photoUrl: item.photoUrl,
    notes: item.notes,
    scope: item.scope,
    availableEverywhere: item.availableEverywhere,
  };
}

export function ItemRecord({
  item,
  cost,
  gaps,
  usedBy,
  candidates,
  suppliers,
  itemSuppliers,
  locations,
  itemLocationIds,
  revisions,
  canEdit,
  basePath,
  chrome,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState<ItemFormInput>(() => toForm(item));
  const [summary, setSummary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof ItemFormInput>(key: K, value: ItemFormInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const groups = FIELD_GROUPS[form.type as ItemType];
  const margin = foodCostPercent(cost.perStockUnit, item.menuPrice);

  const run = (work: () => Promise<unknown>) => {
    setError(null);
    startTransition(async () => {
      try {
        await work();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That didn't work. Try again.");
      }
    });
  };

  const save = () =>
    run(async () => {
      const code = await updateItemAction(item.id, form, summary);
      setEditing(false);
      setSummary("");
      if (code !== item.code) router.replace(`${basePath}/${encodeURIComponent(code)}`);
    });

  return (
    <div className="min-h-screen bg-muted">
      {/* ----------------------------------------------------------- header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          {chrome === "admin" ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu />
            </Button>
          ) : (
            <Link
              href={basePath}
              aria-label="Back to the catalogue"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ChevronLeft className="size-4" />
            </Link>
          )}
          <div className="mr-auto min-w-0">
            <h1 className="truncate font-heading text-lg font-bold tracking-tight">
              {item.internalName}
            </h1>
            <p className="truncate font-mono text-xs text-muted-foreground">
              {item.code} · {ITEM_TYPE_LABELS[item.type]}
            </p>
          </div>

          {canEdit ? (
            editing ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    setForm(toForm(item));
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" disabled={pending} onClick={save}>
                  <Save data-icon="inline-start" />
                  {pending ? "Saving…" : "Save"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil data-icon="inline-start" />
                  Edit
                </Button>
                <form action={logout}>
                  <Button type="submit" variant="ghost" size="sm">
                    <LogOut data-icon="inline-start" />
                    Sign out
                  </Button>
                </form>
              </>
            )
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="size-3" />
              Read-only
            </span>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive sm:px-6"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="flex-1">{error}</p>
            <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={() => setError(null)}>
              <X />
            </Button>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:px-6">
        {/* ------------------------------------------------------ what it costs */}
        <section className="grid gap-3 rounded-xl border border-border bg-background p-4 shadow-sm sm:grid-cols-3">
          <Figure
            label={`Cost per ${item.stockUnit || "unit"}`}
            value={formatUnitCost(cost.perStockUnit)}
          />
          {item.batchYieldQuantity !== 1 ? (
            <Figure label="Cost per build" value={formatMoney(cost.perBatch)} />
          ) : (
            <Figure
              label={`Cost per ${item.portionUnit || "portion"}`}
              value={formatUnitCost(cost.perPortion)}
            />
          )}
          {hasGroup(item.type, "menu") ? (
            <Figure
              label="Food cost"
              value={formatPercent(margin)}
              hint={item.menuPrice !== null ? `at ${formatMoney(item.menuPrice)}` : "no price set"}
            />
          ) : (
            <Figure label="Used by" value={String(usedBy.length)} hint="items above this one" />
          )}

          {cost.missing.length > 0 && (
            <p className="flex items-start gap-2 text-xs text-amber-700 sm:col-span-3">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Cost is unknown because {cost.missing.length === 1 ? "this has" : "these have"} no
                price or conversion yet: {cost.missing.join(", ")}.
              </span>
            </p>
          )}
        </section>

        {/* ------------------------------------------------------ missing data */}
        {gaps.length > 0 && (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <h2 className="flex items-center gap-2 font-heading text-sm font-bold text-amber-900">
              <TriangleAlert className="size-4" />
              Incomplete record
            </h2>
            <ul className="mt-2 space-y-0.5 text-sm text-amber-900">
              {gaps.map((gap) => (
                <li key={gap.field}>· {gap.message}</li>
              ))}
            </ul>
          </section>
        )}

        {/* ------------------------------------------------------------ fields */}
        <Panel title="Identity">
          <Grid>
            <Field label="Item code">
              {editing ? (
                <input
                  value={form.code}
                  onChange={(event) => set("code", event.target.value)}
                  className={FIELD_CLASS}
                />
              ) : (
                <code className="font-mono">{item.code}</code>
              )}
            </Field>
            <Field label="Type">
              {editing ? (
                <Select
                  value={form.type}
                  onChange={(value) => set("type", value)}
                  options={ITEM_TYPES.map((type) => [type, ITEM_TYPE_LABELS[type]])}
                />
              ) : (
                ITEM_TYPE_LABELS[item.type]
              )}
            </Field>
            <Field label="Internal name">
              {editing ? (
                <input
                  value={form.internalName}
                  onChange={(event) => set("internalName", event.target.value)}
                  className={FIELD_CLASS}
                />
              ) : (
                item.internalName
              )}
            </Field>
            <Field label="Customer-facing name">
              {editing ? (
                <input
                  value={form.customerName}
                  onChange={(event) => set("customerName", event.target.value)}
                  className={FIELD_CLASS}
                />
              ) : (
                item.customerName || "—"
              )}
            </Field>
            <Field label="Category">
              {editing ? (
                <input
                  value={form.category}
                  onChange={(event) => set("category", event.target.value)}
                  className={FIELD_CLASS}
                />
              ) : (
                item.category || "—"
              )}
            </Field>
            <Field label="Subcategory">
              {editing ? (
                <input
                  value={form.subcategory}
                  onChange={(event) => set("subcategory", event.target.value)}
                  className={FIELD_CLASS}
                />
              ) : (
                item.subcategory || "—"
              )}
            </Field>
            <Field label="Status">
              {editing ? (
                <Select
                  value={form.status}
                  onChange={(value) => set("status", value)}
                  options={ITEM_STATUSES.map((status) => [status, ITEM_STATUS_LABELS[status]])}
                />
              ) : (
                ITEM_STATUS_LABELS[item.status]
              )}
            </Field>
            <Field label="Scope">
              {editing ? (
                <Select
                  value={form.scope}
                  onChange={(value) => set("scope", value)}
                  options={ITEM_SCOPES.map((scope) => [scope, ITEM_SCOPE_LABELS[scope]])}
                />
              ) : (
                ITEM_SCOPE_LABELS[item.scope]
              )}
            </Field>
            <Field label="Aliases" wide>
              {editing ? (
                <input
                  value={form.aliases.join(", ")}
                  onChange={(event) =>
                    set("aliases", event.target.value.split(",").map((alias) => alias.trim()))
                  }
                  placeholder="Other names it goes by, comma separated"
                  className={FIELD_CLASS}
                />
              ) : (
                item.aliases.join(", ") || "—"
              )}
            </Field>
          </Grid>
        </Panel>

        {groups.includes("purchasing") && (
          <Panel title={FIELD_GROUP_LABELS.purchasing}>
            <Grid>
              <Field label="Purchase unit">
                <Editable
                  editing={editing}
                  value={form.purchaseUnit}
                  display={item.purchaseUnit}
                  onChange={(value) => set("purchaseUnit", value)}
                  placeholder="case"
                />
              </Field>
              <Field label="Pack size">
                <Editable
                  editing={editing}
                  value={form.packSize}
                  display={item.packSize}
                  onChange={(value) => set("packSize", value)}
                  placeholder="6 / 5 lb"
                />
              </Field>
              <Field label="Cost per purchase unit">
                <Editable
                  editing={editing}
                  value={form.purchaseCost ?? ""}
                  display={formatMoney(item.purchaseCost)}
                  onChange={(value) => set("purchaseCost", value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Par level">
                <Editable
                  editing={editing}
                  value={form.parLevel ?? ""}
                  display={formatQuantity(item.parLevel)}
                  onChange={(value) => set("parLevel", value)}
                />
              </Field>
              <Field label="Reorder point">
                <Editable
                  editing={editing}
                  value={form.reorderPoint ?? ""}
                  display={formatQuantity(item.reorderPoint)}
                  onChange={(value) => set("reorderPoint", value)}
                />
              </Field>
            </Grid>
          </Panel>
        )}

        {groups.includes("units") && (
          <Panel
            title={FIELD_GROUP_LABELS.units}
            hint="How it is bought, how it is counted, how it is served — and the factors between them."
          >
            <Grid>
              <Field label="Stock unit (counted & costed in)">
                <Editable
                  editing={editing}
                  value={form.stockUnit}
                  display={item.stockUnit}
                  onChange={(value) => set("stockUnit", value)}
                  placeholder="lb"
                />
              </Field>
              <Field label="Stock units per purchase unit">
                <Editable
                  editing={editing}
                  value={form.stockPerPurchaseUnit ?? ""}
                  display={formatQuantity(item.stockPerPurchaseUnit)}
                  onChange={(value) => set("stockPerPurchaseUnit", value)}
                  placeholder="30"
                />
              </Field>
              <Field label="Portion unit (served in)">
                <Editable
                  editing={editing}
                  value={form.portionUnit}
                  display={item.portionUnit}
                  onChange={(value) => set("portionUnit", value)}
                  placeholder="slice"
                />
              </Field>
              <Field label="Portions per stock unit">
                <Editable
                  editing={editing}
                  value={form.portionsPerStockUnit ?? ""}
                  display={formatQuantity(item.portionsPerStockUnit)}
                  onChange={(value) => set("portionsPerStockUnit", value)}
                  placeholder="16"
                />
              </Field>
              <Field label="Yield after trim & cook loss">
                <Editable
                  editing={editing}
                  value={form.yieldFactor ?? ""}
                  display={`${(item.yieldFactor * 100).toFixed(0)}%`}
                  onChange={(value) => set("yieldFactor", value)}
                  placeholder="1 = no loss, 0.8 = a fifth lost"
                />
              </Field>
              {hasGroup(item.type, "recipe") && (
                <Field label={`Stock units one build makes`}>
                  <Editable
                    editing={editing}
                    value={form.batchYieldQuantity ?? ""}
                    display={formatQuantity(item.batchYieldQuantity)}
                    onChange={(value) => set("batchYieldQuantity", value)}
                  />
                </Field>
              )}
            </Grid>
          </Panel>
        )}

        {groups.includes("recipe") && (
          <ComponentsPanel
            itemId={item.id}
            stockUnit={item.stockUnit}
            batchYield={item.batchYieldQuantity}
            cost={cost}
            candidates={candidates}
            canEdit={canEdit}
            basePath={basePath}
            pending={pending}
            run={run}
          />
        )}

        {groups.includes("menu") && (
          <Panel title={FIELD_GROUP_LABELS.menu}>
            <Grid>
              <Field label="Menu price">
                <Editable
                  editing={editing}
                  value={form.menuPrice ?? ""}
                  display={formatMoney(item.menuPrice)}
                  onChange={(value) => set("menuPrice", value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Food cost">{formatPercent(margin)}</Field>
            </Grid>
          </Panel>
        )}

        {groups.includes("allergens") && (
          <Panel
            title={FIELD_GROUP_LABELS.allergens}
            hint="Tick None once it has been checked and contains nothing — an empty list reads as never checked."
          >
            {editing ? (
              <div className="flex flex-wrap gap-2">
                {ALLERGENS.map((allergen) => {
                  const on = form.allergens.includes(allergen);
                  return (
                    <button
                      key={allergen}
                      type="button"
                      onClick={() =>
                        set(
                          "allergens",
                          on
                            ? form.allergens.filter((entry) => entry !== allergen)
                            : [...form.allergens.filter((entry) => entry !== "None"), allergen],
                        )
                      }
                      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                        on
                          ? "border-brand bg-brand/10 font-semibold text-brand"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      {allergen}
                    </button>
                  );
                })}
              </div>
            ) : item.allergens.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {item.allergens.map((allergen) => (
                  <span
                    key={allergen}
                    className="rounded-full bg-muted px-3 py-1 text-sm font-semibold"
                  >
                    {allergen}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-amber-700">Not reviewed yet.</p>
            )}
          </Panel>
        )}

        {groups.includes("storage") && (
          <Panel title={FIELD_GROUP_LABELS.storage}>
            <Grid>
              <Field label="Storage zone">
                {editing ? (
                  <Select
                    value={form.storageZone}
                    onChange={(value) => set("storageZone", value)}
                    options={STORAGE_ZONES.map((zone) => [zone, STORAGE_ZONE_LABELS[zone]])}
                  />
                ) : (
                  STORAGE_ZONE_LABELS[item.storageZone]
                )}
              </Field>
              <Field label="Required temperature">
                <Editable
                  editing={editing}
                  value={form.storageTemp}
                  display={item.storageTemp}
                  onChange={(value) => set("storageTemp", value)}
                  placeholder="≤ 40°F"
                />
              </Field>
              <Field label="Shelf life (days)">
                <Editable
                  editing={editing}
                  value={form.shelfLifeDays ?? ""}
                  display={item.shelfLifeDays === null ? "—" : String(item.shelfLifeDays)}
                  onChange={(value) => set("shelfLifeDays", value)}
                />
              </Field>
              <Field label="Date-labelling rule" wide>
                <Editable
                  editing={editing}
                  value={form.dateLabelRule}
                  display={item.dateLabelRule}
                  onChange={(value) => set("dateLabelRule", value)}
                  placeholder="Label with prep date, use within 3 days"
                />
              </Field>
            </Grid>
          </Panel>
        )}

        <SuppliersPanel
          itemId={item.id}
          suppliers={suppliers}
          approved={itemSuppliers}
          canEdit={canEdit}
          pending={pending}
          run={run}
        />

        {/* --------------------------------------------------------- where used */}
        <Panel
          title="Where used"
          hint="Everything built from this item, however many layers up. A price change here moves all of it."
        >
          {usedBy.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is made from this yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {usedBy.map((used) => (
                <li key={used.code}>
                  <Link
                    href={`${basePath}/${encodeURIComponent(used.code)}`}
                    className="flex items-center gap-2 py-2 text-sm transition-colors hover:text-brand"
                  >
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {used.code}
                    </code>
                    <span className="font-semibold">{used.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {ITEM_TYPE_LABELS[used.type]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ------------------------------------------------------------- notes */}
        <Panel title={FIELD_GROUP_LABELS.assets}>
          <Grid>
            <Field label="Photo link" wide>
              <Editable
                editing={editing}
                value={form.photoUrl}
                display={item.photoUrl}
                onChange={(value) => set("photoUrl", value)}
                placeholder="https://…"
              />
            </Field>
            <Field label="Recipe / procedure link" wide>
              <Editable
                editing={editing}
                value={form.recipeUrl}
                display={item.recipeUrl}
                onChange={(value) => set("recipeUrl", value)}
                placeholder="https://…"
              />
            </Field>
            <Field label="Notes" wide>
              {editing ? (
                <textarea
                  value={form.notes}
                  onChange={(event) => set("notes", event.target.value)}
                  rows={3}
                  className={FIELD_CLASS}
                />
              ) : (
                <span className="whitespace-pre-wrap">{item.notes || "—"}</span>
              )}
            </Field>
          </Grid>
        </Panel>

        {/* ------------------------------------------------------- availability */}
        <Panel title="Where it is available">
          {editing ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.availableEverywhere}
                onChange={(event) => set("availableEverywhere", event.target.checked)}
                className="size-4 accent-[var(--brand)]"
              />
              Available at every location
            </label>
          ) : (
            <p className="text-sm">
              {item.availableEverywhere
                ? "Every location."
                : itemLocationIds.length === 0
                  ? "No locations selected yet."
                  : locations
                      .filter((location) => itemLocationIds.includes(location.id))
                      .map((location) => location.name)
                      .join(", ")}
            </p>
          )}
        </Panel>

        {/* --------------------------------------------------------- the change */}
        {editing && (
          <Panel title="What changed" hint="Kept with the version so the history reads as sentences.">
            <input
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="e.g. New case price from Sysco"
              className={FIELD_CLASS}
            />
          </Panel>
        )}

        {/* ------------------------------------------------------------ history */}
        <Panel title="History" hint={`Version ${item.version}. Every change is dated and kept.`}>
          {revisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {revisions.map((revision) => (
                <li key={revision.id} className="flex items-baseline gap-2">
                  <History className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-mono text-xs text-muted-foreground">
                    v{revision.version}
                  </span>
                  <span className="flex-1">{revision.summary || "Edited"}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(revision.changedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ------------------------------------------------------------- danger */}
        {canEdit && editing && (
          <Panel
            title="Delete"
            hint="An item anything is made from cannot be deleted — mark it discontinued instead, so the documents that referenced it still read."
          >
            <Button
              variant="destructive"
              size="lg"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await deleteItemAction(item.id);
                  router.push(basePath);
                })
              }
            >
              <Trash2 data-icon="inline-start" />
              Delete this item
            </Button>
          </Panel>
        )}
      </main>

      {chrome === "admin" && (
        <AdminDrawer open={menuOpen} view="items" onOpenChange={setMenuOpen} />
      )}
    </div>
  );
}

/* ------------------------------------------------------- the bill of materials */

function ComponentsPanel({
  itemId,
  stockUnit,
  batchYield,
  cost,
  candidates,
  canEdit,
  basePath,
  pending,
  run,
}: {
  itemId: string;
  stockUnit: string;
  batchYield: number;
  cost: ItemCost;
  candidates: Candidate[];
  canEdit: boolean;
  basePath: string;
  pending: boolean;
  run: (work: () => Promise<unknown>) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [componentId, setComponentId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [basis, setBasis] = useState("stock");

  const chosen = candidates.find((candidate) => candidate.id === componentId);

  return (
    <Panel
      title={FIELD_GROUP_LABELS.recipe}
      hint="Every line points at another item by its code. Nothing here is typed twice."
      action={
        canEdit && (
          <Button variant="outline" size="sm" onClick={() => setAdding((open) => !open)}>
            <Plus data-icon="inline-start" />
            Add
          </Button>
        )
      }
    >
      {cost.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing in it yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2 font-semibold">Item</th>
              <th className="pb-2 text-right font-semibold">Qty</th>
              <th className="pb-2 text-right font-semibold">Unit cost</th>
              <th className="pb-2 text-right font-semibold">Line</th>
              {canEdit && <th className="pb-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {cost.lines.map((line) => (
              <tr key={line.id}>
                <td className="py-2">
                  <Link
                    href={`${basePath}/${encodeURIComponent(line.code)}`}
                    className="hover:text-brand"
                  >
                    <code className="font-mono text-xs text-muted-foreground">{line.code}</code>{" "}
                    <span className="font-semibold">{line.name}</span>
                  </Link>
                </td>
                <td className="py-2 text-right whitespace-nowrap tabular-nums">
                  {formatQuantity(line.quantity)}{" "}
                  <span className="text-xs text-muted-foreground">{line.unitLabel}</span>
                </td>
                <td className="py-2 text-right font-mono text-xs tabular-nums">
                  {formatUnitCost(line.unitCost)}
                </td>
                <td className="py-2 text-right font-mono tabular-nums">
                  {formatMoney(line.lineCost, 4)}
                </td>
                {canEdit && (
                  <td className="py-2 pl-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove ${line.name}`}
                      disabled={pending}
                      onClick={() => run(() => removeComponentAction(line.id))}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-semibold">
              <td className="pt-2" colSpan={3}>
                {batchYield === 1 ? "Total" : `Build total, over ${formatQuantity(batchYield)} ${stockUnit || "units"}`}
              </td>
              <td className="pt-2 text-right font-mono tabular-nums">
                {formatMoney(cost.perBatch, 4)}
              </td>
              {canEdit && <td />}
            </tr>
          </tfoot>
        </table>
      )}

      {adding && canEdit && (
        <div className="mt-3 grid gap-2 rounded-lg border border-border bg-muted/40 p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <label className="block">
            <span className={LABEL_CLASS}>Item</span>
            <select
              value={componentId}
              onChange={(event) => setComponentId(event.target.value)}
              className={`${FIELD_CLASS} mt-1`}
            >
              <option value="">Choose an item…</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.code} — {candidate.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>Quantity</span>
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              inputMode="decimal"
              className={`${FIELD_CLASS} mt-1`}
            />
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>Counted in</span>
            <select
              value={basis}
              onChange={(event) => setBasis(event.target.value)}
              className={`${FIELD_CLASS} mt-1`}
            >
              <option value="stock">{chosen?.stockUnit || "stock unit"}</option>
              <option value="portion" disabled={!chosen?.portionUnit}>
                {chosen?.portionUnit || "no portion unit"}
              </option>
            </select>
          </label>
          <div className="flex items-end">
            <Button
              size="lg"
              disabled={pending || !componentId || !quantity}
              onClick={() =>
                run(async () => {
                  await addComponentAction({ parentId: itemId, componentId, quantity, basis });
                  setComponentId("");
                  setQuantity("");
                  setAdding(false);
                })
              }
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------- approved suppliers */

function SuppliersPanel({
  itemId,
  suppliers,
  approved,
  canEdit,
  pending,
  run,
}: {
  itemId: string;
  suppliers: Supplier[];
  approved: ItemSupplier[];
  canEdit: boolean;
  pending: boolean;
  run: (work: () => Promise<unknown>) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [cost, setCost] = useState("");

  return (
    <Panel
      title="Approved suppliers"
      hint="For a core item this list is the whole permitted set — a location cannot buy outside it."
      action={
        canEdit &&
        suppliers.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setAdding((open) => !open)}>
            <Plus data-icon="inline-start" />
            Approve
          </Button>
        )
      }
    >
      {approved.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {suppliers.length === 0
            ? "No suppliers on file yet."
            : "No approved supplier for this item yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {approved.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{entry.supplierName}</span>
                {entry.isPrimary && (
                  <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[0.7rem] font-semibold text-brand">
                    Primary
                  </span>
                )}
                {entry.supplierPartNumber && (
                  <span className="block font-mono text-xs text-muted-foreground">
                    {entry.supplierPartNumber}
                  </span>
                )}
              </span>
              <span className="font-mono tabular-nums">{formatMoney(entry.cost)}</span>
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${entry.supplierName}`}
                  disabled={pending}
                  onClick={() => run(() => removeItemSupplierAction(entry.id))}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && canEdit && (
        <div className="mt-3 grid gap-2 rounded-lg border border-border bg-muted/40 p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <label className="block">
            <span className={LABEL_CLASS}>Supplier</span>
            <select
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              className={`${FIELD_CLASS} mt-1`}
            >
              <option value="">Choose…</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>Their part no.</span>
            <input
              value={partNumber}
              onChange={(event) => setPartNumber(event.target.value)}
              className={`${FIELD_CLASS} mt-1`}
            />
          </label>
          <label className="block">
            <span className={LABEL_CLASS}>Their price</span>
            <input
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              inputMode="decimal"
              className={`${FIELD_CLASS} mt-1`}
            />
          </label>
          <div className="flex items-end">
            <Button
              size="lg"
              disabled={pending || !supplierId}
              onClick={() =>
                run(async () => {
                  await setItemSupplierAction({
                    itemId,
                    supplierId,
                    supplierPartNumber: partNumber,
                    purchaseUnit: "",
                    packSize: "",
                    cost,
                    isPrimary: approved.length === 0,
                  });
                  setSupplierId("");
                  setPartNumber("");
                  setCost("");
                  setAdding(false);
                })
              }
            >
              Approve
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------------- pieces */

function Panel({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-background shadow-sm">
      <header className="flex items-start gap-2 border-b border-border px-4 py-3">
        <div className="mr-auto min-w-0">
          <h2 className="font-heading text-base font-bold">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-3 sm:grid-cols-2">{children}</div>
);

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <span className={LABEL_CLASS}>{label}</span>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

/** A field that is an input while editing and plain text the rest of the time. */
function Editable({
  editing,
  value,
  display,
  onChange,
  placeholder,
}: {
  editing: boolean;
  value: string;
  display: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  if (!editing) return <>{display || "—"}</>;
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={FIELD_CLASS}
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={FIELD_CLASS}
    >
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>
          {label}
        </option>
      ))}
    </select>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <span className={LABEL_CLASS}>{label}</span>
      <p className="mt-0.5 font-heading text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
