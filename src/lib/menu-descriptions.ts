/**
 * Menu description generator: vocabulary, shapes, and the walks over them.
 *
 * The ingredients are the items database (`src/lib/items.ts`) — one catalogue,
 * where what a thing costs and what it tastes like are two halves of one
 * record. Recipes are built from items and from other recipes: a house sauce is
 * a recipe, and so is the sandwich that uses it; `isMenuItem` is the only
 * difference. A recipe's menu copy is written by the model from the whole tree,
 * sub-recipes expanded and any item's own bill of materials with them.
 *
 * Nothing in here touches the database or the network, so every rule — the
 * allergen roll-up, loop detection, which descriptions go stale, and reading
 * the model's reply — is testable with plain objects.
 */

import {
  ALLERGENS as ITEM_ALLERGENS,
  ALLERGEN_NONE,
  type FlavorTag,
  type TextureTag,
} from "@/lib/items";
import {
  GenerationFormatError,
  readReplyObject,
  requiredText,
  stringList,
} from "@/lib/model-reply";

/** Where the generator lives on the dashboard. */
export const MENU_DESCRIPTIONS_PATH = "/admin/menu-descriptions";

/* --------------------------------------------------------------- vocabulary */

// Fixed lists by design. Changing one is a code change, not a settings screen.
// Flavour, texture, intensity and allergens are the item's own vocabulary and
// live with the item; the units and taste axes below belong to the generator.

/**
 * The allergens a roll-up can report — the item list, less its "None" marker.
 * "None" is a statement about a record ("checked, contains nothing"), not an
 * allergen a dish can contain, so it never appears in a roll-up.
 */
export const ALLERGENS = ITEM_ALLERGENS.filter((allergen) => allergen !== ALLERGEN_NONE);

/** Units a component line may be measured in. */
export const COMPONENT_UNITS = ["oz", "each", "tbsp", "tsp", "cups", "g", "slices", "pinch"] as const;

/** Units a recipe's batch yield may be given in. */
export const YIELD_UNITS = ["oz", "each", "cups", "lbs"] as const;

/** The axes of a generated taste profile, each scored 0–5. */
export const TASTE_DIMENSIONS = [
  "sweet",
  "salty",
  "sour",
  "bitter",
  "umami",
  "spicy",
  "smoky",
  "tangy",
  "richness",
] as const;

export type TasteDimension = (typeof TASTE_DIMENSIONS)[number];

export const MAX_TASTE_SCORE = 5;

export const isOneOf = <T extends string>(value: string, allowed: readonly T[]): value is T =>
  (allowed as readonly string[]).includes(value);

/* -------------------------------------------------------------------- shapes */

/**
 * An item from the catalogue, as the generator reads it.
 *
 * Only the fields that bear on how a dish tastes — the cost and purchasing half
 * of the record is no business of the description writer. `parts` is the item's
 * own bill of materials, so a prepped item used in a recipe carries what it is
 * made of without anybody typing it twice.
 */
export type Ingredient = {
  id: string;
  code: string;
  name: string;
  category: string;
  flavorTags: FlavorTag[];
  textureTags: TextureTag[];
  intensity: number;
  allergens: string[];
  notes: string;
  parts: IngredientPart[];
};

/** One line of an item's own bill of materials, with its unit already resolved. */
export type IngredientPart = {
  itemId: string;
  quantity: number;
  /** The component's stock or portion unit, whichever the line was written in. */
  unit: string;
};

/** One line of a recipe: exactly one of `itemId` and `childRecipeId` is set. */
export type RecipeComponent = {
  itemId: string | null;
  childRecipeId: string | null;
  amount: number;
  unit: string;
  prepNote: string;
};

export type TasteProfile = Record<TasteDimension, number>;

export type Recipe = {
  id: string;
  name: string;
  isMenuItem: boolean;
  yieldAmount: number | null;
  yieldUnit: string;
  components: RecipeComponent[];

  /** The long description — two or three sentences. Editable after generation. */
  description: string | null;
  /** The one-line description for tight menus. Editable after generation. */
  descriptionShort: string | null;
  tasteProfile: TasteProfile | null;
  textureNotes: string[];
  pairsWith: string[];
  generatedAt: string | null;
  /** Something the description was written from has changed since. */
  isStale: boolean;
  updatedAt: string;
};

/** Everything the generator holds. Small enough to load whole. */
export type Library = {
  /** The items that may go on a recipe line, keyed on nothing — order is display order. */
  ingredients: Ingredient[];
  recipes: Recipe[];
};

type Index = {
  ingredients: Map<string, Ingredient>;
  recipes: Map<string, Recipe>;
};

function indexLibrary(library: Library): Index {
  return {
    ingredients: new Map(library.ingredients.map((ingredient) => [ingredient.id, ingredient])),
    recipes: new Map(library.recipes.map((recipe) => [recipe.id, recipe])),
  };
}

/* ------------------------------------------------------------------ allergens */

export type AllergenSource = {
  allergen: string;
  /** Where it comes from, e.g. "Brioche bun" or "House sauce → Duke's mayonnaise". */
  sources: string[];
};

/**
 * Every allergen in a list of component lines, reaching into sub-recipes and
 * into what each item is itself made of.
 *
 * Takes lines rather than a saved recipe so the builder can show the roll-up
 * for what is on screen before it is saved. Sub-recipes and item components are
 * read as saved. A loop is impossible in saved data, but neither walk revisits
 * anything, so a bad row could never hang the page.
 */
export function rollUpAllergens(lines: RecipeComponent[], library: Library): AllergenSource[] {
  const index = indexLibrary(library);
  const found = new Map<string, string[]>();

  const record = (allergen: string, trail: string[]) => {
    if (allergen === ALLERGEN_NONE) return;
    const path = trail.join(" → ");
    const sources = found.get(allergen) ?? [];
    if (!sources.includes(path)) sources.push(path);
    found.set(allergen, sources);
  };

  /** An item, then everything the catalogue says it is built from. */
  const walkItem = (ingredient: Ingredient, trail: string[], visiting: Set<string>) => {
    for (const allergen of ingredient.allergens) record(allergen, trail);
    for (const part of ingredient.parts) {
      if (visiting.has(part.itemId)) continue;
      const below = index.ingredients.get(part.itemId);
      if (!below) continue;
      walkItem(below, [...trail, below.name], new Set(visiting).add(part.itemId));
    }
  };

  const walk = (parts: RecipeComponent[], trail: string[], visiting: Set<string>) => {
    for (const part of parts) {
      if (part.itemId) {
        const ingredient = index.ingredients.get(part.itemId);
        if (!ingredient) continue;
        walkItem(ingredient, [...trail, ingredient.name], new Set([part.itemId]));
      } else if (part.childRecipeId && !visiting.has(part.childRecipeId)) {
        const child = index.recipes.get(part.childRecipeId);
        if (!child) continue;
        walk(child.components, [...trail, child.name], new Set(visiting).add(child.id));
      }
    }
  };

  walk(lines, [], new Set());
  return ALLERGENS.filter((allergen) => found.has(allergen)).map((allergen) => ({
    allergen,
    sources: found.get(allergen)!,
  }));
}

/* ----------------------------------------------------------- loops and usage */

/** The ids of every recipe that `recipeId` sits inside, at any depth. Excludes itself. */
export function recipesContaining(recipeId: string, recipes: Recipe[]): Set<string> {
  const parentsOf = new Map<string, string[]>();
  for (const recipe of recipes) {
    for (const part of recipe.components) {
      if (!part.childRecipeId) continue;
      const list = parentsOf.get(part.childRecipeId) ?? [];
      list.push(recipe.id);
      parentsOf.set(part.childRecipeId, list);
    }
  }

  const found = new Set<string>();
  const queue = [recipeId];
  while (queue.length > 0) {
    for (const parent of parentsOf.get(queue.pop()!) ?? []) {
      if (parent === recipeId || found.has(parent)) continue;
      found.add(parent);
      queue.push(parent);
    }
  }
  return found;
}

/**
 * Whether adding `childId` as a line of `parentId` would make a recipe contain
 * itself. A recipe that hasn't been saved yet (`parentId` null) contains nothing
 * and nothing contains it, so it can never close a loop.
 */
export function wouldCreateLoop(parentId: string | null, childId: string, recipes: Recipe[]): boolean {
  if (!parentId) return false;
  if (parentId === childId) return true;
  return recipesContaining(parentId, recipes).has(childId);
}

/** The item itself plus every item built from it, however many layers up. */
export function itemsContaining(itemId: string, ingredients: Ingredient[]): Set<string> {
  const parentsOf = new Map<string, string[]>();
  for (const ingredient of ingredients) {
    for (const part of ingredient.parts) {
      const list = parentsOf.get(part.itemId) ?? [];
      list.push(ingredient.id);
      parentsOf.set(part.itemId, list);
    }
  }

  const found = new Set([itemId]);
  const queue = [itemId];
  while (queue.length > 0) {
    for (const parent of parentsOf.get(queue.pop()!) ?? []) {
      if (found.has(parent)) continue;
      found.add(parent);
      queue.push(parent);
    }
  }
  return found;
}

/**
 * The recipes whose descriptions an item edit makes stale.
 *
 * An edit to a raw item reaches further than the recipes naming it: a prepped
 * item built from it is described in terms of what it contains, so every recipe
 * using *that* is out of date too. The walk goes up the catalogue first, then
 * up the recipes.
 */
export function recipesUsingItem(itemId: string, library: Library): string[] {
  const touched = itemsContaining(itemId, library.ingredients);
  const direct = library.recipes.filter((recipe) =>
    recipe.components.some((part) => part.itemId !== null && touched.has(part.itemId)),
  );

  const all = new Set(direct.map((recipe) => recipe.id));
  for (const recipe of direct) {
    for (const parent of recipesContaining(recipe.id, library.recipes)) all.add(parent);
  }
  return [...all];
}

/** A recipe itself plus every recipe it sits inside — what a change to it makes stale. */
export function recipeAndDependents(recipeId: string, recipes: Recipe[]): string[] {
  return [recipeId, ...recipesContaining(recipeId, recipes)];
}

/**
 * What the model is told about a recipe, flattened to a comparable string.
 *
 * Two saves with the same key would produce the same prompt, so only a change
 * in the key marks a description stale. Renaming a sauce or editing a prep note
 * changes what the model reads; toggling "menu item" or editing the description
 * itself does not.
 */
export function recipeContentKey(recipe: Pick<Recipe, "name" | "yieldAmount" | "yieldUnit" | "components">) {
  return JSON.stringify([
    recipe.name.trim(),
    recipe.yieldAmount,
    recipe.yieldUnit,
    recipe.components.map((part) => [
      part.itemId,
      part.childRecipeId,
      part.amount,
      part.unit,
      part.prepNote.trim(),
    ]),
  ]);
}

/**
 * The part of an item the model reads, flattened the same way.
 *
 * Cost, pack size and par level are left out: they change often and change
 * nothing about how the dish is described.
 */
export function itemContentKey(ingredient: Omit<Ingredient, "id" | "code" | "allergens">) {
  return JSON.stringify([
    ingredient.name.trim(),
    ingredient.category.trim(),
    [...ingredient.flavorTags].sort(),
    [...ingredient.textureTags].sort(),
    ingredient.intensity,
    ingredient.notes.trim(),
    ingredient.parts.map((part) => [part.itemId, part.quantity, part.unit]),
  ]);
}

/* --------------------------------------------------------- what the model reads */

export type ResolvedIngredient = {
  kind: "ingredient";
  name: string;
  amount: number;
  unit: string;
  prep_note?: string;
  category: string;
  /** 1 (barely noticeable) to 5 (dominates the dish). */
  intensity: number;
  flavor_tags: FlavorTag[];
  texture_tags: TextureTag[];
  notes?: string;
  /** What the catalogue says this item is built from, for one batch of it. */
  made_from?: ResolvedIngredient[];
};

export type ResolvedSubRecipe = {
  kind: "sub-recipe";
  name: string;
  amount: number;
  unit: string;
  prep_note?: string;
  /** How much one batch of the sub-recipe makes, so the portion used can be weighed. */
  batch_yield: { amount: number; unit: string } | null;
  components: ResolvedPart[];
};

export type ResolvedPart = ResolvedIngredient | ResolvedSubRecipe;

export type ResolvedRecipe = {
  name: string;
  menu_item: boolean;
  yield: { amount: number; unit: string } | null;
  components: ResolvedPart[];
};

export class RecipeLoopError extends Error {
  constructor(name: string) {
    super(`${name} contains itself, so it can't be described.`);
    this.name = "RecipeLoopError";
  }
}

const yieldOf = (recipe: Recipe) =>
  recipe.yieldAmount === null ? null : { amount: recipe.yieldAmount, unit: recipe.yieldUnit };

/**
 * A recipe's full component tree, sub-recipes and item recipes expanded, as the
 * JSON the model is given. Only what the prompt needs: allergens are left out,
 * since the copy isn't meant to mention them and a list of them invites it to.
 */
export function resolveRecipe(recipeId: string, library: Library): ResolvedRecipe {
  const index = indexLibrary(library);
  const root = index.recipes.get(recipeId);
  if (!root) throw new Error("That recipe no longer exists.");

  /** An item and, beneath it, whatever the catalogue says it is made from. */
  const expandItem = (
    ingredient: Ingredient,
    amount: number,
    unit: string,
    visiting: Set<string>,
  ): ResolvedIngredient => {
    const made = ingredient.parts.flatMap((part) => {
      if (visiting.has(part.itemId)) return [];
      const below = index.ingredients.get(part.itemId);
      if (!below) return [];
      return [expandItem(below, part.quantity, part.unit, new Set(visiting).add(part.itemId))];
    });

    return {
      kind: "ingredient",
      name: ingredient.name,
      amount,
      unit,
      category: ingredient.category,
      intensity: ingredient.intensity,
      flavor_tags: ingredient.flavorTags,
      texture_tags: ingredient.textureTags,
      ...(ingredient.notes.trim() ? { notes: ingredient.notes.trim() } : {}),
      ...(made.length > 0 ? { made_from: made } : {}),
    };
  };

  const expand = (recipe: Recipe, visiting: Set<string>): ResolvedPart[] =>
    recipe.components.flatMap((part): ResolvedPart[] => {
      const prep = part.prepNote.trim() ? { prep_note: part.prepNote.trim() } : {};

      if (part.itemId) {
        const ingredient = index.ingredients.get(part.itemId);
        if (!ingredient) return [];
        return [
          { ...expandItem(ingredient, part.amount, part.unit, new Set([part.itemId])), ...prep },
        ];
      }

      const child = part.childRecipeId ? index.recipes.get(part.childRecipeId) : undefined;
      if (!child) return [];
      if (visiting.has(child.id)) throw new RecipeLoopError(child.name);
      return [
        {
          kind: "sub-recipe",
          name: child.name,
          amount: part.amount,
          unit: part.unit,
          ...prep,
          batch_yield: yieldOf(child),
          components: expand(child, new Set(visiting).add(child.id)),
        },
      ];
    });

  return {
    name: root.name,
    menu_item: root.isMenuItem,
    yield: yieldOf(root),
    components: expand(root, new Set([root.id])),
  };
}

/* ------------------------------------------------------- reading the reply */

export type Generation = {
  descriptionShort: string;
  descriptionLong: string;
  tasteProfile: TasteProfile;
  textureNotes: string[];
  pairsWith: string[];
};

export { GenerationFormatError };

/**
 * Parse and check the model's reply.
 *
 * Structured output makes a malformed reply rare, but a reply cut off at the
 * token limit or wrapped in a code fence is still possible, and nothing
 * unchecked goes into the database. Scores are rounded and pinned to 0–5 rather
 * than rejected: a 5.5 is a slightly loud "5", not a failed generation.
 */
export function parseGeneration(text: string): Generation {
  const reply = readReplyObject(text);
  const scores = reply.taste_profile;
  if (!scores || typeof scores !== "object" || Array.isArray(scores)) {
    throw new GenerationFormatError("taste_profile is missing");
  }

  const tasteProfile = {} as TasteProfile;
  for (const dimension of TASTE_DIMENSIONS) {
    const score = (scores as Record<string, unknown>)[dimension];
    if (typeof score !== "number" || !Number.isFinite(score)) {
      throw new GenerationFormatError(`taste_profile.${dimension} is not a number`);
    }
    tasteProfile[dimension] = Math.min(MAX_TASTE_SCORE, Math.max(0, Math.round(score)));
  }

  return {
    descriptionShort: requiredText(reply.description_short, "description_short"),
    descriptionLong: requiredText(reply.description_long, "description_long"),
    tasteProfile,
    textureNotes: stringList(reply.texture_notes, "texture_notes", 8),
    pairsWith: stringList(reply.pairs_with, "pairs_with", 5),
  };
}

/** Read a stored taste profile back, or null if it isn't one. */
export function toTasteProfile(value: unknown): TasteProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const profile = {} as TasteProfile;
  for (const dimension of TASTE_DIMENSIONS) {
    const score = (value as Record<string, unknown>)[dimension];
    profile[dimension] = typeof score === "number" && Number.isFinite(score) ? score : 0;
  }
  return profile;
}

/* -------------------------------------------------------------------- display */

export const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * "Sep 14, 3:04 PM" in the restaurant's time zone. Fixed rather than taken from
 * wherever the code runs, so the server (UTC on Vercel) and the browser agree.
 */
export function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "tree nut" → "Tree nut". */
export const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
