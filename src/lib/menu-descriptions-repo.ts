import "server-only";

import { getDb } from "@/lib/supabase/server";
import {
  ALLERGENS,
  FLAVOR_TAGS,
  TEXTURE_TAGS,
  pickFrom,
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
 * ingredients and recipes number in the hundreds at most.
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

export async function loadLibrary(): Promise<Library> {
  const db = getDb();

  const [ingredients, recipes, components] = await Promise.all([
    db
      .from("ingredients")
      .select("id, name, category, flavor_tags, texture_tags, intensity, allergens, notes")
      .order("name"),
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
      .select("recipe_id, ingredient_id, child_recipe_id, amount, unit, prep_note, sort_order")
      .order("sort_order"),
  ]);

  if (ingredients.error) fail("loading ingredients", ingredients.error);
  if (recipes.error) fail("loading recipes", recipes.error);
  if (components.error) fail("loading recipe components", components.error);

  const linesByRecipe = new Map<string, RecipeComponent[]>();
  for (const row of components.data ?? []) {
    const lines = linesByRecipe.get(row.recipe_id) ?? [];
    lines.push({
      ingredientId: row.ingredient_id,
      childRecipeId: row.child_recipe_id,
      amount: Number(row.amount),
      unit: row.unit,
      prepNote: row.prep_note,
    });
    linesByRecipe.set(row.recipe_id, lines);
  }

  return {
    ingredients: (ingredients.data ?? []).map(
      (row): Ingredient => ({
        id: row.id,
        name: row.name,
        // A foreign key keeps this one of `ingredient_categories`.
        category: row.category,
        flavorTags: pickFrom(row.flavor_tags ?? [], FLAVOR_TAGS),
        textureTags: pickFrom(row.texture_tags ?? [], TEXTURE_TAGS),
        intensity: row.intensity,
        allergens: pickFrom(row.allergens ?? [], ALLERGENS),
        notes: row.notes,
      }),
    ),
    recipes: (recipes.data ?? []).map(
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
    ),
  };
}

/* ------------------------------------------------------------- ingredients */

export type IngredientDraft = Omit<Ingredient, "id">;

const toIngredientRow = (draft: IngredientDraft) => ({
  name: draft.name.trim(),
  category: draft.category,
  flavor_tags: draft.flavorTags,
  texture_tags: draft.textureTags,
  intensity: draft.intensity,
  allergens: draft.allergens,
  notes: draft.notes.trim(),
});

const duplicateName = (kind: string, name: string) =>
  new LibraryError(`There's already ${kind} called "${name.trim()}".`);

export async function createIngredient(draft: IngredientDraft): Promise<void> {
  const { error } = await getDb().from("ingredients").insert(toIngredientRow(draft));
  if (error?.code === "23505") throw duplicateName("an ingredient", draft.name);
  if (error) fail("adding an ingredient", error);
}

export async function updateIngredient(id: string, draft: IngredientDraft): Promise<void> {
  const { error } = await getDb()
    .from("ingredients")
    .update({ ...toIngredientRow(draft), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error?.code === "23505") throw duplicateName("an ingredient", draft.name);
  if (error) fail("updating an ingredient", error);
}

/** Refused by the database while any recipe still uses the ingredient. */
export async function deleteIngredient(id: string): Promise<void> {
  const { error } = await getDb().from("ingredients").delete().eq("id", id);
  if (error?.code === "23503") {
    throw new LibraryError("A recipe still uses this ingredient. Take it out of the recipe first.");
  }
  if (error) fail("deleting an ingredient", error);
}

/* -------------------------------------------------------------- categories */

/** Category names in the owner's order. Names are the key: ingredients point at them. */
export async function loadCategories(): Promise<string[]> {
  const { data, error } = await getDb()
    .from("ingredient_categories")
    .select("name")
    .order("sort_order")
    .order("name");
  if (error) fail("loading categories", error);
  return (data ?? []).map((row) => row.name);
}

const duplicateCategory = (name: string) =>
  new LibraryError(`There's already a category called "${name}".`);

/** Adds a category to the end of the list. `name` must already be normalised. */
export async function createCategory(name: string): Promise<void> {
  const db = getDb();
  const last = await db
    .from("ingredient_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  if (last.error) fail("adding a category", last.error);

  const { error } = await db
    .from("ingredient_categories")
    .insert({ name, sort_order: (last.data?.[0]?.sort_order ?? 0) + 1 });
  if (error?.code === "23505") throw duplicateCategory(name);
  if (error) fail("adding a category", error);
}

/** Renames a category; the foreign key carries the new name onto every ingredient in it. */
export async function renameCategory(from: string, to: string): Promise<void> {
  const { data, error } = await getDb()
    .from("ingredient_categories")
    .update({ name: to })
    .eq("name", from)
    .select("name");
  if (error?.code === "23505") throw duplicateCategory(to);
  if (error) fail("renaming a category", error);
  if (!data?.length) throw new LibraryError("That category no longer exists.");
}

/** Refused by the database while any ingredient is still in the category. */
export async function deleteCategory(name: string): Promise<void> {
  const { error } = await getDb().from("ingredient_categories").delete().eq("name", name);
  if (error?.code === "23503") {
    throw new LibraryError(
      `Some ingredients are still in "${name}". Move them to another category first.`,
    );
  }
  if (error) fail("deleting a category", error);
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
      ingredient_id: part.ingredientId,
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
