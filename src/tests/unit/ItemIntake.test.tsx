import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewItemForm } from "@/components/items/NewItemForm";
import type { ItemSheetFields } from "@/lib/items";

/**
 * Starting an item from the supplier's paperwork.
 *
 * The reading itself is the model's business and is tested against
 * `parseItemSheet`; what matters here is that nothing is saved until somebody
 * has looked at it, that a file which can't be read doesn't take the others
 * down with it, and that a queue of files gets a queue of codes.
 */

const actions = vi.hoisted(() => ({
  createItemAction: vi.fn(async () => "RAW-0002"),
}));
vi.mock("@/app/admin/items/actions", () => actions);

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const CATEGORIES = ["Produce", "Frozen", "Dry goods"];

const fields = (over: Partial<ItemSheetFields> = {}): ItemSheetFields => ({
  type: "raw",
  internalName: "Breaded dill pickle chips",
  customerName: "",
  aliases: [],
  category: "Frozen",
  subcategory: "",
  purchaseUnit: "case",
  packSize: "6 / 5 lb",
  purchaseCost: null,
  stockUnit: "lb",
  portionUnit: "",
  stockPerPurchaseUnit: 30,
  portionsPerStockUnit: null,
  allergens: ["Wheat"],
  flavorTags: ["salty", "tangy"],
  textureTags: ["crispy"],
  intensity: 4,
  storageZone: "frozen",
  storageTemp: "0°F or below",
  shelfLifeDays: 365,
  dateLabelRule: "",
  notes: "Crinkle-cut dill pickle slices, battered and breaded.",
  ...over,
});

const reading = (over: Partial<ItemSheetFields> = {}, crossContact = "") =>
  new Response(JSON.stringify({ fields: fields(over), crossContact }), { status: 200 });

const file = (name = "873671.pdf") => new File(["%PDF-1.7"], name, { type: "application/pdf" });

const form = () => render(<NewItemForm existingCodes={["RAW-0001"]} categories={CATEGORIES} />);

const upload = (...files: File[]) =>
  fireEvent.change(screen.getByLabelText("Spec sheets, labels or photos"), {
    target: { files },
  });

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("new item from a spec sheet", () => {
  it("fills every field it read and saves nothing until Create is pressed", async () => {
    fetchMock.mockResolvedValueOnce(
      reading({}, "Processed on shared equipment with shrimp and fish."),
    );
    form();
    upload(file());

    const name = await screen.findByDisplayValue("Breaded dill pickle chips");
    expect(name).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/items/spec-sheet", expect.anything());

    // The code follows on from the highest already in use.
    expect(screen.getByDisplayValue("RAW-0002")).toBeInTheDocument();
    expect(screen.getByDisplayValue("6 / 5 lb")).toBeInTheDocument();
    expect(screen.getByDisplayValue("30")).toBeInTheDocument();
    expect(screen.getByDisplayValue("365")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Wheat" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "crispy" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "4" })).toHaveAttribute("aria-pressed", "true");

    // The warning is shown but never becomes an allergen.
    expect(screen.getByText(/shared equipment with shrimp and fish/)).toBeInTheDocument();
    expect(actions.createItemAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Create RAW-0002" }));
    await waitFor(() =>
      expect(actions.createItemAction).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "RAW-0002",
          type: "raw",
          internalName: "Breaded dill pickle chips",
          category: "Frozen",
          packSize: "6 / 5 lb",
          stockPerPurchaseUnit: "30",
          allergens: ["Wheat"],
          flavorTags: ["salty", "tangy"],
          intensity: 4,
          storageZone: "frozen",
          shelfLifeDays: "365",
        }),
      ),
    );
    expect(await screen.findByText("RAW-0002")).toBeInTheDocument();
  });

  it("takes an edit before creating", async () => {
    fetchMock.mockResolvedValueOnce(reading());
    form();
    upload(file());

    const name = await screen.findByDisplayValue("Breaded dill pickle chips");
    fireEvent.change(name, { target: { value: "Fried pickle chips" } });
    fireEvent.click(screen.getByRole("button", { name: "Create RAW-0002" }));

    await waitFor(() =>
      expect(actions.createItemAction).toHaveBeenCalledWith(
        expect.objectContaining({ internalName: "Fried pickle chips" }),
      ),
    );
  });

  it("re-codes the draft when the layer is changed, since the prefix follows the type", async () => {
    fetchMock.mockResolvedValueOnce(reading());
    form();
    upload(file());

    await screen.findByDisplayValue("RAW-0002");
    fireEvent.change(screen.getByRole("combobox", { name: "What layer is it?" }), {
      target: { value: "packaging" },
    });
    expect(screen.getByDisplayValue("PKG-0001")).toBeInTheDocument();
    // Packaging is not asked how it tastes.
    expect(screen.queryByRole("button", { name: "crispy" })).not.toBeInTheDocument();
  });

  it("reads several files into a queue, each with its own code", async () => {
    fetchMock
      .mockResolvedValueOnce(reading({ internalName: "Dill pickle chips" }))
      .mockResolvedValueOnce(reading({ internalName: "Shredded mild cheddar" }));
    form();
    upload(file("pickles.pdf"), file("cheddar.pdf"));

    await screen.findByDisplayValue("Shredded mild cheddar");
    expect(screen.getByDisplayValue("Dill pickle chips")).toBeInTheDocument();
    expect(screen.getByDisplayValue("RAW-0002")).toBeInTheDocument();
    expect(screen.getByDisplayValue("RAW-0003")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create all 2" }));
    await waitFor(() => expect(actions.createItemAction).toHaveBeenCalledTimes(2));
  });

  it("says why one file couldn't be read without losing the others", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "That file isn't a PDF, JPEG or PNG." }), {
          status: 415,
        }),
      )
      .mockResolvedValueOnce(reading({ internalName: "Shredded mild cheddar" }));
    form();
    upload(file("screenshot.txt"), file("cheddar.pdf"));

    expect(await screen.findByRole("alert")).toHaveTextContent("isn't a PDF, JPEG or PNG");
    expect(await screen.findByDisplayValue("Shredded mild cheddar")).toBeInTheDocument();
  });

  it("refuses an oversized file before spending a call on it", () => {
    form();
    const big = new File(["x"], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 9 * 1024 * 1024 });
    upload(big);

    expect(screen.getByRole("alert")).toHaveTextContent("the limit is 4 MB");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("discards a draft nobody wants", async () => {
    fetchMock.mockResolvedValueOnce(reading());
    form();
    upload(file());

    await screen.findByDisplayValue("Breaded dill pickle chips");
    fireEvent.click(screen.getByRole("button", { name: "Discard this one" }));

    expect(screen.queryByDisplayValue("Breaded dill pickle chips")).not.toBeInTheDocument();
    // The plain form comes back once the queue is empty.
    expect(screen.getByRole("heading", { name: "Or enter it by hand" })).toBeInTheDocument();
  });
});

describe("new item by hand", () => {
  it("asks for identity only and opens the record", async () => {
    form();
    const byHand = screen.getByRole("heading", { name: "Or enter it by hand" }).closest("section")!;
    fireEvent.change(within(byHand).getByLabelText("Internal name"), {
      target: { value: "Coleslaw mix" },
    });
    fireEvent.change(within(byHand).getByLabelText("Category"), { target: { value: "Produce" } });
    fireEvent.click(screen.getByRole("button", { name: "Create item" }));

    await waitFor(() =>
      expect(actions.createItemAction).toHaveBeenCalledWith(
        expect.objectContaining({ code: "RAW-0002", internalName: "Coleslaw mix", category: "Produce" }),
      ),
    );
    expect(router.push).toHaveBeenCalledWith("/admin/items/RAW-0002");
  });
});
