"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, FileUp, LoaderCircle, Pencil, Plus, Search, Tags, Trash2 } from "lucide-react";

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
  MAX_INTENSITY,
  TEXTURE_TAGS,
  capitalise,
  type Ingredient,
  type SpecSheetReading,
} from "@/lib/menu-descriptions";
import { CategoriesPanel } from "./CategoriesPanel";
import { Notice, type NoticeState } from "./Notice";
import { TagToggles } from "./TagToggles";

const SPEC_SHEET_URL = "/api/admin/menu-descriptions/spec-sheet";

const blank = (categories: string[]): IngredientInput => ({
  name: "",
  category: categories.includes("other") ? "other" : (categories[0] ?? ""),
  flavorTags: [],
  textureTags: [],
  intensity: 3,
  allergens: [],
  notes: "",
});

const toInput = (ingredient: Omit<Ingredient, "id">): IngredientInput => ({
  name: ingredient.name,
  category: ingredient.category,
  flavorTags: [...ingredient.flavorTags],
  textureTags: [...ingredient.textureTags],
  intensity: ingredient.intensity,
  allergens: [...ingredient.allergens],
  notes: ingredient.notes,
});

/**
 * Which row is open for editing: a new one, an existing one by id, or none. A
 * new row read from a spec sheet opens holding what was read; `version` gives
 * each such row a fresh form.
 */
type Editing =
  | { kind: "new"; initial: IngredientInput; version: number }
  | { kind: "existing"; id: string }
  | null;

/** Reads a spec sheet into ingredient details, or says what went wrong. */
async function postSpecSheet(file: File): Promise<SpecSheetReading> {
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(SPEC_SHEET_URL, { method: "POST", body });
  // A platform timeout answers with a page, not JSON.
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ingredient) {
    throw new Error(result.error ?? "That PDF couldn't be read. Try again.");
  }
  return result as SpecSheetReading;
}

const COLUMNS = 8;

/**
 * The ingredient list: search by name, and add, edit or delete in place.
 *
 * One row is open at a time. Saving an edit to an ingredient that a generated
 * description was written from marks that description out of date, and the
 * notice says how many — nothing is regenerated.
 *
 * An ingredient can also be filled in from a supplier's spec sheet PDF. The
 * model's reading only ever fills the form; the owner checks it and saves.
 */
export function IngredientsTable({
  ingredients,
  categories,
}: {
  ingredients: Ingredient[];
  categories: string[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [pending, startTransition] = useTransition();
  const [showCategories, setShowCategories] = useState(false);
  /** The name of the PDF being read, while it is. */
  const [reading, setReading] = useState<string | null>(null);
  const version = useRef(0);
  const pdfInput = useRef<HTMLInputElement>(null);

  const openNew = (initial: IngredientInput) => {
    version.current += 1;
    setEditing({ kind: "new", initial, version: version.current });
  };

  /** Read a PDF, saying what to check on success and what went wrong otherwise. */
  const readSheet = async (file: File): Promise<SpecSheetReading | null> => {
    setNotice(null);
    setReading(file.name);
    try {
      const sheet = await postSpecSheet(file);
      setNotice({
        tone: "info",
        message:
          `Filled in from ${file.name}. Check it over, allergens especially, then save.` +
          (sheet.crossContact ? ` The sheet also warns: ${sheet.crossContact}` : ""),
      });
      return sheet;
    } catch (problem) {
      setNotice({ tone: "error", message: (problem as Error).message });
      return null;
    } finally {
      setReading(null);
    }
  };

  const busy = pending || reading !== null;

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
        <div className="relative min-w-0 flex-1 basis-full sm:basis-0">
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
          variant="outline"
          size="lg"
          aria-expanded={showCategories}
          onClick={() => setShowCategories((open) => !open)}
        >
          <Tags data-icon="inline-start" />
          Categories
        </Button>
        <input
          ref={pdfInput}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-label="Spec sheet PDF"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            const sheet = await readSheet(file);
            if (sheet) openNew(toInput(sheet.ingredient));
          }}
        />
        <Button
          variant="outline"
          size="lg"
          disabled={busy || editing?.kind === "new"}
          onClick={() => pdfInput.current?.click()}
        >
          {reading !== null && editing?.kind !== "new" ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" />
          ) : (
            <FileUp data-icon="inline-start" />
          )}
          {reading !== null && editing?.kind !== "new" ? "Reading the PDF…" : "Add from PDF"}
        </Button>
        <Button
          size="lg"
          disabled={busy || editing?.kind === "new"}
          onClick={() => {
            setNotice(null);
            openNew(blank(categories));
          }}
        >
          <Plus data-icon="inline-start" />
          Add ingredient
        </Button>
      </div>

      {showCategories && (
        <CategoriesPanel
          categories={categories}
          ingredients={ingredients}
          onClose={() => setShowCategories(false)}
        />
      )}

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
                key={editing.version}
                initial={editing.initial}
                categories={categories}
                pending={pending}
                reading={reading}
                onReadSheet={readSheet}
                onSave={save}
                onCancel={() => setEditing(null)}
              />
            )}

            {visible.map((ingredient) =>
              editing?.kind === "existing" && editing.id === ingredient.id ? (
                <EditorRow
                  key={ingredient.id}
                  initial={toInput(ingredient)}
                  categories={categories}
                  pending={pending}
                  reading={reading}
                  onReadSheet={readSheet}
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
  categories,
  pending,
  reading,
  onReadSheet,
  onSave,
  onCancel,
}: {
  initial: IngredientInput;
  categories: string[];
  pending: boolean;
  /** The name of a PDF being read, anywhere on the table. */
  reading: string | null;
  onReadSheet: (file: File) => Promise<SpecSheetReading | null>;
  onSave: (input: IngredientInput) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const pdfInput = useRef<HTMLInputElement>(null);
  const set = <K extends keyof IngredientInput>(key: K, value: IngredientInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // A name already typed is kept; everything else is replaced by the sheet.
  const fillFrom = async (file: File) => {
    const sheet = await onReadSheet(file);
    if (!sheet) return;
    setForm((current) => ({
      ...toInput(sheet.ingredient),
      name: current.name.trim() ? current.name : sheet.ingredient.name,
    }));
  };

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
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-2">
            <p className="mr-auto text-xs text-muted-foreground">
              {reading !== null
                ? `Reading ${reading}… this can take up to a minute.`
                : "Have the supplier's spec sheet? Fill this in from the PDF."}
            </p>
            <input
              ref={pdfInput}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              tabIndex={-1}
              aria-label="Spec sheet PDF for this ingredient"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void fillFrom(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending || reading !== null}
              onClick={() => pdfInput.current?.click()}
            >
              {reading !== null ? (
                <LoaderCircle data-icon="inline-start" className="animate-spin" />
              ) : (
                <FileUp data-icon="inline-start" />
              )}
              {reading !== null ? "Reading…" : "Fill from PDF"}
            </Button>
          </div>

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
                {categories.map((category) => (
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
            <Button type="submit" size="lg" disabled={pending || reading !== null || !form.name.trim()}>
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
