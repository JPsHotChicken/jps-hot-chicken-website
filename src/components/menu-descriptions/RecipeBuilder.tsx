"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  History,
  LoaderCircle,
  Menu,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { AdminDrawer } from "@/components/admin/AdminDrawer";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/admin/field";
import {
  deleteRecipeAction,
  generateDescriptionAction,
  saveRecipeAction,
  type RecipeInput,
} from "@/app/admin/menu-descriptions/actions";
import {
  COMPONENT_UNITS,
  MENU_DESCRIPTIONS_PATH,
  YIELD_UNITS,
  capitalise,
  countWords,
  formatTimestamp,
  rollUpAllergens,
  wouldCreateLoop,
  type Library,
  type Recipe,
  type RecipeComponent,
} from "@/lib/menu-descriptions";
import { Notice, type NoticeState } from "./Notice";
import { PartPicker, type PartOption, type PartValue } from "./PartPicker";
import { StaleBadge } from "./StaleBadge";
import { TasteProfileChart } from "./TasteProfileChart";

/* --------------------------------------------------------------------- form */

type Row = {
  /** React's handle on the row; never saved. */
  key: number;
  part: PartValue;
  amount: string;
  unit: string;
  prepNote: string;
};

type Form = {
  name: string;
  isMenuItem: boolean;
  yieldAmount: string;
  yieldUnit: string;
  description: string;
  descriptionShort: string;
  rows: Row[];
};

let nextRowKey = 0;

const blankRow = (): Row => ({ key: nextRowKey++, part: null, amount: "", unit: "oz", prepNote: "" });

function toForm(recipe: Recipe | null): Form {
  if (!recipe) {
    return {
      name: "",
      isMenuItem: true,
      yieldAmount: "1",
      yieldUnit: "each",
      description: "",
      descriptionShort: "",
      rows: [blankRow()],
    };
  }
  return {
    name: recipe.name,
    isMenuItem: recipe.isMenuItem,
    yieldAmount: recipe.yieldAmount === null ? "" : String(recipe.yieldAmount),
    yieldUnit: recipe.yieldUnit || "each",
    description: recipe.description ?? "",
    descriptionShort: recipe.descriptionShort ?? "",
    rows: recipe.components.map((part) => ({
      key: nextRowKey++,
      part: part.itemId
        ? { kind: "item", id: part.itemId }
        : { kind: "recipe", id: part.childRecipeId! },
      amount: String(part.amount),
      unit: part.unit,
      prepNote: part.prepNote,
    })),
  };
}

/** A row nobody has started filling in is ignored rather than rejected. */
const isUntouched = (row: Row) => !row.part && !row.amount.trim() && !row.prepNote.trim();

function toInput(form: Form): RecipeInput {
  return {
    name: form.name,
    isMenuItem: form.isMenuItem,
    yieldAmount: form.yieldAmount,
    yieldUnit: form.yieldUnit,
    description: form.description,
    descriptionShort: form.descriptionShort,
    components: form.rows
      .filter((row) => !isUntouched(row))
      .map((row) => ({
        itemId: row.part?.kind === "item" ? row.part.id : null,
        childRecipeId: row.part?.kind === "recipe" ? row.part.id : null,
        amount: row.amount,
        unit: row.unit,
        prepNote: row.prepNote,
      })),
  };
}

/* ------------------------------------------------------------------ builder */

type Props = {
  /** Null while composing a recipe that hasn't been saved yet. */
  recipe: Recipe | null;
  library: Library;
  /** Whether the API key is set, so Generate can say why it's unavailable. */
  generatorReady: boolean;
};

/**
 * Compose a recipe from ingredients and other recipes, and generate its menu
 * copy.
 *
 * Everything on screen is one form with one Save. Generate works from the saved
 * recipe, so with unsaved changes it saves them first. It never runs on its own:
 * a changed ingredient only marks the description out of date.
 *
 * The form starts over from the saved recipe after every save or generation —
 * keyed on the recipe's timestamps — so what's on screen is always what was
 * stored, trimmed and rounded. The notice lives out here, above that key, so an
 * error survives the reload that follows it.
 */
export function RecipeBuilder(props: Props) {
  const [notice, setNotice] = useState<NoticeState>(null);
  const { recipe } = props;
  return (
    <Builder
      key={recipe ? `${recipe.id}:${recipe.updatedAt}:${recipe.generatedAt}` : "new"}
      {...props}
      notice={notice}
      setNotice={setNotice}
    />
  );
}

function Builder({
  recipe,
  library,
  generatorReady,
  notice,
  setNotice,
}: Props & { notice: NoticeState; setNotice: (notice: NoticeState) => void }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState<Form>(() => toForm(recipe));
  const [initial] = useState(() => JSON.stringify(toInput(toForm(recipe))));
  const [busy, setBusy] = useState<"saving" | "generating" | "deleting" | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const setRow = (key: number, patch: Partial<Row>) =>
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }));

  const dirty = !recipe || JSON.stringify(toInput(form)) !== initial;
  const working = pending || busy !== null;

  const options = useMemo<PartOption[]>(
    () => [
      ...library.ingredients.map((ingredient) => ({
        kind: "item" as const,
        id: ingredient.id,
        code: ingredient.code,
        name: ingredient.name,
        detail: ingredient.category,
      })),
      // A recipe that already contains this one would close a loop, so it
      // isn't offered. The database refuses it too.
      ...library.recipes
        .filter((candidate) => !wouldCreateLoop(recipe?.id ?? null, candidate.id, library.recipes))
        .map((candidate) => ({
          kind: "recipe" as const,
          id: candidate.id,
          name: candidate.name,
          detail: candidate.isMenuItem ? "Menu item" : "Component",
        })),
    ],
    [library, recipe],
  );

  const allergens = useMemo(() => {
    const lines: RecipeComponent[] = form.rows.flatMap((row) =>
      row.part
        ? [
            {
              itemId: row.part.kind === "item" ? row.part.id : null,
              childRecipeId: row.part.kind === "recipe" ? row.part.id : null,
              amount: 0,
              unit: row.unit,
              prepNote: "",
            },
          ]
        : [],
    );
    return rollUpAllergens(lines, library);
  }, [form.rows, library]);

  /** Run an action, keeping the button that started it labelled while it works. */
  const run = (kind: NonNullable<typeof busy>, work: () => Promise<void>) => {
    setNotice(null);
    setBusy(kind);
    startTransition(async () => {
      try {
        await work();
      } finally {
        setBusy(null);
      }
    });
  };

  const fail = (message: string) => setNotice({ tone: "error", message });

  const save = () =>
    run("saving", async () => {
      const result = await saveRecipeAction(recipe?.id ?? null, toInput(form));
      if (!result.ok) return fail(result.error);
      // A new recipe gets its own address once saved; an existing one reloads.
      if (recipe) router.refresh();
      else router.replace(`${MENU_DESCRIPTIONS_PATH}/${result.value.id}`);
    });

  // Only offered once the recipe exists: a new recipe changes address when it's
  // first saved, and a failure message wouldn't survive the move.
  const generate = (id: string) => {
    const hasText = form.description.trim() || form.descriptionShort.trim();
    if (hasText && !confirm("Replace the current description with a newly generated one?")) return;

    run("generating", async () => {
      if (dirty) {
        const saved = await saveRecipeAction(id, toInput(form));
        if (!saved.ok) return fail(saved.error);
      }
      const result = await generateDescriptionAction(id);
      if (!result.ok) fail(result.error);
      router.refresh();
    });
  };

  const remove = () => {
    if (!recipe || !confirm(`Delete ${recipe.name}? This can't be undone.`)) return;
    run("deleting", async () => {
      const result = await deleteRecipeAction(recipe.id);
      if (!result.ok) return fail(result.error);
      router.replace(MENU_DESCRIPTIONS_PATH);
    });
  };

  const filledRows = form.rows.filter((row) => row.part).length;
  const shortWords = countWords(form.descriptionShort);
  const verb = recipe?.generatedAt ? "regenerate" : "generate";
  const generateLabel = dirty ? `Save & ${verb}` : capitalise(verb);

  return (
    <div className="min-h-screen bg-muted">
      {/* ----------------------------------------------------------- header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-4 py-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>
          <Link
            href={MENU_DESCRIPTIONS_PATH}
            aria-label="Back to recipes"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronLeft className="size-4" />
          </Link>

          <div className="mr-auto min-w-0">
            <h1 className="truncate font-heading text-lg font-bold tracking-tight">
              {form.name.trim() || (recipe ? recipe.name : "New recipe")}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {form.isMenuItem ? "Menu item" : "Component"}
              {recipe && dirty && " · Unsaved changes"}
            </p>
          </div>

          <Button size="sm" disabled={!dirty || working} onClick={save}>
            {busy === "saving" ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            ) : (
              <Save data-icon="inline-start" />
            )}
            {busy === "saving" ? "Saving…" : "Save"}
          </Button>
        </div>

        {notice && (
          <div className="mx-auto w-full max-w-4xl px-4 pb-3 sm:px-6">
            <Notice notice={notice} onDismiss={() => setNotice(null)} />
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:px-6">
        {/* ------------------------------------------------------- details */}
        <Panel title="Recipe">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="block sm:col-span-2">
              <span className={LABEL_CLASS}>Name</span>
              <input
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Nashville Hot Chicken Sandwich"
                maxLength={120}
                className={`${FIELD_CLASS} mt-1`}
              />
            </label>

            <div className="flex items-start gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={form.isMenuItem}
                aria-labelledby="menu-item-label"
                onClick={() => set("isMenuItem", !form.isMenuItem)}
                className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                  form.isMenuItem ? "bg-brand" : "bg-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                    form.isMenuItem ? "translate-x-4" : ""
                  }`}
                />
              </button>
              <div>
                <p id="menu-item-label" className="text-sm font-semibold">
                  Menu item
                </p>
                <p className="text-xs text-muted-foreground">
                  On for things you sell. Off for sauces, dredges and other components.
                </p>
              </div>
            </div>

            <fieldset className="flex items-end gap-2">
              <legend className={LABEL_CLASS}>Yield</legend>
              <input
                value={form.yieldAmount}
                onChange={(event) => set("yieldAmount", event.target.value)}
                inputMode="decimal"
                aria-label="Yield amount"
                placeholder="32"
                className={`${FIELD_CLASS} mt-1 w-20`}
              />
              <select
                value={form.yieldUnit}
                onChange={(event) => set("yieldUnit", event.target.value)}
                aria-label="Yield unit"
                className={`${FIELD_CLASS} mt-1 w-24`}
              >
                {YIELD_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </fieldset>
          </div>
        </Panel>

        {/* ---------------------------------------------------- components */}
        <Panel
          title="Components"
          hint="Items from the catalogue and other recipes. Amounts matter — the taste profile is weighted by them."
        >
          <div
            aria-hidden
            className="mb-1.5 hidden gap-2 text-xs font-semibold text-muted-foreground sm:grid sm:grid-cols-[minmax(0,2.2fr)_5rem_5.5rem_minmax(0,1.6fr)_1.75rem]"
          >
            <span>Item or recipe</span>
            <span>Amount</span>
            <span>Unit</span>
            <span>Prep note</span>
          </div>

          <ol className="space-y-3 sm:space-y-2">
            {form.rows.map((row, position) => (
              <li
                key={row.key}
                className="grid grid-cols-[5rem_5.5rem_minmax(0,1fr)_1.75rem] gap-2 border-b border-border pb-3 last:border-b-0 sm:grid-cols-[minmax(0,2.2fr)_5rem_5.5rem_minmax(0,1.6fr)_1.75rem] sm:border-b-0 sm:pb-0"
              >
                <div className="col-span-4 sm:col-span-1">
                  <PartPicker
                    label={`Component ${position + 1}`}
                    options={options}
                    value={row.part}
                    onChange={(part) => setRow(row.key, { part })}
                  />
                </div>
                <input
                  value={row.amount}
                  onChange={(event) => setRow(row.key, { amount: event.target.value })}
                  inputMode="decimal"
                  placeholder="6"
                  aria-label={`Component ${position + 1} amount`}
                  className={FIELD_CLASS}
                />
                <select
                  value={row.unit}
                  onChange={(event) => setRow(row.key, { unit: event.target.value })}
                  aria-label={`Component ${position + 1} unit`}
                  className={FIELD_CLASS}
                >
                  {COMPONENT_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <input
                  value={row.prepNote}
                  onChange={(event) => setRow(row.key, { prepNote: event.target.value })}
                  placeholder="toasted"
                  maxLength={200}
                  aria-label={`Component ${position + 1} prep note`}
                  className={FIELD_CLASS}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="self-center"
                  aria-label={`Remove component ${position + 1}`}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      rows: current.rows.filter((candidate) => candidate.key !== row.key),
                    }))
                  }
                >
                  <X />
                </Button>
              </li>
            ))}
          </ol>

          {form.rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No components yet.</p>
          )}

          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => set("rows", [...form.rows, blankRow()])}
          >
            <Plus data-icon="inline-start" />
            Add component
          </Button>
        </Panel>

        {/* ------------------------------------------------------ allergens */}
        <Panel
          title="Allergens"
          hint="Rolled up from every component, including what's inside sub-recipes and what each item is made of."
        >
          {allergens.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {filledRows === 0
                ? "Add components to see their allergens."
                : "None of these components lists an allergen. Check the items themselves if that looks wrong."}
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {allergens.map(({ allergen, sources }) => (
                <li key={allergen} className="flex items-baseline gap-2 text-sm">
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    {allergen}
                  </span>
                  <span className="text-xs text-muted-foreground">{sources.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ---------------------------------------------------- description */}
        <Panel
          title="Menu description"
          hint={
            recipe?.generatedAt
              ? `Generated ${formatTimestamp(recipe.generatedAt)}`
              : "Not generated yet"
          }
          action={
            recipe && (
              <Button
                size="sm"
                disabled={working || !generatorReady || filledRows === 0}
                onClick={() => generate(recipe.id)}
              >
                {busy === "generating" ? (
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                ) : (
                  <Sparkles data-icon="inline-start" />
                )}
                {busy === "generating" ? "Writing…" : generateLabel}
              </Button>
            )
          }
        >
          <div className="space-y-4">
            {recipe?.isStale && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <History className="mt-0.5 size-4 shrink-0" />
                <p className="flex-1">
                  <StaleBadge />{" "}
                  An ingredient or component changed after this was written. Regenerate when you
                  want the description to catch up.
                </p>
              </div>
            )}

            {!recipe && (
              <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                Save the recipe, then generate its description from here.
              </p>
            )}

            {recipe && !generatorReady && (
              <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                Generating isn&apos;t set up yet. Add <code className="font-mono">ANTHROPIC_API_KEY</code>{" "}
                to the environment to turn it on. You can still write descriptions by hand.
              </p>
            )}

            {busy === "generating" && (
              <p role="status" className="text-sm text-muted-foreground">
                Writing from the saved recipe — this usually takes under a minute.
              </p>
            )}

            <label className="block">
              <span className="flex items-baseline justify-between gap-2">
                <span className={LABEL_CLASS}>Short — for tight menus</span>
                <span
                  className={`text-xs tabular-nums ${shortWords >= 20 ? "font-semibold text-amber-700" : "text-muted-foreground"}`}
                >
                  {shortWords} word{shortWords === 1 ? "" : "s"}
                </span>
              </span>
              <textarea
                value={form.descriptionShort}
                onChange={(event) => set("descriptionShort", event.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Generate one, or write your own."
                className={`${FIELD_CLASS} mt-1 resize-y`}
              />
            </label>

            <label className="block">
              <span className={LABEL_CLASS}>Long — for online ordering and printed menus</span>
              <textarea
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Generate one, or write your own."
                className={`${FIELD_CLASS} mt-1 resize-y`}
              />
            </label>

            {recipe?.tasteProfile && (
              <div className="grid gap-5 border-t border-border pt-4 sm:grid-cols-2">
                <div>
                  <h3 className={`${LABEL_CLASS} mb-2`}>Taste profile</h3>
                  <TasteProfileChart profile={recipe.tasteProfile} />
                </div>
                <div className="space-y-4">
                  <TagList title="Texture" values={recipe.textureNotes} />
                  <TagList title="Pairs with" values={recipe.pairsWith} />
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button disabled={!dirty || working} onClick={save}>
                <Save data-icon="inline-start" />
                {busy === "saving" ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </Panel>

        {recipe && (
          <div className="flex justify-end pb-4">
            <Button variant="destructive" size="sm" disabled={working} onClick={remove}>
              <Trash2 data-icon="inline-start" />
              {busy === "deleting" ? "Deleting…" : "Delete recipe"}
            </Button>
          </div>
        )}
      </main>

      <AdminDrawer open={menuOpen} view="menuDescriptions" onOpenChange={setMenuOpen} />
    </div>
  );
}

/* ------------------------------------------------------------------- pieces */

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

function TagList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <h3 className={`${LABEL_CLASS} mb-2`}>{title}</h3>
      {values.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <li key={value} className="rounded-full bg-muted px-2.5 py-1 text-xs">
              {value}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
