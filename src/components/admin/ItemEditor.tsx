"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FIELD_CLASS, LABEL_CLASS } from "./field";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_SUPPLIER,
  MAX_QUANTITY,
  ORDER_UNITS,
  OTHER_CATEGORY,
  type TruckItem,
  type TruckItemDraft,
} from "@/lib/truck";

type Props = {
  /** The item being edited, or null when adding a new one. */
  item: TruckItem | null;
  /** Categories already in use, so a new item can join an existing section. */
  categories: string[];
  /** Rejects with a message worth showing — a repeated item code, usually. */
  onSave: (draft: TruckItemDraft) => Promise<void>;
  onRemove?: () => void;
  onClose: () => void;
};

const blank: TruckItemDraft = {
  name: "",
  category: OTHER_CATEGORY,
  unit: "case",
  packSize: "",
  brand: "",
  supplier: DEFAULT_SUPPLIER,
  supplierItemCode: "",
  unitPrice: null,
  parQuantity: 0,
};

/** A price field's text back to a number — empty means "not known", not zero. */
function parsePrice(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

/**
 * The form for one set item, over the sheet.
 *
 * Add and edit are the same form: the fields are identical, and the difference
 * between them is only whether there is something to delete.
 */
export function ItemEditor({ item, categories, onSave, onRemove, onClose }: Props) {
  const [draft, setDraft] = useState<TruckItemDraft>(() =>
    item
      ? {
          name: item.name,
          category: item.category,
          unit: item.unit,
          packSize: item.packSize,
          brand: item.brand,
          supplier: item.supplier,
          supplierItemCode: item.supplierItemCode,
          unitPrice: item.unitPrice,
          parQuantity: item.parQuantity,
        }
      : blank,
  );
  // Kept as text so a half-typed "12." doesn't get rounded away underneath.
  const [priceText, setPriceText] = useState(item?.unitPrice?.toFixed(2) ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const set = <K extends keyof TruckItemDraft>(key: K, value: TruckItemDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) return;

    setSaving(true);
    setError(null);
    try {
      await onSave({ ...draft, unitPrice: parsePrice(priceText) });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That item couldn't be saved.");
      setSaving(false);
    }
  };

  // Suggestions are the built-in sections plus anything already typed in.
  const suggestions = [...new Set([...DEFAULT_CATEGORIES, ...categories])].sort();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/20 p-4 sm:items-center">
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={item ? `Edit ${item.name}` : "Add an item"}
        className="w-full max-w-lg rounded-xl border border-border bg-background shadow-xl"
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="mr-auto font-heading text-base font-bold">
            {item ? "Edit item" : "Add an item"}
          </h2>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        </header>

        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS} htmlFor="item-name">
              Item
            </label>
            <input
              id="item-name"
              ref={nameRef}
              value={draft.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Chicken tenders"
              maxLength={120}
              required
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="item-category">
              Category
            </label>
            <input
              id="item-category"
              list="truck-categories"
              value={draft.category}
              onChange={(event) => set("category", event.target.value)}
              maxLength={60}
              className={`mt-1 ${FIELD_CLASS}`}
            />
            <datalist id="truck-categories">
              {suggestions.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="item-unit">
              Ordered by
            </label>
            <select
              id="item-unit"
              value={draft.unit}
              onChange={(event) => set("unit", event.target.value)}
              className={`mt-1 ${FIELD_CLASS}`}
            >
              {[...new Set([draft.unit, ...ORDER_UNITS])].map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="item-code">
              Item code
            </label>
            <input
              id="item-code"
              value={draft.supplierItemCode}
              onChange={(event) => set("supplierItemCode", event.target.value)}
              placeholder="PFG item #"
              maxLength={40}
              className={`mt-1 font-mono ${FIELD_CLASS}`}
            />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="item-pack">
              Pack size
            </label>
            <input
              id="item-pack"
              value={draft.packSize}
              onChange={(event) => set("packSize", event.target.value)}
              placeholder="4/5 LB"
              maxLength={60}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="item-brand">
              Brand
            </label>
            <input
              id="item-brand"
              value={draft.brand}
              onChange={(event) => set("brand", event.target.value)}
              maxLength={80}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="item-supplier">
              Supplier
            </label>
            <input
              id="item-supplier"
              value={draft.supplier}
              onChange={(event) => set("supplier", event.target.value)}
              maxLength={80}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="item-price">
              Price per {draft.unit || "unit"}
            </label>
            <input
              id="item-price"
              value={priceText}
              onChange={(event) => setPriceText(event.target.value)}
              inputMode="decimal"
              placeholder="—"
              className={`mt-1 ${FIELD_CLASS}`}
            />
            <p className="mt-1 text-xs text-muted-foreground">Leave blank if you don&apos;t know it.</p>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="item-par">
              Usual order
            </label>
            <input
              id="item-par"
              type="number"
              min={0}
              max={MAX_QUANTITY}
              step="0.5"
              value={draft.parQuantity}
              onChange={(event) => set("parQuantity", Number(event.target.value))}
              className={`mt-1 ${FIELD_CLASS}`}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              What &ldquo;Fill from usual&rdquo; puts on the sheet.
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="px-4 pb-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
          {onRemove && (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onRemove}
              title="Take this item off the set list"
            >
              <Trash2 data-icon="inline-start" />
              Remove
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || !draft.name.trim()}>
              {saving && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
              {saving ? "Saving…" : item ? "Save" : "Add item"}
            </Button>
          </div>
        </footer>
      </form>
    </div>
  );
}
