"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FIELD_CLASS } from "@/components/admin/field";
import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
} from "@/app/admin/menu-descriptions/actions";
import { MAX_CATEGORY_LENGTH, capitalise, type Ingredient } from "@/lib/menu-descriptions";
import { Notice, type NoticeState } from "./Notice";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The ingredient category list: add, rename, delete.
 *
 * Renaming carries every ingredient in the category along with it. A category
 * with ingredients still in it can't be deleted — they have to be moved first,
 * which the database enforces too.
 */
export function CategoriesPanel({
  categories,
  ingredients,
  onClose,
}: {
  categories: string[];
  ingredients: Ingredient[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const ingredient of ingredients) {
      byCategory.set(ingredient.category, (byCategory.get(ingredient.category) ?? 0) + 1);
    }
    return byCategory;
  }, [ingredients]);

  const run = (work: () => Promise<NoticeState>, onDone: () => void) => {
    setNotice(null);
    startTransition(async () => {
      const outcome = await work();
      setNotice(outcome);
      if (outcome?.tone !== "error") {
        onDone();
        router.refresh();
      }
    });
  };

  const add = () =>
    run(
      async () => {
        const result = await createCategoryAction(newName);
        return result.ok ? null : { tone: "error", message: result.error };
      },
      () => setNewName(""),
    );

  const rename = ({ from, to }: { from: string; to: string }) =>
    run(
      async () => {
        const result = await renameCategoryAction(from, to);
        if (!result.ok) return { tone: "error", message: result.error };
        const { staleCount } = result.value;
        return staleCount > 0
          ? {
              tone: "info",
              message: `Renamed. ${staleCount} description${staleCount === 1 ? " is" : "s are"} now out of date.`,
            }
          : null;
      },
      () => setRenaming(null),
    );

  const remove = (category: string) => {
    const inUse = counts.get(category) ?? 0;
    if (inUse > 0) {
      setNotice({
        tone: "error",
        message: `Move the ${plural(inUse, "ingredient")} in ${capitalise(category)} to another category first.`,
      });
      return;
    }
    if (!confirm(`Delete the ${capitalise(category)} category?`)) return;
    run(
      async () => {
        const result = await deleteCategoryAction(category);
        return result.ok ? null : { tone: "error", message: result.error };
      },
      () => {},
    );
  };

  return (
    <section
      aria-labelledby="categories-heading"
      className="space-y-3 rounded-xl border border-border bg-background p-4 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <div className="mr-auto">
          <h2 id="categories-heading" className="font-heading font-bold">
            Categories
          </h2>
          <p className="text-xs text-muted-foreground">
            Renaming one moves its ingredients with it. One still in use can&rsquo;t be deleted.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X data-icon="inline-start" />
          Done
        </Button>
      </div>

      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      <ul className="divide-y divide-border rounded-lg border border-border">
        {categories.map((category) =>
          renaming?.from === category ? (
            <li key={category}>
              <form
                className="flex flex-wrap items-center gap-2 p-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  rename(renaming);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setRenaming(null);
                }}
              >
                <input
                  autoFocus
                  value={renaming.to}
                  onChange={(event) => setRenaming({ from: category, to: event.target.value })}
                  aria-label={`New name for ${category}`}
                  maxLength={MAX_CATEGORY_LENGTH}
                  className={`${FIELD_CLASS} min-w-0 flex-1`}
                />
                <Button type="submit" size="sm" disabled={pending || !renaming.to.trim()}>
                  <Check data-icon="inline-start" />
                  {pending ? "Saving…" : "Save"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(null)}>
                  Cancel
                </Button>
              </form>
            </li>
          ) : (
            <li key={category} className="flex items-center gap-2 py-1.5 pr-2 pl-3">
              <span className="font-semibold">{capitalise(category)}</span>
              <span className="mr-auto text-xs text-muted-foreground">
                {plural(counts.get(category) ?? 0, "ingredient")}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Rename ${category}`}
                disabled={pending}
                onClick={() => {
                  setNotice(null);
                  setRenaming({ from: category, to: category });
                }}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${category}`}
                disabled={pending}
                onClick={() => remove(category)}
              >
                <Trash2 />
              </Button>
            </li>
          ),
        )}
      </ul>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New category, e.g. frozen"
          aria-label="New category name"
          maxLength={MAX_CATEGORY_LENGTH}
          className={`${FIELD_CLASS} min-w-0 flex-1`}
        />
        <Button type="submit" disabled={pending || !newName.trim()}>
          <Plus data-icon="inline-start" />
          Add category
        </Button>
      </form>
    </section>
  );
}
