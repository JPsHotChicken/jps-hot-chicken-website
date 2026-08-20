"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/admin/field";
import {
  ITEM_SCOPES,
  ITEM_SCOPE_LABELS,
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  nextCode,
  type ItemScope,
  type ItemType,
} from "@/lib/items";
import { createItemAction, type ItemFormInput } from "@/app/admin/items/actions";

/** A blank record, before the type-specific fields are filled in. */
const EMPTY: Omit<ItemFormInput, "code" | "type" | "internalName" | "category" | "scope"> = {
  customerName: "",
  aliases: [],
  subcategory: "",
  status: "active",
  purchaseUnit: "",
  packSize: "",
  purchaseCost: null,
  parLevel: null,
  reorderPoint: null,
  stockUnit: "",
  portionUnit: "",
  stockPerPurchaseUnit: null,
  portionsPerStockUnit: null,
  yieldFactor: "1",
  batchYieldQuantity: "1",
  recipeUrl: "",
  menuPrice: null,
  allergens: [],
  storageZone: "none",
  storageTemp: "",
  shelfLifeDays: null,
  dateLabelRule: "",
  photoUrl: "",
  notes: "",
  availableEverywhere: true,
};

export function NewItemForm({
  existingCodes,
  categories,
}: {
  existingCodes: string[];
  categories: string[];
}) {
  const router = useRouter();
  const [type, setType] = useState<ItemType>("raw");
  // Null until somebody types their own code, at which point it is theirs and
  // stops following the type. Derived rather than synced, so the box can never
  // disagree with the type selected above it.
  const [customCode, setCustomCode] = useState<string | null>(null);
  const code = customCode ?? nextCode(type, existingCodes);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState<ItemScope>("core");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const created = await createItemAction({
          ...EMPTY,
          code,
          type,
          internalName: name,
          category,
          scope,
        });
        router.push(`/operations/items/${encodeURIComponent(created)}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Couldn't create that item.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-border bg-background p-4 shadow-sm">
        <label className="block">
          <span className={LABEL_CLASS}>What layer is it?</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as ItemType)}
            className={`${FIELD_CLASS} mt-1`}
          >
            {ITEM_TYPES.map((option) => (
              <option key={option} value={option}>
                {ITEM_TYPE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Item code</span>
          <input
            value={code}
            onChange={(event) => setCustomCode(event.target.value)}
            className={`${FIELD_CLASS} mt-1 font-mono`}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            Permanent. It is never reused or renumbered, because every other document points at it.
          </span>
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Internal name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="How the crew refers to it"
            autoFocus
            className={`${FIELD_CLASS} mt-1`}
          />
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Category</span>
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            list="item-categories"
            placeholder="Protein, Dairy, Sandwiches…"
            className={`${FIELD_CLASS} mt-1`}
          />
          <datalist id="item-categories">
            {categories.map((existing) => (
              <option key={existing} value={existing} />
            ))}
          </datalist>
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>Scope</span>
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as ItemScope)}
            className={`${FIELD_CLASS} mt-1`}
          >
            {ITEM_SCOPES.map((option) => (
              <option key={option} value={option}>
                {ITEM_SCOPE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <Button size="lg" className="w-full" disabled={pending || !name.trim()} onClick={submit}>
        <Plus data-icon="inline-start" />
        {pending ? "Creating…" : "Create item"}
      </Button>
    </div>
  );
}
