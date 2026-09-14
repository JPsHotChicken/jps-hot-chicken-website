import { describe, it, expect } from "vitest";

import {
  GenerationFormatError,
  RecipeLoopError,
  ingredientContentKey,
  parseGeneration,
  pickFrom,
  FLAVOR_TAGS,
  recipeAndDependents,
  recipeContentKey,
  recipesContaining,
  recipesUsingIngredient,
  resolveRecipe,
  rollUpAllergens,
  wouldCreateLoop,
  type Ingredient,
  type Library,
  type Recipe,
  type RecipeComponent,
} from "@/lib/menu-descriptions";

/* ------------------------------------------------------------------ fixtures */

function ingredient(id: string, over: Partial<Ingredient> = {}): Ingredient {
  return {
    id,
    name: id,
    category: "other",
    flavorTags: [],
    textureTags: [],
    intensity: 3,
    allergens: [],
    notes: "",
    ...over,
  };
}

const uses = (ingredientId: string, amount = 1, unit = "oz", prepNote = ""): RecipeComponent => ({
  ingredientId,
  childRecipeId: null,
  amount,
  unit,
  prepNote,
});

const contains = (childRecipeId: string, amount = 1, unit = "oz"): RecipeComponent => ({
  ingredientId: null,
  childRecipeId,
  amount,
  unit,
  prepNote: "",
});

function recipe(id: string, components: RecipeComponent[], over: Partial<Recipe> = {}): Recipe {
  return {
    id,
    name: id,
    isMenuItem: false,
    yieldAmount: 1,
    yieldUnit: "each",
    components,
    description: null,
    descriptionShort: null,
    tasteProfile: null,
    textureNotes: [],
    pairsWith: [],
    generatedAt: null,
    isStale: false,
    updatedAt: "2026-09-14T00:00:00Z",
    ...over,
  };
}

/**
 * The seeded shape: a sandwich that uses a sauce that uses mayonnaise, plus a
 * second menu item that uses the same sauce.
 */
function sandwichLibrary(): Library {
  return {
    ingredients: [
      ingredient("mayo", { name: "Duke's mayonnaise", allergens: ["egg"], flavorTags: ["tangy", "creamy"] }),
      ingredient("worcestershire", { name: "Worcestershire sauce", allergens: ["fish"] }),
      ingredient("chicken", { name: "Chicken breast", category: "protein", intensity: 2 }),
      ingredient("bun", { name: "Brioche bun", category: "bread", allergens: ["gluten", "egg", "dairy"] }),
      ingredient("cayenne", { name: "Cayenne pepper", category: "spice", intensity: 5, flavorTags: ["spicy"] }),
    ],
    recipes: [
      recipe("sauce", [uses("mayo", 20), uses("worcestershire", 1, "tbsp")], {
        name: "House Comeback Sauce",
        yieldAmount: 32,
        yieldUnit: "oz",
      }),
      recipe(
        "sandwich",
        [uses("chicken", 6, "oz", "pounded to 1/2 inch"), uses("bun", 1, "each", "toasted"), contains("sauce", 1)],
        { name: "Nashville Hot Chicken Sandwich", isMenuItem: true },
      ),
      recipe("tenders", [uses("chicken", 8), uses("cayenne", 1, "pinch"), contains("sauce", 2)], {
        name: "Tenders",
        isMenuItem: true,
      }),
    ],
  };
}

const find = (library: Library, id: string) => library.recipes.find((entry) => entry.id === id)!;

/* ------------------------------------------------------------------ allergens */

describe("rollUpAllergens", () => {
  it("reaches into sub-recipes and names the path each allergen came from", () => {
    const library = sandwichLibrary();
    const rolled = rollUpAllergens(find(library, "sandwich").components, library);

    // In the vocabulary's order, not discovery order.
    expect(rolled.map((entry) => entry.allergen)).toEqual(["dairy", "egg", "gluten", "fish"]);
    expect(rolled.find((entry) => entry.allergen === "egg")!.sources).toEqual([
      "Brioche bun",
      "House Comeback Sauce → Duke's mayonnaise",
    ]);
    expect(rolled.find((entry) => entry.allergen === "fish")!.sources).toEqual([
      "House Comeback Sauce → Worcestershire sauce",
    ]);
  });

  it("returns nothing for components without allergens", () => {
    const library = sandwichLibrary();
    expect(rollUpAllergens([uses("chicken"), uses("cayenne")], library)).toEqual([]);
  });

  it("does not hang on a loop that slipped into the data", () => {
    const library: Library = {
      ingredients: [ingredient("egg", { allergens: ["egg"] })],
      recipes: [recipe("a", [contains("b"), uses("egg")]), recipe("b", [contains("a")])],
    };
    expect(rollUpAllergens(find(library, "a").components, library).map((entry) => entry.allergen)).toEqual([
      "egg",
    ]);
  });
});

/* ------------------------------------------------------------- loops & usage */

describe("loops", () => {
  it("finds every recipe a recipe sits inside, at any depth", () => {
    const recipes = [
      recipe("spice-mix", []),
      recipe("sauce", [contains("spice-mix")]),
      recipe("sandwich", [contains("sauce")]),
      recipe("unrelated", []),
    ];
    expect([...recipesContaining("spice-mix", recipes)].sort()).toEqual(["sandwich", "sauce"]);
    expect(recipesContaining("sandwich", recipes).size).toBe(0);
  });

  it("refuses a recipe inside itself or inside something it is already in", () => {
    const { recipes } = sandwichLibrary();
    expect(wouldCreateLoop("sauce", "sauce", recipes)).toBe(true);
    expect(wouldCreateLoop("sauce", "sandwich", recipes)).toBe(true);
    expect(wouldCreateLoop("sandwich", "sauce", recipes)).toBe(false);
    expect(wouldCreateLoop("sandwich", "tenders", recipes)).toBe(false);
  });

  it("never finds a loop for a recipe that hasn't been saved", () => {
    const { recipes } = sandwichLibrary();
    expect(wouldCreateLoop(null, "sandwich", recipes)).toBe(false);
  });
});

/* ------------------------------------------------------------------ staleness */

describe("staleness", () => {
  it("an ingredient edit reaches every recipe using it, directly or through a sub-recipe", () => {
    const { recipes } = sandwichLibrary();
    expect(recipesUsingIngredient("mayo", recipes).sort()).toEqual(["sandwich", "sauce", "tenders"]);
    expect(recipesUsingIngredient("bun", recipes)).toEqual(["sandwich"]);
    expect(recipesUsingIngredient("nobody-uses-this", recipes)).toEqual([]);
  });

  it("a recipe change reaches the recipe and everything it sits inside", () => {
    const { recipes } = sandwichLibrary();
    expect(recipeAndDependents("sauce", recipes).sort()).toEqual(["sandwich", "sauce", "tenders"]);
    expect(recipeAndDependents("sandwich", recipes)).toEqual(["sandwich"]);
  });

  it("only what the model reads counts as a recipe change", () => {
    const base = find(sandwichLibrary(), "sandwich");
    const key = recipeContentKey(base);

    const toggled: Recipe = { ...base, isMenuItem: false };
    const handEdited: Recipe = { ...base, description: "Edited by hand" };
    expect(recipeContentKey(toggled)).toBe(key);
    expect(recipeContentKey(handEdited)).toBe(key);
    expect(recipeContentKey({ ...base, name: `${base.name}  ` })).toBe(key);

    expect(recipeContentKey({ ...base, name: "JP's Sandwich" })).not.toBe(key);
    expect(recipeContentKey({ ...base, yieldAmount: 2 })).not.toBe(key);
    const reprepped = base.components.map((part, index) =>
      index === 1 ? { ...part, prepNote: "untoasted" } : part,
    );
    expect(recipeContentKey({ ...base, components: reprepped })).not.toBe(key);
  });

  it("re-ticking the same tags in a different order is not an ingredient change", () => {
    const before = ingredient("mayo", { flavorTags: ["tangy", "creamy"] });
    expect(ingredientContentKey({ ...before, flavorTags: ["creamy", "tangy"] })).toBe(
      ingredientContentKey(before),
    );
    expect(ingredientContentKey({ ...before, intensity: 4 })).not.toBe(ingredientContentKey(before));
  });
});

/* -------------------------------------------------------- what the model reads */

describe("resolveRecipe", () => {
  it("expands sub-recipes with their batch yield so portions can be weighed", () => {
    const resolved = resolveRecipe("sandwich", sandwichLibrary());

    expect(resolved).toMatchObject({
      name: "Nashville Hot Chicken Sandwich",
      menu_item: true,
      yield: { amount: 1, unit: "each" },
    });
    expect(resolved.components[0]).toEqual({
      kind: "ingredient",
      name: "Chicken breast",
      amount: 6,
      unit: "oz",
      prep_note: "pounded to 1/2 inch",
      category: "protein",
      intensity: 2,
      flavor_tags: [],
      texture_tags: [],
    });

    const sauce = resolved.components[2];
    expect(sauce).toMatchObject({
      kind: "sub-recipe",
      name: "House Comeback Sauce",
      amount: 1,
      unit: "oz",
      batch_yield: { amount: 32, unit: "oz" },
    });
    expect(sauce.kind === "sub-recipe" && sauce.components.map((part) => part.name)).toEqual([
      "Duke's mayonnaise",
      "Worcestershire sauce",
    ]);
  });

  it("leaves allergens, blank prep notes and blank notes out of the prompt", () => {
    const json = JSON.stringify(resolveRecipe("sauce", sandwichLibrary()));
    expect(json).not.toContain("allergen");
    expect(json).not.toContain("prep_note");
    expect(json).not.toContain("notes");
  });

  it("refuses to describe a recipe that contains itself", () => {
    const library: Library = {
      ingredients: [],
      recipes: [recipe("a", [contains("b")]), recipe("b", [contains("a")])],
    };
    expect(() => resolveRecipe("a", library)).toThrow(RecipeLoopError);
  });
});

/* ------------------------------------------------------------ reading the reply */

const REPLY = {
  description_short: "Hot fried chicken on a toasted brioche bun with comeback sauce.",
  description_long: "A cayenne-coated chicken breast, fried and sauced. Served on brioche.",
  taste_profile: { sweet: 1, salty: 3, sour: 1, bitter: 0, umami: 2, spicy: 4, smoky: 1, tangy: 2, richness: 3 },
  texture_notes: ["crisp crust", " soft bun "],
  pairs_with: ["Coleslaw", "Sweet tea"],
};

describe("parseGeneration", () => {
  it("reads a well-formed reply", () => {
    const generation = parseGeneration(JSON.stringify(REPLY));
    expect(generation.descriptionShort).toBe(REPLY.description_short);
    expect(generation.tasteProfile.spicy).toBe(4);
    expect(generation.textureNotes).toEqual(["crisp crust", "soft bun"]);
    expect(generation.pairsWith).toEqual(["Coleslaw", "Sweet tea"]);
  });

  it("tolerates a markdown fence around the JSON", () => {
    expect(parseGeneration("```json\n" + JSON.stringify(REPLY) + "\n```").tasteProfile.salty).toBe(3);
  });

  it("rounds and pins scores to 0–5 instead of failing", () => {
    const loud = { ...REPLY, taste_profile: { ...REPLY.taste_profile, spicy: 7, sweet: -1, umami: 2.6 } };
    const { tasteProfile } = parseGeneration(JSON.stringify(loud));
    expect(tasteProfile).toMatchObject({ spicy: 5, sweet: 0, umami: 3 });
  });

  it("rejects replies that aren't the requested JSON", () => {
    expect(() => parseGeneration("Here is your description!")).toThrow(GenerationFormatError);
    expect(() => parseGeneration(JSON.stringify({ ...REPLY, description_long: "" }))).toThrow(
      /description_long/,
    );
    const partial: Record<string, number> = { ...REPLY.taste_profile };
    delete partial.richness;
    expect(() => parseGeneration(JSON.stringify({ ...REPLY, taste_profile: partial }))).toThrow(
      /richness/,
    );
    expect(() => parseGeneration(JSON.stringify({ ...REPLY, pairs_with: "Coleslaw" }))).toThrow(
      /pairs_with/,
    );
  });
});

describe("pickFrom", () => {
  it("drops values off the list and keeps the list's order", () => {
    expect(pickFrom(["smoky", "made-up", "sweet"], FLAVOR_TAGS)).toEqual(["sweet", "smoky"]);
  });
});
