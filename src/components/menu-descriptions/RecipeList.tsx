import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MENU_DESCRIPTIONS_PATH, formatTimestamp, type Recipe } from "@/lib/menu-descriptions";
import { StaleBadge } from "./StaleBadge";

/** Recipes in two groups: what is sold, and what goes into it. */
export function RecipeList({ recipes }: { recipes: Recipe[] }) {
  const menuItems = recipes.filter((recipe) => recipe.isMenuItem);
  const components = recipes.filter((recipe) => !recipe.isMenuItem);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-muted-foreground">
          Build a recipe from ingredients and other recipes, then generate its menu copy.
        </p>
        <Button size="lg" render={<Link href={`${MENU_DESCRIPTIONS_PATH}/new`} />}>
          <Plus data-icon="inline-start" />
          New recipe
        </Button>
      </div>

      <Section
        title="Menu items"
        empty="No menu items yet. Turn on “Menu item” in a recipe to list it here."
        recipes={menuItems}
      />
      <Section
        title="Components"
        empty="No components yet. Sauces, dredges and other sub-recipes go here."
        recipes={components}
      />
    </>
  );
}

function Section({ title, empty, recipes }: { title: string; empty: string; recipes: Recipe[] }) {
  return (
    <section className="rounded-xl border border-border bg-background shadow-sm">
      <header className="flex items-baseline gap-2 border-b border-border px-4 py-3">
        <h2 className="font-heading text-base font-bold">{title}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{recipes.length}</span>
      </header>

      {recipes.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <Link
                href={`${MENU_DESCRIPTIONS_PATH}/${recipe.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    <span className="truncate">{recipe.name}</span>
                    {recipe.isStale && <StaleBadge />}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {recipe.components.length} component{recipe.components.length === 1 ? "" : "s"}
                    {" · "}
                    {recipe.generatedAt
                      ? `Generated ${formatTimestamp(recipe.generatedAt)}`
                      : "Not generated yet"}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
