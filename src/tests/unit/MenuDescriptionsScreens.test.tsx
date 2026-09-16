import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeBuilder } from "@/components/menu-descriptions/RecipeBuilder";
import type { Ingredient, Library, Recipe, RecipeComponent } from "@/lib/menu-descriptions";

// Server Actions have no meaning in jsdom.
vi.mock("@/app/admin/actions", () => ({ logout: vi.fn() }));

const actions = vi.hoisted(() => ({
  saveRecipeAction: vi.fn(async () => ({ ok: true, value: { id: "sandwich" } })),
  deleteRecipeAction: vi.fn(async () => ({ ok: true, value: undefined })),
  generateDescriptionAction: vi.fn(async () => ({ ok: true, value: undefined })),
}));
vi.mock("@/app/admin/menu-descriptions/actions", () => actions);

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

/* ------------------------------------------------------------------ fixtures */

const ingredient = (
  id: string,
  code: string,
  name: string,
  over: Partial<Ingredient> = {},
): Ingredient => ({
  id,
  code,
  name,
  category: "Other",
  flavorTags: [],
  textureTags: [],
  intensity: 3,
  allergens: [],
  notes: "",
  parts: [],
  ...over,
});

const line = (over: Partial<RecipeComponent>): RecipeComponent => ({
  itemId: null,
  childRecipeId: null,
  amount: 1,
  unit: "oz",
  prepNote: "",
  ...over,
});

const recipe = (id: string, name: string, over: Partial<Recipe> = {}): Recipe => ({
  id,
  name,
  isMenuItem: false,
  yieldAmount: 1,
  yieldUnit: "each",
  components: [],
  description: null,
  descriptionShort: null,
  tasteProfile: null,
  textureNotes: [],
  pairsWith: [],
  generatedAt: null,
  isStale: false,
  updatedAt: "2026-09-14T12:00:00Z",
  ...over,
});

function library(sandwich: Partial<Recipe> = {}): Library {
  return {
    ingredients: [
      ingredient("mayo", "RAW-0019", "Duke's mayonnaise", {
        category: "Condiments",
        allergens: ["Egg"],
      }),
      ingredient("chicken", "RAW-0010", "Chicken breast", { category: "Protein" }),
      ingredient("bun", "RAW-0004", "Brioche bun", {
        category: "Bakery",
        allergens: ["Wheat", "Milk"],
      }),
      ingredient("cayenne", "RAW-0003", "Cayenne pepper", { category: "Spices", intensity: 5 }),
    ],
    recipes: [
      recipe("sauce", "House Comeback Sauce", {
        yieldAmount: 32,
        yieldUnit: "oz",
        components: [line({ itemId: "mayo", amount: 20 })],
      }),
      recipe("sandwich", "Nashville Hot Chicken Sandwich", {
        isMenuItem: true,
        components: [
          line({ itemId: "chicken", amount: 6, prepNote: "pounded" }),
          line({ childRecipeId: "sauce", amount: 1 }),
        ],
        ...sandwich,
      }),
    ],
  };
}

function openBuilder(id: string, over: { sandwich?: Partial<Recipe>; ready?: boolean } = {}) {
  const lib = library(over.sandwich);
  const current = lib.recipes.find((entry) => entry.id === id)!;
  render(<RecipeBuilder recipe={current} library={lib} generatorReady={over.ready ?? true} />);
  return lib;
}

const allergenPanel = () => screen.getByRole("heading", { name: "Allergens" }).closest("section")!;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ builder */

describe("RecipeBuilder", () => {
  it("rolls allergens up from inside sub-recipes", () => {
    openBuilder("sandwich");
    const panel = allergenPanel();
    expect(within(panel).getByText("Egg")).toBeInTheDocument();
    expect(within(panel).getByText("House Comeback Sauce → Duke's mayonnaise")).toBeInTheDocument();
  });

  it("picks a component by typing, and the allergens follow before saving", () => {
    openBuilder("sandwich");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Add component" }));
    const picker = screen.getByRole("combobox", { name: "Component 3" });
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: "bri" } });

    const listbox = screen.getByRole("listbox", { name: "Component 3" });
    expect(within(listbox).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "RAW-0004Brioche bunBakery",
    ]);

    fireEvent.keyDown(picker, { key: "Enter" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(picker).toHaveValue("Brioche bun");

    expect(within(allergenPanel()).getByText("Wheat")).toBeInTheDocument();
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("finds an item by its code, which is what is printed on the case", () => {
    openBuilder("sandwich");
    fireEvent.click(screen.getByRole("button", { name: "Add component" }));
    const picker = screen.getByRole("combobox", { name: "Component 3" });
    fireEvent.focus(picker);
    fireEvent.change(picker, { target: { value: "raw-0003" } });

    const listbox = screen.getByRole("listbox", { name: "Component 3" });
    expect(within(listbox).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "RAW-0003Cayenne pepperSpices",
    ]);
  });

  it("groups items and recipes, and never offers a recipe that would loop", () => {
    openBuilder("sauce");
    const picker = screen.getByRole("combobox", { name: "Component 1" });
    fireEvent.focus(picker);

    const listbox = screen.getByRole("listbox");
    // Only the items group: the sandwich already contains the sauce, and the
    // sauce can't contain itself, so there is no recipe left to offer.
    const groups = within(listbox).getAllByRole("group");
    expect(groups).toHaveLength(1);
    expect(within(groups[0]).getAllByRole("option")).toHaveLength(4);
    expect(within(listbox).queryByText("Nashville Hot Chicken Sandwich")).not.toBeInTheDocument();
    expect(within(listbox).queryByText("House Comeback Sauce")).not.toBeInTheDocument();
  });

  it("saves items and sub-recipes as ids, skipping a row nobody filled in", async () => {
    openBuilder("sandwich");
    fireEvent.change(screen.getByLabelText("Component 1 amount"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Add component" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(actions.saveRecipeAction).toHaveBeenCalled());
    const [id, input] = actions.saveRecipeAction.mock.calls[0] as unknown as [string, { components: unknown[] }];
    expect(id).toBe("sandwich");
    expect(input.components).toEqual([
      { itemId: "chicken", childRecipeId: null, amount: "7", unit: "oz", prepNote: "pounded" },
      { itemId: null, childRecipeId: "sauce", amount: "1", unit: "oz", prepNote: "" },
    ]);
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
  });

  it("shows what went wrong when a save is refused", async () => {
    actions.saveRecipeAction.mockResolvedValueOnce({ ok: false, error: "Component 1 needs an amount." } as never);
    openBuilder("sandwich");
    fireEvent.change(screen.getByLabelText("Component 1 amount"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Component 1 needs an amount.");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("marks an out-of-date description and regenerates only when asked, after confirming", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    openBuilder("sandwich", {
      sandwich: {
        generatedAt: "2026-09-10T15:00:00Z",
        isStale: true,
        description: "Fried chicken on a bun.",
        descriptionShort: "Hot chicken sandwich.",
        tasteProfile: { sweet: 1, salty: 3, sour: 1, bitter: 0, umami: 2, spicy: 4, smoky: 1, tangy: 2, richness: 3 },
        pairsWith: ["Coleslaw"],
      },
    });

    expect(screen.getByText(/An ingredient or component changed/)).toBeInTheDocument();
    expect(screen.getByText("Coleslaw")).toBeInTheDocument();
    expect(actions.generateDescriptionAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(actions.generateDescriptionAction).toHaveBeenCalledWith("sandwich"));
    // Nothing had changed, so nothing was saved first.
    expect(actions.saveRecipeAction).not.toHaveBeenCalled();
  });

  it("saves pending edits before generating", async () => {
    openBuilder("sandwich");
    fireEvent.change(screen.getByLabelText("Component 1 amount"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Save & generate" }));

    await waitFor(() => expect(actions.generateDescriptionAction).toHaveBeenCalledWith("sandwich"));
    expect(actions.saveRecipeAction).toHaveBeenCalledTimes(1);
    expect(actions.saveRecipeAction.mock.invocationCallOrder[0]).toBeLessThan(
      actions.generateDescriptionAction.mock.invocationCallOrder[0],
    );
  });

  it("explains why generating is unavailable without an API key", () => {
    openBuilder("sandwich", { ready: false });
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
    expect(screen.getByText("ANTHROPIC_API_KEY")).toBeInTheDocument();
  });

  it("asks for a save before a new recipe can be generated", () => {
    render(<RecipeBuilder recipe={null} library={library()} generatorReady />);
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Save the recipe, then generate/)).toBeInTheDocument();
  });
});
