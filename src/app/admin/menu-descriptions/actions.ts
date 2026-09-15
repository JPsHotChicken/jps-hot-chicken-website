"use server";

import { revalidatePath } from "next/cache";

import { assertUuid, requireAdmin } from "@/lib/admin-guard";
import { GenerationError, generateDescription } from "@/lib/menu-descriptions-ai";
import * as repo from "@/lib/menu-descriptions-repo";
import {
  ALLERGENS,
  COMPONENT_UNITS,
  FLAVOR_TAGS,
  MAX_CATEGORY_LENGTH,
  MAX_INTENSITY,
  MENU_DESCRIPTIONS_PATH,
  RecipeLoopError,
  TEXTURE_TAGS,
  YIELD_UNITS,
  ingredientContentKey,
  isOneOf,
  normaliseCategory,
  recipeAndDependents,
  recipeContentKey,
  recipesUsingIngredient,
  resolveRecipe,
  wouldCreateLoop,
  type Library,
  type RecipeComponent,
} from "@/lib/menu-descriptions";

/**
 * Writes to the menu description generator.
 *
 * Every action re-checks the admin session, because a Server Action is a public
 * endpoint. Problems the owner can fix — a duplicate name, a missing amount, an
 * unset API key — come back as `{ ok: false, error }` rather than being thrown,
 * since a production build replaces a thrown error's message with a generic one.
 */

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

/** A problem with what was typed, in words fit to show. */
class InputError extends Error {}

async function attempt<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  await requireAdmin();
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    if (
      error instanceof InputError ||
      error instanceof repo.LibraryError ||
      error instanceof GenerationError ||
      error instanceof RecipeLoopError
    ) {
      return { ok: false, error: error.message };
    }
    console.error("[menu-descriptions]", error);
    return { ok: false, error: "That didn't work. Try again." };
  }
}

/* ------------------------------------------------------------- validation */

function text(value: unknown, field: string, { max, required = false }: { max: number; required?: boolean }) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (required && !trimmed) throw new InputError(`${field} is required.`);
  if (trimmed.length > max) throw new InputError(`${field} must be ${max} characters or fewer.`);
  return trimmed;
}

/** A positive number from a form box, or null when it was left empty. */
function positiveNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(String(value).trim());
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100_000) {
    throw new InputError(`${field} must be a number above zero.`);
  }
  return Math.round(parsed * 1000) / 1000;
}

function tags<T extends string>(values: unknown, allowed: readonly T[], field: string): T[] {
  if (!Array.isArray(values)) return [];
  const unknown = values.filter((value) => typeof value !== "string" || !isOneOf(value, allowed));
  if (unknown.length > 0) throw new InputError(`${field} contains a value that isn't on the list.`);
  return allowed.filter((value) => values.includes(value));
}

/* ------------------------------------------------------------- ingredients */

export type IngredientInput = {
  name: string;
  category: string;
  flavorTags: string[];
  textureTags: string[];
  intensity: number;
  allergens: string[];
  notes: string;
};

async function toIngredientDraft(input: IngredientInput): Promise<repo.IngredientDraft> {
  const intensity = Number(input.intensity);
  if (!Number.isInteger(intensity) || intensity < 1 || intensity > MAX_INTENSITY) {
    throw new InputError(`Intensity must be a whole number from 1 to ${MAX_INTENSITY}.`);
  }
  const categories = await repo.loadCategories();
  if (typeof input.category !== "string" || !categories.includes(input.category)) {
    throw new InputError("Pick a category.");
  }

  return {
    name: text(input.name, "Name", { max: 80, required: true }),
    category: input.category,
    flavorTags: tags(input.flavorTags, FLAVOR_TAGS, "Flavor"),
    textureTags: tags(input.textureTags, TEXTURE_TAGS, "Texture"),
    intensity,
    allergens: tags(input.allergens, ALLERGENS, "Allergens"),
    notes: text(input.notes, "Notes", { max: 500 }),
  };
}

export async function createIngredientAction(input: IngredientInput): Promise<ActionResult> {
  return attempt(async () => {
    await repo.createIngredient(await toIngredientDraft(input));
    revalidatePath(MENU_DESCRIPTIONS_PATH, "layout");
    return undefined;
  });
}

/**
 * Save an ingredient edit. Returns how many generated descriptions it made
 * stale — every recipe using the ingredient, directly or inside a sub-recipe —
 * so the table can say so. An edit that changes nothing marks nothing.
 */
export async function updateIngredientAction(
  id: string,
  input: IngredientInput,
): Promise<ActionResult<{ staleCount: number }>> {
  return attempt(async () => {
    assertUuid(id, "Ingredient");
    const draft = await toIngredientDraft(input);
    const library = await repo.loadLibrary();
    const before = library.ingredients.find((ingredient) => ingredient.id === id);
    if (!before) throw new InputError("That ingredient no longer exists.");

    await repo.updateIngredient(id, draft);

    const staleCount =
      ingredientContentKey(before) === ingredientContentKey(draft)
        ? 0
        : await markIngredientsChanged([id], library);

    revalidatePath(MENU_DESCRIPTIONS_PATH, "layout");
    return { staleCount };
  });
}

export async function deleteIngredientAction(id: string): Promise<ActionResult> {
  return attempt(async () => {
    assertUuid(id, "Ingredient");
    await repo.deleteIngredient(id);
    revalidatePath(MENU_DESCRIPTIONS_PATH, "layout");
    return undefined;
  });
}

/**
 * Mark stale every description written from these ingredients, directly or
 * through a sub-recipe. Returns how many were fresh until now, for the notice.
 */
async function markIngredientsChanged(ingredientIds: string[], library: Library): Promise<number> {
  const affected = new Set(ingredientIds.flatMap((id) => recipesUsingIngredient(id, library.recipes)));
  await repo.markStale([...affected]);
  return library.recipes.filter(
    (recipe) => affected.has(recipe.id) && recipe.generatedAt && !recipe.isStale,
  ).length;
}

/* -------------------------------------------------------------- categories */

function categoryName(value: unknown): string {
  const name = normaliseCategory(typeof value === "string" ? value : "");
  if (!name) throw new InputError("Give the category a name.");
  if (name.length > MAX_CATEGORY_LENGTH) {
    throw new InputError(`A category name must be ${MAX_CATEGORY_LENGTH} characters or fewer.`);
  }
  return name;
}

export async function createCategoryAction(name: string): Promise<ActionResult> {
  return attempt(async () => {
    await repo.createCategory(categoryName(name));
    revalidatePath(MENU_DESCRIPTIONS_PATH, "layout");
    return undefined;
  });
}

/**
 * Rename a category. Every ingredient in it moves with it, and since the model
 * is told each ingredient's category, descriptions written from them go out of
 * date — the count comes back for the notice, as with an ingredient edit.
 */
export async function renameCategoryAction(
  from: string,
  to: string,
): Promise<ActionResult<{ staleCount: number }>> {
  return attempt(async () => {
    const current = typeof from === "string" ? from : "";
    const next = categoryName(to);
    if (next === current) return { staleCount: 0 };

    const library = await repo.loadLibrary();
    await repo.renameCategory(current, next);
    const moved = library.ingredients.filter((ingredient) => ingredient.category === current);
    const staleCount = await markIngredientsChanged(
      moved.map((ingredient) => ingredient.id),
      library,
    );

    revalidatePath(MENU_DESCRIPTIONS_PATH, "layout");
    return { staleCount };
  });
}

/** Refused while an ingredient is still in the category, and for the last one left. */
export async function deleteCategoryAction(name: string): Promise<ActionResult> {
  return attempt(async () => {
    const categories = await repo.loadCategories();
    if (!categories.includes(name)) throw new InputError("That category no longer exists.");
    if (categories.length === 1) throw new InputError("Keep at least one category.");
    await repo.deleteCategory(name);
    revalidatePath(MENU_DESCRIPTIONS_PATH, "layout");
    return undefined;
  });
}

/* ----------------------------------------------------------------- recipes */

export type ComponentInput = {
  ingredientId: string | null;
  childRecipeId: string | null;
  amount: string;
  unit: string;
  prepNote: string;
};

export type RecipeInput = {
  name: string;
  isMenuItem: boolean;
  yieldAmount: string;
  yieldUnit: string;
  description: string;
  descriptionShort: string;
  components: ComponentInput[];
};

function toRecipeDraft(id: string | null, input: RecipeInput, library: Library): repo.RecipeDraft {
  const name = text(input.name, "Name", { max: 120, required: true });
  const yieldAmount = positiveNumber(input.yieldAmount, "Yield");
  if (yieldAmount !== null && !isOneOf(input.yieldUnit, YIELD_UNITS)) {
    throw new InputError("Pick a unit for the yield.");
  }

  if (!Array.isArray(input.components) || input.components.length > 100) {
    throw new InputError("A recipe can have up to 100 components.");
  }

  const ingredientIds = new Set(library.ingredients.map((ingredient) => ingredient.id));
  const recipesById = new Map(library.recipes.map((recipe) => [recipe.id, recipe]));

  const components = input.components.map((line, position): RecipeComponent => {
    const label = `Component ${position + 1}`;
    const ingredientId = line.ingredientId || null;
    const childRecipeId = line.childRecipeId || null;

    if ((ingredientId === null) === (childRecipeId === null)) {
      throw new InputError(`${label} needs an ingredient or a recipe chosen.`);
    }
    if (ingredientId && !ingredientIds.has(ingredientId)) {
      throw new InputError(`${label}: that ingredient no longer exists.`);
    }
    if (childRecipeId) {
      const child = recipesById.get(childRecipeId);
      if (!child) throw new InputError(`${label}: that recipe no longer exists.`);
      if (wouldCreateLoop(id, childRecipeId, library.recipes)) {
        throw new InputError(
          childRecipeId === id
            ? "A recipe can't contain itself."
            : `${child.name} already contains this recipe, so it can't go inside it.`,
        );
      }
    }

    const amount = positiveNumber(line.amount, `${label}'s amount`);
    if (amount === null) throw new InputError(`${label} needs an amount.`);
    if (!isOneOf(line.unit, COMPONENT_UNITS)) throw new InputError(`${label} needs a unit.`);

    return {
      ingredientId,
      childRecipeId,
      amount,
      unit: line.unit,
      prepNote: text(line.prepNote, `${label}'s prep note`, { max: 200 }),
    };
  });

  return {
    name,
    isMenuItem: Boolean(input.isMenuItem),
    yieldAmount,
    yieldUnit: yieldAmount === null ? "" : input.yieldUnit,
    description: text(input.description, "Description", { max: 2000 }),
    descriptionShort: text(input.descriptionShort, "Short description", { max: 500 }),
    components,
  };
}

/**
 * Save a recipe — new when `id` is null. If what the model reads from it
 * changed (name, yield or lines), its own description and those of every recipe
 * it sits inside are marked stale. Nothing is regenerated.
 */
export async function saveRecipeAction(
  id: string | null,
  input: RecipeInput,
): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    if (id !== null) assertUuid(id, "Recipe");
    const library = await repo.loadLibrary();
    const before = id ? library.recipes.find((recipe) => recipe.id === id) : undefined;
    if (id && !before) throw new InputError("That recipe no longer exists.");

    const draft = toRecipeDraft(id, input, library);
    const savedId = await repo.saveRecipe(id, draft);

    if (before && recipeContentKey(before) !== recipeContentKey(draft)) {
      await repo.markStale(recipeAndDependents(before.id, library.recipes));
    }

    revalidatePath(MENU_DESCRIPTIONS_PATH, "layout");
    return { id: savedId };
  });
}

export async function deleteRecipeAction(id: string): Promise<ActionResult> {
  return attempt(async () => {
    assertUuid(id, "Recipe");
    await repo.deleteRecipe(id);
    revalidatePath(MENU_DESCRIPTIONS_PATH, "layout");
    return undefined;
  });
}

/**
 * Write the description and taste profile for a saved recipe. This is the only
 * thing that calls the model, and it only runs when the owner presses the
 * button. It replaces the stored description and clears the stale flag.
 */
export async function generateDescriptionAction(id: string): Promise<ActionResult> {
  return attempt(async () => {
    assertUuid(id, "Recipe");
    const library = await repo.loadLibrary();
    if (!library.recipes.some((recipe) => recipe.id === id)) {
      throw new InputError("That recipe no longer exists.");
    }
    const resolved = resolveRecipe(id, library);
    if (resolved.components.length === 0) {
      throw new InputError("Add at least one component and save before generating.");
    }

    const generation = await generateDescription(resolved);
    await repo.storeGeneration(id, generation);
    revalidatePath(MENU_DESCRIPTIONS_PATH, "layout");
    return undefined;
  });
}
