"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/admin/field";
import {
  createIngredientAction,
  deleteIngredientAction,
  updateIngredientAction,
  type IngredientInput,
} from "@/app/admin/menu-descriptions/actions";
import {
  ALLERGENS,
  FLAVOR_TAGS,
  INGREDIENT_CATEGORIES,
  MAX_INTENSITY,
  TEXTURE_TAGS,
  capitalise,
  type Ingredient,
} from "@/lib/menu-descriptions";
import { Notice, type NoticeState } from "./Notice";
import { TagToggles } from "./TagToggles";

const BLANK: IngredientInput = {
  name: "",
  category: "other",
  flavorTags: [],
  textureTags: [],
  intensity: 3,
  allergens: [],
  notes: "",
};

const toInput = (ingredient: Ingredient): IngredientInput => ({
  name: ingredient.name,
  category: ingredient.category,
  flavorTags: [...ingredient.flavorTags],
  textureTags: [...ingredient.textureTags],
  intensity: ingredient.intensity,
  allergens: [...ingredient.allergens],
  notes: ingredient.notes,
});

/** Which row is open for editing: a new one, an existing one by id, or none. */
type Editing = { kind: "new" } | { kind: "existing"; id: string } | null;

const COLUMNS = 8;

/**
 * The ingredient list: search by name, and add, edit or delete in place.
 *
 * One row is open at a time. Saving an edit to an ingredient that a generated
 * description was written from marks that description out of date, and the
 * notice says how many — nothing is regenerated.
 */
export function IngredientsTable({ ingredients }: { ingredients: Ingredient[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? ingredients.filter((ingredient) => ingredient.name.toLowerCase().includes(needle))
      : ingredients;
  }, [ingredients, query]);

  // A failed save leaves the row open with what was typed; a good one closes it.
  const run = (work: () => Promise<NoticeState>) => {
    setNotice(null);
    startTransition(async () => {
      const outcome = await work();
      setNotice(outcome);
      if (outcome?.tone !== "error") {
        setEditing(null);
        router.refresh();
      }
    });
  };

  const save = (input: IngredientInput) =>
    run(async () => {
      if (editing?.kind === "existing") {
        const result = await updateIngredientAction(editing.id, input);
        if (!result.ok) return { tone: "error", message: result.error };
        const { staleCount } = result.value;
        return staleCount > 0
          ? {
              tone: "info",
              message: `Saved. ${staleCount} description${staleCount === 1 ? " is" : "s are"} now out of date.`,
            }
          : null;
      }
      const result = await createIngredientAction(input);
      return result.ok ? null : { tone: "error", message: result.error };
    });

  const remove = (ingredient: Ingredient) => {
    if (!confirm(`Delete ${ingredient.name}?`)) return;
    run(async () => {
      const result = await deleteIngredientAction(ingredient.id);
      return result.ok ? null : { tone: "error", message: result.error };
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name"
            aria-label="Search ingredients by name"
            className={`${FIELD_CLASS} pl-9`}
          />
        </div>
        <Button
          size="lg"
          disabled={editing?.kind === "new"}
          onClick={() => {
            setNotice(null);
            setEditing({ kind: "new" });
          }}
        >
          <Plus data-icon="inline-start" />
          Add ingredient
        </Button>
      </div>

      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      <div className="overflow-x-auto rounded-xl border border-border bg-background shadow-sm">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-semibold">Name</th>
              <th className="px-2 py-2.5 font-semibold">Category</th>
              <th className="px-2 py-2.5 font-semibold">Flavor</th>
              <th className="px-2 py-2.5 font-semibold">Texture</th>
              <th className="px-2 py-2.5 font-semibold">Intensity</th>
              <th className="px-2 py-2.5 font-semibold">Allergens</th>
              <th className="px-2 py-2.5 font-semibold">Notes</th>
              <th className="px-4 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {editing?.kind === "new" && (
              <EditorRow
                initial={BLANK}
                pending={pending}
                onSave={save}
                onCancel={() => setEditing(null)}
              />
            )}

            {visible.map((ingredient) =>
              editing?.kind === "existing" && editing.id === ingredient.id ? (
                <EditorRow
                  key={ingredient.id}
                  initial={toInput(ingredient)}
                  pending={pending}
                  onSave={save}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <tr key={ingredient.id} className="align-top">
                  <td className="px-4 py-2.5 font-semibold">{ingredient.name}</td>
                  <td className="px-2 py-2.5 text-muted-foreground">{capitalise(ingredient.category)}</td>
                  <td className="px-2 py-2.5">
                    <Chips values={ingredient.flavorTags} />
                  </td>
                  <td className="px-2 py-2.5">
                    <Chips values={ingredient.textureTags} />
                  </td>
                  <td className="px-2 py-2.5">
                    <IntensityDots value={ingredient.intensity} />
                  </td>
                  <td className="px-2 py-2.5">
                    <Chips values={ingredient.allergens} tone="allergen" />
                  </td>
                  <td className="max-w-48 px-2 py-2.5 text-xs text-muted-foreground">
                    {ingredient.notes || "—"}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${ingredient.name}`}
                      disabled={pending}
                      onClick={() => {
                        setNotice(null);
                        setEditing({ kind: "existing", id: ingredient.id });
                      }}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${ingredient.name}`}
                      disabled={pending}
                      onClick={() => remove(ingredient)}
                    >
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ),
            )}

            {visible.length === 0 && editing?.kind !== "new" && (
              <tr>
                <td colSpan={COLUMNS} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {ingredients.length === 0
                    ? "No ingredients yet."
                    : `No ingredient matches “${query.trim()}”.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ editing */

function EditorRow({
  initial,
  pending,
  onSave,
  onCancel,
}: {
  initial: IngredientInput;
  pending: boolean;
  onSave: (input: IngredientInput) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const set = <K extends keyof IngredientInput>(key: K, value: IngredientInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <tr className="bg-muted/40">
      <td colSpan={COLUMNS} className="p-0">
        {/* Pinned to the visible part of the table, so on a phone the editor
            stays on screen instead of stretching to the table's full width. */}
        <form
          className="sticky left-0 w-[min(100%,calc(100vw-2.5rem))] space-y-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(form);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancel();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <label className="block">
              <span className={LABEL_CLASS}>Name</span>
              <input
                autoFocus
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Duke's mayonnaise"
                maxLength={80}
                className={`${FIELD_CLASS} mt-1`}
              />
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>Category</span>
              <select
                value={form.category}
                onChange={(event) => set("category", event.target.value)}
                className={`${FIELD_CLASS} mt-1`}
              >
                {INGREDIENT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {capitalise(category)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset>
            <legend className={LABEL_CLASS}>Intensity — how loudly it reads in a dish</legend>
            <div className="mt-1 flex gap-1">
              {Array.from({ length: MAX_INTENSITY }, (_, index) => index + 1).map((level) => (
                <button
                  key={level}
                  type="button"
                  aria-pressed={form.intensity === level}
                  onClick={() => set("intensity", level)}
                  className={`size-8 rounded-lg border text-sm font-semibold tabular-nums transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                    form.intensity === level
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {level}
                </button>
              ))}
              <span className="ml-2 self-center text-xs text-muted-foreground">
                1 barely there · 5 dominates
              </span>
            </div>
          </fieldset>

          <TagToggles
            legend="Flavor"
            options={FLAVOR_TAGS}
            value={form.flavorTags}
            onChange={(value) => set("flavorTags", value)}
          />
          <TagToggles
            legend="Texture"
            options={TEXTURE_TAGS}
            value={form.textureTags}
            onChange={(value) => set("textureTags", value)}
          />
          <TagToggles
            legend="Allergens"
            options={ALLERGENS}
            value={form.allergens}
            onChange={(value) => set("allergens", value)}
            tone="allergen"
          />

          <label className="block">
            <span className={LABEL_CLASS}>Notes (optional)</span>
            <input
              value={form.notes}
              onChange={(event) => set("notes", event.target.value)}
              placeholder="Smoked in-house 4 hrs"
              maxLength={500}
              className={`${FIELD_CLASS} mt-1`}
            />
          </label>

          <div className="flex gap-2">
            <Button type="submit" size="lg" disabled={pending || !form.name.trim()}>
              <Check data-icon="inline-start" />
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ display */

function Chips({ values, tone }: { values: readonly string[]; tone?: "allergen" }) {
  if (values.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((value) => (
        <span
          key={value}
          className={`rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${
            tone === "allergen" ? "bg-amber-100 text-amber-900" : "bg-muted text-foreground"
          }`}
        >
          {value}
        </span>
      ))}
    </span>
  );
}

function IntensityDots({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`Intensity ${value} of ${MAX_INTENSITY}`}>
      {Array.from({ length: MAX_INTENSITY }, (_, index) => (
        <span
          key={index}
          className={`size-2 rounded-full ${index < value ? "bg-brand" : "bg-border"}`}
        />
      ))}
    </span>
  );
}
