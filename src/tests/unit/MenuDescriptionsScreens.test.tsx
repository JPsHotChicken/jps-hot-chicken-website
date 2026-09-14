import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IngredientsTable } from "@/components/menu-descriptions/IngredientsTable";
import { RecipeBuilder } from "@/components/menu-descriptions/RecipeBuilder";
import type { Ingredient, Library, Recipe, RecipeComponent } from "@/lib/menu-descriptions";

// Server Actions have no meaning in jsdom.
vi.mock("@/app/admin/actions", () => ({ logout: vi.fn() }));

const actions = vi.hoisted(() => ({
  createIngredientAction: vi.fn(async () => ({ ok: true, value: undefined })),
  updateIngredientAction: vi.fn(async () => ({ ok: true, value: { staleCount: 0 } })),
  deleteIngredientAction: vi.fn(async () => ({ ok: true, value: undefined })),
  saveRecipeAction: vi.fn(async () => ({ ok: true, value: { id: "sandwich" } })),
  deleteRecipeAction: vi.fn(async () => ({ ok: true, value: undefined })),
  generateDescriptionAction: vi.fn(async () => ({ ok: true, value: undefined })),
}));
vi.mock("@/app/admin/menu-descriptions/actions", () => actions);

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

/* ------------------------------------------------------------------ fixtures */

const ingredient = (id: string, name: string, over: Partial<Ingredient> = {}): Ingredient => ({
  id,
  name,
  category: "other",
  flavorTags: [],
  textureTags: [],
  intensity: 3,
  allergens: [],
  notes: "",
  ...over,
});

const line = (over: Partial<RecipeComponent>): RecipeComponent => ({
  ingredientId: null,
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
      ingredient("mayo", "Duke's mayonnaise", { category: "condiment", allergens: ["egg"] }),
      ingredient("chicken", "Chicken breast", { category: "protein" }),
      ingredient("bun", "Brioche bun", { category: "bread", allergens: ["gluten", "dairy"] }),
      ingredient("cayenne", "Cayenne pepper", { category: "spice", intensity: 5 }),
    ],
    recipes: [
      recipe("sauce", "House Comeback Sauce", {
        yieldAmount: 32,
        yieldUnit: "oz",
        components: [line({ ingredientId: "mayo", amount: 20 })],
      }),
      recipe("sandwich", "Nashville Hot Chicken Sandwich", {
        isMenuItem: true,
        components: [
          line({ ingredientId: "chicken", amount: 6, prepNote: "pounded" }),
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
      "Brioche bunBread",
    ]);

    fireEvent.keyDown(picker, { key: "Enter" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(picker).toHaveValue("Brioche bun");

    expect(within(allergenPanel()).getByText("Gluten")).toBeInTheDocument();
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("groups ingredients and recipes, and never offers a recipe that would loop", () => {
    openBuilder("sauce");
    const picker = screen.getByRole("combobox", { name: "Component 1" });
    fireEvent.focus(picker);

    const listbox = screen.getByRole("listbox");
    // Only the ingredients group: the sandwich already contains the sauce, and
    // the sauce can't contain itself, so there is no recipe left to offer.
    const groups = within(listbox).getAllByRole("group");
    expect(groups).toHaveLength(1);
    expect(within(groups[0]).getAllByRole("option")).toHaveLength(4);
    expect(within(listbox).queryByText("Nashville Hot Chicken Sandwich")).not.toBeInTheDocument();
    expect(within(listbox).queryByText("House Comeback Sauce")).not.toBeInTheDocument();
  });

  it("saves ingredients and sub-recipes as ids, skipping a row nobody filled in", async () => {
    openBuilder("sandwich");
    fireEvent.change(screen.getByLabelText("Component 1 amount"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Add component" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(actions.saveRecipeAction).toHaveBeenCalled());
    const [id, input] = actions.saveRecipeAction.mock.calls[0] as unknown as [string, { components: unknown[] }];
    expect(id).toBe("sandwich");
    expect(input.components).toEqual([
      { ingredientId: "chicken", childRecipeId: null, amount: "7", unit: "oz", prepNote: "pounded" },
      { ingredientId: null, childRecipeId: "sauce", amount: "1", unit: "oz", prepNote: "" },
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

/* -------------------------------------------------------------- ingredients */

describe("IngredientsTable", () => {
  const rows = () => library().ingredients;

  it("filters by name", () => {
    render(<IngredientsTable ingredients={rows()} />);
    fireEvent.change(screen.getByLabelText("Search ingredients by name"), { target: { value: "BUN" } });
    expect(screen.getByText("Brioche bun")).toBeInTheDocument();
    expect(screen.queryByText("Chicken breast")).not.toBeInTheDocument();
  });

  it("edits a row in place and says how many descriptions went out of date", async () => {
    actions.updateIngredientAction.mockResolvedValueOnce({ ok: true, value: { staleCount: 2 } });
    render(<IngredientsTable ingredients={rows()} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit Cayenne pepper" }));
    fireEvent.click(screen.getByRole("button", { name: "smoky" }));
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(actions.updateIngredientAction).toHaveBeenCalledWith(
        "cayenne",
        expect.objectContaining({ flavorTags: ["smoky"], intensity: 4, name: "Cayenne pepper" }),
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("2 descriptions are now out of date");
  });

  it("keeps the row open with the error when a save is refused", async () => {
    actions.createIngredientAction.mockResolvedValueOnce({
      ok: false,
      error: 'There\'s already an ingredient called "Brioche bun".',
    } as never);
    render(<IngredientsTable ingredients={rows()} />);

    fireEvent.click(screen.getByRole("button", { name: "Add ingredient" }));
    fireEvent.change(screen.getByPlaceholderText("Duke's mayonnaise"), { target: { value: "Brioche bun" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("already an ingredient");
    expect(screen.getByPlaceholderText("Duke's mayonnaise")).toHaveValue("Brioche bun");
  });
});
