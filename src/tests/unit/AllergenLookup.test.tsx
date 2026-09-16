import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AllergenLookup } from "@/components/operations/AllergenLookup";
import { buildAllergenLookup } from "@/lib/allergens";
import { buildGraph, type Component, type Item, type ItemType } from "@/lib/items";
import type { Recipe } from "@/lib/menu-descriptions";

/* ------------------------------------------------------------------ fixtures */

function makeItem(code: string, name: string, type: ItemType, allergens: string[] = []): Item {
  return {
    id: code,
    code,
    type,
    internalName: name,
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
    allergens,
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

function menuRecipe(id: string, itemIds: string[]): Recipe {
  return {
    id,
    name: id,
    isMenuItem: true,
    yieldAmount: 1,
    yieldUnit: "each",
    components: itemIds.map((itemId) => ({
      itemId,
      childRecipeId: null,
      amount: 1,
      unit: "oz",
      prepNote: "",
    })),
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

/**
 * The live catalogue's shape: dishes built as recipes on purchased items, plus
 * one dish built in the catalogue through a prepped layer.
 */
function entries() {
  const graph = buildGraph(
    [
      makeItem("RAW-0048", "Heavy breaded okra", "raw", ["Wheat"]),
      makeItem("RAW-0053", "Breaded cheddar stuffed jalapeno poppers", "raw", ["Milk", "Wheat"]),
      makeItem("RAW-0061", "All-purpose bleached flour", "raw", ["Wheat"]),
      makeItem("RAW-0040", "Premium buttermilk", "raw", ["Milk"]),
      makeItem("RAW-0067", "Seasoned chicken breading", "raw"),
      makeItem("RAW-0094", "Chicken breast", "raw", ["None"]),
      makeItem("PRE-0001", "Chicken dredge", "prepped"),
      makeItem("MENU-0001", "Tender basket", "menu"),
    ],
    new Map([
      ["PRE-0001", [part("RAW-0061"), part("RAW-0067")]],
      ["MENU-0001", [part("PRE-0001"), part("RAW-0040"), part("RAW-0094")]],
    ]),
  );
  return buildAllergenLookup(graph, [
    menuRecipe("Fried Okra", ["RAW-0048"]),
    menuRecipe("Jalapeno Poppers", ["RAW-0053"]),
  ]);
}

function open(initialAllergen: string | null = null) {
  render(
    <AllergenLookup
      entries={entries()}
      initialAllergen={initialAllergen}
      itemsPath="/operations/items"
    />,
  );
}

const results = (allergen: string) =>
  screen.getByRole("region", { name: `Everything that contains ${allergen}` });

beforeEach(() => {
  vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
});

/* --------------------------------------------------------------------- tests */

describe("AllergenLookup", () => {
  it("offers only the allergens something contains", () => {
    open();
    const chips = screen
      .getAllByRole("button", { pressed: false })
      .map((button) => button.textContent);
    expect(chips).toEqual(["Milk4", "Wheat7"]);
  });

  it("shows everything that contains an allergen, dishes and the layers under them", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /^Wheat/ }));

    const panel = results("Wheat");
    expect(within(panel).getByRole("heading", { name: "Menu items · 3" })).toBeInTheDocument();
    expect(within(panel).getByText("Tender basket")).toBeInTheDocument();
    expect(
      within(panel).getByText("from Chicken dredge → All-purpose bleached flour"),
    ).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "Prepped & sub-recipes · 1" })).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "Ingredients · 3" })).toBeInTheDocument();
    expect(within(panel).queryByText("Premium buttermilk")).not.toBeInTheDocument();

    // A row with a record links to it.
    expect(within(panel).getByRole("link", { name: /Tender basket/ })).toHaveAttribute(
      "href",
      "/operations/items/MENU-0001",
    );
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, "", "?allergen=Wheat");
  });

  it("clears the results when the same allergen is tapped again", () => {
    open("Milk");
    expect(results("Milk")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Milk/ }));
    expect(screen.queryByRole("region", { name: /Everything that contains/ })).not.toBeInTheDocument();
  });

  it("ignores an allergen in the address bar that nothing contains", () => {
    open("Peanuts");
    expect(screen.queryByRole("region", { name: /Everything that contains/ })).not.toBeInTheDocument();
  });

  it("opens a dish to show each allergen and where it comes from", () => {
    open();
    const dish = screen.getByRole("button", { name: /Tender basket/ });
    expect(dish).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(dish);
    expect(dish).toHaveAttribute("aria-expanded", "true");

    const item = dish.closest("li")!;
    expect(within(item).getByText("Milk")).toBeInTheDocument();
    expect(within(item).getByText("from Premium buttermilk")).toBeInTheDocument();
    expect(within(item).getByText("Wheat")).toBeInTheDocument();
    expect(
      within(item).getByText("from Chicken dredge → All-purpose bleached flour"),
    ).toBeInTheDocument();
  });

  it("warns when something in a dish has never had its allergens recorded", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /Tender basket/ }));

    expect(
      screen.getByText(/Allergens haven.t been recorded for Seasoned chicken breading/),
    ).toBeInTheDocument();
  });

  it("doesn't warn about a dish whose every ingredient has been checked", () => {
    open();
    const okra = screen.getByRole("button", { name: /Fried Okra/ });
    fireEvent.click(okra);

    const item = okra.closest("li")!;
    expect(within(item).getByText("from Heavy breaded okra")).toBeInTheDocument();
    expect(within(item).queryByText(/haven.t been recorded/)).not.toBeInTheDocument();
    // A recipe has no item record to open.
    expect(within(item).queryByRole("link")).not.toBeInTheDocument();
  });
});
