"use server";

import { revalidatePath } from "next/cache";

import { assertUuid, requireAdmin } from "@/lib/admin-guard";
import { GenerationError, generateDescription } from "@/lib/menu-descriptions-ai";
import * as repo from "@/lib/menu-descriptions-repo";
import {
  COMPONENT_UNITS,
  MENU_DESCRIPTIONS_PATH,
  RecipeLoopError,
  YIELD_UNITS,
  isOneOf,
  recipeAndDependents,
  recipeContentKey,
  resolveRecipe,
  wouldCreateLoop,
  type Library,
  type RecipeComponent,
} from "@/lib/menu-descriptions";

/**
 * Writes to the menu description generator.
 *
 * Only recipes: the ingredients are items, and every write to one goes through
 * the items database at `/admin/items`, which is the single place the catalogue
 * is edited.
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

/* ----------------------------------------------------------------- recipes */

export type ComponentInput = {
  itemId: string | null;
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

  const itemIds = new Set(library.ingredients.map((ingredient) => ingredient.id));
  const recipesById = new Map(library.recipes.map((recipe) => [recipe.id, recipe]));

  const components = input.components.map((line, position): RecipeComponent => {
    const label = `Component ${position + 1}`;
    const itemId = line.itemId || null;
    const childRecipeId = line.childRecipeId || null;

    if ((itemId === null) === (childRecipeId === null)) {
      throw new InputError(`${label} needs an item or a recipe chosen.`);
    }
    if (itemId && !itemIds.has(itemId)) {
      throw new InputError(`${label}: that item is no longer in the catalogue.`);
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
      itemId,
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
