import { describe, it, expect } from "vitest";

import {
  GenerationFormatError,
  RecipeLoopError,
  itemContentKey,
  itemsContaining,
  parseGeneration,
  recipeAndDependents,
  recipeContentKey,
  recipesContaining,
  recipesUsingItem,
  resolveRecipe,
  rollUpAllergens,
  wouldCreateLoop,
  type Ingredient,
  type Library,
  type Recipe,
  type RecipeComponent,
} from "@/lib/menu-descriptions";

/* ------------------------------------------------------------------ fixtures */

/** An item as the generator reads it, so each test states only what it cares about. */
function ingredient(id: string, over: Partial<Ingredient> = {}): Ingredient {
  return {
    id,
    code: id.toUpperCase(),
    name: id,
    category: "Other",
    flavorTags: [],
    textureTags: [],
    intensity: 3,
    allergens: [],
    notes: "",
    parts: [],
    ...over,
  };
}

const uses = (itemId: string, amount = 1, unit = "oz", prepNote = ""): RecipeComponent => ({
  itemId,
  childRecipeId: null,
  amount,
  unit,
  prepNote,
});

const contains = (childRecipeId: string, amount = 1, unit = "oz"): RecipeComponent => ({
  itemId: null,
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
 * second menu item that uses the same sauce. The sandwich also carries a dredge
 * — a prepped item with a bill of materials of its own.
 */
function sandwichLibrary(): Library {
  return {
    ingredients: [
      ingredient("mayo", { name: "Duke's mayonnaise", allergens: ["Egg"], flavorTags: ["tangy", "creamy"] }),
      ingredient("worcestershire", { name: "Worcestershire sauce", allergens: ["Fish"] }),
      ingredient("chicken", { name: "Chicken breast", category: "Protein", intensity: 2 }),
      ingredient("bun", { name: "Brioche bun", category: "Bakery", allergens: ["Wheat", "Egg", "Milk"] }),
      ingredient("cayenne", { name: "Cayenne pepper", category: "Spices", intensity: 5, flavorTags: ["spicy"] }),
      ingredient("flour", { name: "All-purpose flour", category: "Dry goods", allergens: ["Wheat"] }),
      ingredient("dredge", {
        name: "Nashville dredge",
        category: "Prep",
        parts: [
          { itemId: "flour", quantity: 8, unit: "lb" },
          { itemId: "cayenne", quantity: 2, unit: "lb" },
        ],
      }),
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
      recipe("tenders", [uses("chicken", 8), uses("dredge", 1), contains("sauce", 2)], {
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
    expect(rolled.map((entry) => entry.allergen)).toEqual(["Milk", "Egg", "Fish", "Wheat"]);
    expect(rolled.find((entry) => entry.allergen === "Egg")!.sources).toEqual([
      "Brioche bun",
      "House Comeback Sauce → Duke's mayonnaise",
    ]);
    expect(rolled.find((entry) => entry.allergen === "Fish")!.sources).toEqual([
      "House Comeback Sauce → Worcestershire sauce",
    ]);
  });

  it("reaches into what an item is itself made of", () => {
    const library = sandwichLibrary();
    const rolled = rollUpAllergens(find(library, "tenders").components, library);

    expect(rolled.map((entry) => entry.allergen)).toEqual(["Egg", "Fish", "Wheat"]);
    // The dredge carries no allergen of its own; the flour inside it does.
    expect(rolled.find((entry) => entry.allergen === "Wheat")!.sources).toEqual([
      "Nashville dredge → All-purpose flour",
    ]);
  });

  it("never reports None, which is a claim about a record rather than an allergen", () => {
    const library: Library = {
      ingredients: [ingredient("salt", { allergens: ["None"] })],
      recipes: [recipe("a", [uses("salt")])],
    };
    expect(rollUpAllergens(find(library, "a").components, library)).toEqual([]);
  });

  it("returns nothing for components without allergens", () => {
    const library = sandwichLibrary();
    expect(rollUpAllergens([uses("chicken"), uses("cayenne")], library)).toEqual([]);
  });

  it("does not hang on a loop that slipped into the data", () => {
    const library: Library = {
      ingredients: [ingredient("egg", { allergens: ["Egg"] })],
      recipes: [recipe("a", [contains("b"), uses("egg")]), recipe("b", [contains("a")])],
    };
    expect(rollUpAllergens(find(library, "a").components, library).map((entry) => entry.allergen)).toEqual([
      "Egg",
    ]);
  });

  it("does not hang on an item that contains itself", () => {
    const library: Library = {
      ingredients: [
        ingredient("a", { allergens: ["Soy"], parts: [{ itemId: "b", quantity: 1, unit: "lb" }] }),
        ingredient("b", { parts: [{ itemId: "a", quantity: 1, unit: "lb" }] }),
      ],
      recipes: [recipe("dish", [uses("a")])],
    };
    expect(rollUpAllergens(find(library, "dish").components, library).map((entry) => entry.allergen)).toEqual(
      ["Soy"],
    );
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

  it("finds every item built from an item, itself included", () => {
    const { ingredients } = sandwichLibrary();
    expect([...itemsContaining("flour", ingredients)].sort()).toEqual(["dredge", "flour"]);
    expect([...itemsContaining("bun", ingredients)]).toEqual(["bun"]);
  });
});

/* ------------------------------------------------------------------ staleness */

describe("staleness", () => {
  it("an item edit reaches every recipe using it, directly or through a sub-recipe", () => {
    const library = sandwichLibrary();
    expect(recipesUsingItem("mayo", library).sort()).toEqual(["sandwich", "sauce", "tenders"]);
    expect(recipesUsingItem("bun", library)).toEqual(["sandwich"]);
    expect(recipesUsingItem("nobody-uses-this", library)).toEqual([]);
  });

  it("an edit to something a prepped item is made of reaches the recipes using that item", () => {
    const library = sandwichLibrary();
    // Nothing names the flour; the dredge is made of it, and the tenders use the dredge.
    expect(recipesUsingItem("flour", library)).toEqual(["tenders"]);
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

  it("re-ticking the same tags in a different order is not an item change", () => {
    const before = ingredient("mayo", { flavorTags: ["tangy", "creamy"] });
    expect(itemContentKey({ ...before, flavorTags: ["creamy", "tangy"] })).toBe(
      itemContentKey(before),
    );
    expect(itemContentKey({ ...before, intensity: 4 })).not.toBe(itemContentKey(before));
    expect(
      itemContentKey({ ...before, parts: [{ itemId: "oil", quantity: 1, unit: "oz" }] }),
    ).not.toBe(itemContentKey(before));
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
      category: "Protein",
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

  it("carries what the catalogue says an item is made of", () => {
    const resolved = resolveRecipe("tenders", sandwichLibrary());
    const dredge = resolved.components[1];

    expect(dredge).toMatchObject({ kind: "ingredient", name: "Nashville dredge", amount: 1 });
    expect(dredge.kind === "ingredient" && dredge.made_from).toMatchObject([
      { name: "All-purpose flour", amount: 8, unit: "lb" },
      { name: "Cayenne pepper", amount: 2, unit: "lb", intensity: 5 },
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

  it("does not follow an item that contains itself", () => {
    const library: Library = {
      ingredients: [
        ingredient("a", { parts: [{ itemId: "b", quantity: 1, unit: "lb" }] }),
        ingredient("b", { parts: [{ itemId: "a", quantity: 1, unit: "lb" }] }),
      ],
      recipes: [recipe("dish", [uses("a")])],
    };
    expect(() => resolveRecipe("dish", library)).not.toThrow();
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
