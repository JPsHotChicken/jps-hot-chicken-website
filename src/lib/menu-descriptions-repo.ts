import "server-only";

import { getDb } from "@/lib/supabase/server";
import { loadGraph } from "@/lib/items-repo";
import { canBeIngredient, compareItems, unitLabelFor, type ItemGraph } from "@/lib/items";
import {
  recipesUsingItem,
  toTasteProfile,
  type Generation,
  type Ingredient,
  type Library,
  type Recipe,
  type RecipeComponent,
} from "@/lib/menu-descriptions";

/**
 * Every read and write behind the menu description generator.
 *
 * The library is loaded whole: the allergen roll-up, the loop check and the
 * staleness walk all need every recipe's lines in hand, and a single store's
 * items and recipes number in the hundreds at most.
 *
 * Ingredients aren't a table of their own — they are the items catalogue, read
 * through `items-repo` and narrowed here to what a recipe line may point at.
 */

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[menu-descriptions] ${context}: ${error?.message ?? "unknown error"}`);
}

/** Raised for problems worth showing the owner in their own words. */
export class LibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LibraryError";
  }
}

/* -------------------------------------------------------------------- reads */

/**
 * The catalogue as the generator sees it: every item a recipe may be built
 * from, carrying its own components so a prepped item describes itself.
 *
 * A component pointing at something that can't be an ingredient — a wrap sheet
 * inside a sandwich — is left out rather than passed on as a flavour.
 */
function toIngredients(graph: ItemGraph): Ingredient[] {
  const usable = graph.items.filter(canBeIngredient);
  const usableIds = new Set(usable.map((item) => item.id));

  return usable.sort(compareItems).map((item): Ingredient => ({
    id: item.id,
    code: item.code,
    name: item.internalName,
    category: item.category,
    flavorTags: item.flavorTags,
    textureTags: item.textureTags,
    intensity: item.intensity,
    allergens: item.allergens,
    notes: item.notes,
    parts: (graph.components.get(item.id) ?? [])
      .filter((part) => usableIds.has(part.componentId))
      .map((part) => ({
        itemId: part.componentId,
        quantity: part.quantity,
        unit: unitLabelFor(graph.byId.get(part.componentId)!, part.basis),
      })),
  }));
}

export async function loadLibrary(): Promise<Library> {
  const [graph, recipes] = await Promise.all([loadGraph(), loadRecipes()]);
  return { ingredients: toIngredients(graph), recipes };
}

/**
 * Every recipe with its lines, without the catalogue — for a caller that
 * already has the item graph in hand, like the allergen lookup.
 */
export async function loadRecipes(): Promise<Recipe[]> {
  const db = getDb();

  const [recipes, components] = await Promise.all([
    db
      .from("recipes")
      .select(
        `id, name, is_menu_item, yield_amount, yield_unit,
         generated_description, generated_description_short, generated_taste_profile,
         generated_texture_notes, generated_pairs_with, generated_at, description_is_stale, updated_at`,
      )
      .order("name"),
    db
      .from("recipe_components")
      .select("recipe_id, item_id, child_recipe_id, amount, unit, prep_note, sort_order")
      .order("sort_order"),
  ]);

  if (recipes.error) fail("loading recipes", recipes.error);
  if (components.error) fail("loading recipe components", components.error);

  const linesByRecipe = new Map<string, RecipeComponent[]>();
  for (const row of components.data ?? []) {
    const lines = linesByRecipe.get(row.recipe_id) ?? [];
    lines.push({
      itemId: row.item_id,
      childRecipeId: row.child_recipe_id,
      amount: Number(row.amount),
      unit: row.unit,
      prepNote: row.prep_note,
    });
    linesByRecipe.set(row.recipe_id, lines);
  }

  return (recipes.data ?? []).map(
    (row): Recipe => ({
      id: row.id,
      name: row.name,
      isMenuItem: row.is_menu_item,
      yieldAmount: row.yield_amount === null ? null : Number(row.yield_amount),
      yieldUnit: row.yield_unit,
      components: linesByRecipe.get(row.id) ?? [],
      description: row.generated_description,
      descriptionShort: row.generated_description_short,
      tasteProfile: toTasteProfile(row.generated_taste_profile),
      textureNotes: row.generated_texture_notes ?? [],
      pairsWith: row.generated_pairs_with ?? [],
      generatedAt: row.generated_at,
      isStale: row.description_is_stale,
      updatedAt: row.updated_at,
    }),
  );
}

/* ----------------------------------------------------------------- recipes */

export type RecipeDraft = {
  name: string;
  isMenuItem: boolean;
  yieldAmount: number | null;
  yieldUnit: string;
  description: string;
  descriptionShort: string;
  components: RecipeComponent[];
};

const duplicateName = (kind: string, name: string) =>
  new LibraryError(`There's already ${kind} called "${name.trim()}".`);

/**
 * Save a recipe's details and replace its lines, in one transaction.
 *
 * `save_recipe` is a Postgres function so a line the loop trigger rejects rolls
 * back the whole save rather than leaving the recipe with half its lines.
 * Returns the recipe's id, which is new when `id` is null.
 */
export async function saveRecipe(id: string | null, draft: RecipeDraft): Promise<string> {
  const { data, error } = await getDb().rpc("save_recipe", {
    p_id: id,
    p_name: draft.name.trim(),
    p_is_menu_item: draft.isMenuItem,
    p_yield_amount: draft.yieldAmount,
    p_yield_unit: draft.yieldUnit,
    p_description: draft.description,
    p_description_short: draft.descriptionShort,
    p_components: draft.components.map((part) => ({
      item_id: part.itemId,
      child_recipe_id: part.childRecipeId,
      amount: part.amount,
      unit: part.unit,
      prep_note: part.prepNote.trim(),
    })),
  });

  if (error?.code === "23505") throw duplicateName("a recipe", draft.name);
  // The loop trigger and the "no longer exists" check both raise sentences.
  if (error?.code === "23514" || error?.code === "P0002") throw new LibraryError(error.message);
  if (error) fail("saving a recipe", error);
  return data;
}

/** Refused by the database while another recipe still uses this one. */
export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await getDb().from("recipes").delete().eq("id", id);
  if (error?.code === "23503") {
    throw new LibraryError("Another recipe uses this one. Take it out of that recipe first.");
  }
  if (error) fail("deleting a recipe", error);
}

/**
 * Flag descriptions as out of date.
 *
 * Only recipes that have a generated description are touched — "stale" means
 * "written from something that has since changed", which a recipe never
 * generated can't be.
 */
export async function markStale(recipeIds: string[]): Promise<void> {
  if (recipeIds.length === 0) return;
  const { error } = await getDb()
    .from("recipes")
    .update({ description_is_stale: true })
    .in("id", recipeIds)
    .not("generated_at", "is", null);
  if (error) fail("marking descriptions out of date", error);
}

/**
 * Mark every description written from an item out of date, and say how many
 * were fresh until now.
 *
 * This is what the items database calls after a save, so editing a record in
 * the catalogue reaches the menu copy built on it. It is deliberately quiet
 * about failure: a description left looking fresh is worth less than an edit
 * the owner can't save, so the caller logs and carries on.
 */
export async function markStaleForItems(itemIds: string[]): Promise<number> {
  if (itemIds.length === 0) return 0;

  const library = await loadLibrary();
  const affected = new Set(itemIds.flatMap((id) => recipesUsingItem(id, library)));
  await markStale([...affected]);

  return library.recipes.filter(
    (recipe) => affected.has(recipe.id) && recipe.generatedAt && !recipe.isStale,
  ).length;
}

/** Store a fresh generation, replacing whatever description was there. */
export async function storeGeneration(id: string, generation: Generation): Promise<void> {
  const { error } = await getDb()
    .from("recipes")
    .update({
      generated_description: generation.descriptionLong,
      generated_description_short: generation.descriptionShort,
      generated_taste_profile: generation.tasteProfile,
      generated_texture_notes: generation.textureNotes,
      generated_pairs_with: generation.pairsWith,
      generated_at: new Date().toISOString(),
      description_is_stale: false,
    })
    .eq("id", id);
  if (error) fail("storing a generated description", error);
}
