import { describe, it, expect } from "vitest";

import { allergensPresent, buildAllergenLookup, type LookupEntry } from "@/lib/allergens";
import { buildGraph, type Component, type Item, type ItemType } from "@/lib/items";
import type { Recipe, RecipeComponent } from "@/lib/menu-descriptions";

/* ------------------------------------------------------------------ fixtures */

/** A bare item, so each test only states the fields it cares about. */
function makeItem(code: string, type: ItemType, over: Partial<Item> = {}): Item {
  return {
    id: code,
    code,
    type,
    internalName: code,
    customerName: "",
    aliases: [],
    category: "Test",
    subcategory: "",
    status: "active",
    purchaseUnit: "",
    packSize: "",
    purchaseCost: null,
    parLevel: null,
    reorderPoint: null,
    stockUnit: "lb",
    portionUnit: "",
    stockPerPurchaseUnit: null,
    portionsPerStockUnit: null,
    yieldFactor: 1,
    batchYieldQuantity: 1,
    recipeUrl: "",
    menuPrice: null,
    allergens: [],
    flavorTags: [],
    textureTags: [],
    intensity: 3,
    storageZone: "none",
    storageTemp: "",
    shelfLifeDays: null,
    dateLabelRule: "",
    nutrition: {},
    photoUrl: "",
    sopLinks: [],
    notes: "",
    scope: "core",
    availableEverywhere: true,
    version: 1,
    createdAt: "",
    updatedAt: "",
    updatedBy: "",
    ...over,
  };
}

const part = (componentId: string): Component => ({
  id: `${componentId}-edge`,
  componentId,
  quantity: 1,
  basis: "stock",
  sortOrder: 0,
  note: "",
});

/** A catalogue from items plus `parent: [children]`. */
function graphOf(items: Item[], builds: Record<string, string[]> = {}) {
  return buildGraph(
    items,
    new Map(Object.entries(builds).map(([parent, children]) => [parent, children.map(part)])),
  );
}

const uses = (itemId: string): RecipeComponent => ({
  itemId,
  childRecipeId: null,
  amount: 1,
  unit: "oz",
  prepNote: "",
});

const contains = (childRecipeId: string): RecipeComponent => ({
  itemId: null,
  childRecipeId,
  amount: 1,
  unit: "oz",
  prepNote: "",
});

function recipe(id: string, components: RecipeComponent[], isMenuItem = false): Recipe {
  return {
    id,
    name: id,
    isMenuItem,
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
    updatedAt: "",
  };
}

const named = (entries: LookupEntry[], name: string) => {
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`No entry called ${name}`);
  return entry;
};

const allergensOf = (entries: LookupEntry[], name: string) =>
  named(entries, name).allergens.map((found) => found.allergen);

/**
 * Three layers: flour and buttermilk at the bottom, a dredge and a marinade
 * built from them, and a sandwich built from those plus a bun that lists its
 * own allergens.
 */
function sandwichShop() {
  return graphOf(
    [
      makeItem("Flour", "raw", { allergens: ["Wheat"] }),
      makeItem("Buttermilk", "raw", { allergens: ["Milk"] }),
      makeItem("Salt", "raw", { allergens: ["None"] }),
      makeItem("Bun", "raw", { allergens: ["Wheat", "Sesame"] }),
      makeItem("Dredge", "prepped"),
      makeItem("Marinade", "prepped"),
      makeItem("Sandwich", "menu", { customerName: "Hot Chicken Sandwich" }),
      makeItem("Clamshell", "packaging"),
    ],
    {
      Dredge: ["Flour", "Salt"],
      Marinade: ["Buttermilk", "Salt"],
      Sandwich: ["Dredge", "Marinade", "Bun", "Clamshell"],
    },
  );
}

/* --------------------------------------------------------------------- items */

describe("rolling allergens up the catalogue", () => {
  it("carries an ingredient's allergens through every layer to the dish", () => {
    const entries = buildAllergenLookup(sandwichShop(), []);

    expect(allergensOf(entries, "Dredge")).toEqual(["Wheat"]);
    expect(allergensOf(entries, "Marinade")).toEqual(["Milk"]);
    // Vocabulary order, not the order they were found in.
    expect(allergensOf(entries, "Hot Chicken Sandwich")).toEqual(["Milk", "Wheat", "Sesame"]);
  });

  it("names every route an allergen arrives by", () => {
    const sandwich = named(buildAllergenLookup(sandwichShop(), []), "Hot Chicken Sandwich");
    const wheat = sandwich.allergens.find((found) => found.allergen === "Wheat")!;

    expect(wheat.listed).toBe(false);
    expect(wheat.via).toEqual(["Dredge → Flour", "Bun"]);
  });

  it("marks an allergen the record lists itself apart from one it inherits", () => {
    const entries = buildAllergenLookup(sandwichShop(), []);
    const flour = named(entries, "Flour").allergens[0];

    expect(flour).toEqual({ allergen: "Wheat", listed: true, via: [] });
  });

  it("reaches as deep as the build goes", () => {
    const graph = graphOf(
      [
        makeItem("Worcestershire", "raw", { allergens: ["Fish", "Soy"] }),
        makeItem("Seasoning", "prepped"),
        makeItem("Sauce", "prepped"),
        makeItem("Wings", "menu"),
      ],
      { Seasoning: ["Worcestershire"], Sauce: ["Seasoning"], Wings: ["Sauce"] },
    );
    const wings = named(buildAllergenLookup(graph, []), "Wings");

    expect(wings.allergens.map((found) => found.allergen)).toEqual(["Fish", "Soy"]);
    expect(wings.allergens[0].via).toEqual(["Sauce → Seasoning → Worcestershire"]);
  });

  it("never reports None, which is a claim about a record rather than an allergen", () => {
    const entries = buildAllergenLookup(sandwichShop(), []);
    expect(named(entries, "Salt").allergens).toEqual([]);
    expect(allergensPresent(entries).map((found) => found.allergen)).not.toContain("None");
  });

  it("leaves packaging out of the lookup", () => {
    const entries = buildAllergenLookup(sandwichShop(), []);
    expect(entries.map((entry) => entry.name)).not.toContain("Clamshell");
  });

  it("keeps a discontinued item off the list but still counts it inside a live dish", () => {
    const graph = graphOf(
      [
        makeItem("Old bun", "raw", { allergens: ["Egg"], status: "discontinued" }),
        makeItem("Slider", "menu"),
      ],
      { Slider: ["Old bun"] },
    );
    const entries = buildAllergenLookup(graph, []);

    expect(entries.map((entry) => entry.name)).toEqual(["Slider"]);
    expect(allergensOf(entries, "Slider")).toEqual(["Egg"]);
  });

  it("stops at a loop instead of walking forever", () => {
    const graph = graphOf(
      [makeItem("A", "prepped", { allergens: ["Soy"] }), makeItem("B", "prepped", { allergens: ["Egg"] })],
      { A: ["B"], B: ["A"] },
    );
    const entries = buildAllergenLookup(graph, []);
    expect(allergensOf(entries, "A")).toEqual(["Egg", "Soy"]);
  });
});

/* ----------------------------------------------------------------- unchecked */

describe("ingredients nobody has checked", () => {
  it("flags an ingredient with no allergens recorded, all the way up to the dish", () => {
    const graph = graphOf(
      [
        makeItem("Breading", "raw"),
        makeItem("Chicken", "raw", { allergens: ["None"] }),
        makeItem("Tenders", "menu"),
      ],
      { Tenders: ["Breading", "Chicken"] },
    );
    const entries = buildAllergenLookup(graph, []);

    expect(named(entries, "Breading").unchecked).toEqual(["Breading"]);
    expect(named(entries, "Chicken").unchecked).toEqual([]);
    expect(named(entries, "Tenders").unchecked).toEqual(["Breading"]);
  });

  it("doesn't flag a built item for an empty list its components answer for", () => {
    const entries = buildAllergenLookup(sandwichShop(), []);
    expect(named(entries, "Dredge").unchecked).toEqual([]);
    expect(named(entries, "Hot Chicken Sandwich").unchecked).toEqual([]);
  });

  it("flags a dish with nothing in it yet", () => {
    const entries = buildAllergenLookup(graphOf([makeItem("Special", "menu")]), [
      recipe("Soup", [], true),
    ]);
    expect(named(entries, "Special").unchecked).toEqual(["Special"]);
    expect(named(entries, "Soup").unchecked).toEqual(["Soup"]);
  });
});

/* ------------------------------------------------------------------- recipes */

describe("menu items built as recipes", () => {
  it("rolls up through sub-recipes and the items' own builds", () => {
    const recipes = [
      recipe("House sauce", [uses("Buttermilk")]),
      recipe("Chicken biscuit", [contains("House sauce"), uses("Dredge")], true),
    ];
    const entries = buildAllergenLookup(sandwichShop(), recipes);
    const biscuit = named(entries, "Chicken biscuit");

    expect(biscuit.kind).toBe("menu");
    expect(named(entries, "House sauce").kind).toBe("prep");
    expect(biscuit.allergens).toEqual([
      { allergen: "Milk", listed: false, via: ["House sauce → Buttermilk"] },
      { allergen: "Wheat", listed: false, via: ["Dredge → Flour"] },
    ]);
  });

  it("shows a dish that is both a recipe and a menu item once, carrying everything either contains", () => {
    const graph = graphOf(
      [
        makeItem("Flour", "raw", { allergens: ["Wheat"] }),
        makeItem("Cheese", "raw", { allergens: ["Milk"] }),
        makeItem("Mystery", "raw"),
        makeItem("MENU-0001", "menu", { customerName: "Fried  okra" }),
      ],
      { "MENU-0001": ["Flour"] },
    );
    const entries = buildAllergenLookup(graph, [
      recipe("Fried Okra", [uses("Cheese"), uses("Mystery")], true),
    ]);

    const okra = entries.filter((entry) => entry.kind === "menu");
    expect(okra).toHaveLength(1);
    expect(okra[0].code).toBe("MENU-0001");
    expect(okra[0].allergens.map((found) => found.allergen)).toEqual(["Milk", "Wheat"]);
    expect(okra[0].unchecked).toEqual(["Mystery"]);
  });
});

/* ------------------------------------------------------------------ the chips */

describe("allergensPresent", () => {
  it("lists only allergens something contains, counting everything built on them", () => {
    const present = allergensPresent(buildAllergenLookup(sandwichShop(), []));

    expect(present).toEqual([
      // Buttermilk, Marinade, Sandwich
      { allergen: "Milk", count: 3 },
      // Flour, Bun, Dredge, Sandwich
      { allergen: "Wheat", count: 4 },
      // Bun, Sandwich
      { allergen: "Sesame", count: 2 },
    ]);
  });

  it("groups menu items first, then add-ons, prep and ingredients", () => {
    const graph = graphOf([
      makeItem("Flour", "raw", { allergens: ["Wheat"] }),
      makeItem("Extra cheese", "modifier", { allergens: ["Milk"] }),
      makeItem("Dredge", "prepped", { allergens: ["Wheat"] }),
      makeItem("Tenders", "menu", { allergens: ["Wheat"] }),
    ]);
    expect(buildAllergenLookup(graph, []).map((entry) => entry.kind)).toEqual([
      "menu",
      "addon",
      "prep",
      "ingredient",
    ]);
  });
});
