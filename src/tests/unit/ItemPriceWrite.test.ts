import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Item } from "@/lib/items";
import type { PricedProduct } from "@/lib/item-prices";

/**
 * What an invoice import actually writes.
 *
 * The matching is settled on screen and tested elsewhere; this is the other
 * half — that a price landing on a record touches the purchasing fields and
 * nothing else, that a conversion it cannot work out is left alone rather than
 * cleared, that the supplier an item already buys from keeps its place, and
 * that one row failing doesn't take the rest of the file down with it.
 */

const repo = vi.hoisted(() => ({
  findItemById: vi.fn(),
  updateItem: vi.fn(async () => ({}) as Item),
  setItemSupplier: vi.fn(async () => {}),
  findOrCreateSupplier: vi.fn(async () => ({
    id: "pfg",
    name: "Performance Foodservice Nashville",
    accountNumber: "",
    contact: "",
    notes: "",
    active: true,
  })),
  loadSupplierLinks: vi.fn(async () => [] as unknown[]),
}));
vi.mock("@/lib/items-repo", () => repo);
vi.mock("@/lib/menu-descriptions-repo", () => ({ markStaleForItems: vi.fn(async () => 0) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

// The action re-checks the session itself; here it is always the owner.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "ok" }) }) }));
vi.mock("@/lib/admin-auth", () => ({
  SESSION_COOKIE: "admin",
  verifySessionToken: async () => true,
}));

const { importPricesAction } = await import("@/app/admin/items/actions");

/* ----------------------------------------------------------------- fixtures */

const ITEM_ID = "11111111-2222-3333-4444-555555555555";

function makeItem(over: Partial<Item> = {}): Item {
  return {
    id: ITEM_ID,
    code: "RAW-0001",
    type: "raw",
    internalName: "Chicken tenderloin",
    customerName: "",
    aliases: [],
    category: "Protein",
    subcategory: "",
    status: "active",
    purchaseUnit: "case",
    packSize: "1 / 40 lb",
    purchaseCost: 41.1,
    parLevel: 3,
    reorderPoint: null,
    stockUnit: "lb",
    portionUnit: "tender",
    stockPerPurchaseUnit: 40,
    portionsPerStockUnit: 5,
    yieldFactor: 0.94,
    batchYieldQuantity: 1,
    recipeUrl: "",
    menuPrice: null,
    allergens: ["None"],
    flavorTags: [],
    textureTags: [],
    intensity: 3,
    storageZone: "refrigerated",
    storageTemp: "≤ 38°F",
    shelfLifeDays: 5,
    dateLabelRule: "",
    nutrition: {},
    photoUrl: "",
    sopLinks: [],
    notes: "Trim before brining.",
    scope: "core",
    availableEverywhere: true,
    version: 4,
    createdAt: "2026-08-19T20:04:20Z",
    updatedAt: "2026-08-19T20:04:20Z",
    updatedBy: "owner",
    ...over,
  };
}

const product = (over: Partial<PricedProduct> = {}): PricedProduct => ({
  partNumber: "158754",
  description: "CHICKEN TNDR JUMBO CLPPD CVP",
  brand: "WEST CRK",
  packSize: "4/10 LB",
  purchaseUnit: "case",
  cost: 44.25,
  invoiceNumber: "6908761",
  invoiceDate: "2026-09-14",
  ...over,
});

const run = (over: Partial<PricedProduct> = {}, itemId = ITEM_ID) =>
  importPricesAction([{ itemId, product: product(over) }], "Performance Foodservice Nashville");

/** The arguments of the one save the action made. */
const savedCall = () =>
  repo.updateItem.mock.calls[0] as unknown as [string, Item, string, string];

/** The draft handed to the repo, and the note it was saved under. */
const saved = () => savedCall()[1];
const savedSummary = () => savedCall()[3];

/** The approved-supplier row the action wrote. */
const approved = () =>
  (repo.setItemSupplier.mock.calls[0] as unknown as [{ isPrimary: boolean }])[0];

beforeEach(() => {
  vi.clearAllMocks();
  repo.findItemById.mockResolvedValue(makeItem());
  repo.loadSupplierLinks.mockResolvedValue([]);
  repo.findOrCreateSupplier.mockResolvedValue({
    id: "pfg",
    name: "Performance Foodservice Nashville",
    accountNumber: "",
    contact: "",
    notes: "",
    active: true,
  });
});

/* -------------------------------------------------------------------- tests */

describe("writing a price onto an item", () => {
  it("moves the purchasing fields and leaves the rest of the record alone", async () => {
    const result = await run();

    expect(result).toMatchObject({ updated: 1, unchanged: 0 });
    expect(saved()).toMatchObject({
      purchaseCost: 44.25,
      purchaseUnit: "case",
      packSize: "4 / 10 lb",
      stockPerPurchaseUnit: 40,
      // Untouched, and worth saying so: these are the fields a price import has
      // no business rewriting.
      yieldFactor: 0.94,
      portionsPerStockUnit: 5,
      parLevel: 3,
      notes: "Trim before brining.",
      allergens: ["None"],
    });
  });

  it("names the invoice in the history, so a price can be traced back", async () => {
    await run();
    expect(savedSummary()).toBe("Price from invoice 6908761 (2026-09-14)");
  });

  it("leaves the conversion alone when the pack can't be read in the stock unit", async () => {
    repo.findItemById.mockResolvedValue(
      makeItem({ stockUnit: "bun", stockPerPurchaseUnit: 96, packSize: "" }),
    );
    // 96 buns or 268.8 ounces — not a question an import is allowed to answer.
    await run({ packSize: "96/2.8 OZ" });

    expect(saved().stockPerPurchaseUnit).toBe(96);
  });

  it("writes nothing when the record already says what the invoice does", async () => {
    repo.findItemById.mockResolvedValue(
      makeItem({ purchaseCost: 44.25, packSize: "4 / 10 lb", stockPerPurchaseUnit: 40 }),
    );
    const result = await run();

    expect(repo.updateItem).not.toHaveBeenCalled();
    expect(result).toMatchObject({ updated: 0, unchanged: 1, linked: 1 });
    // The product number still goes on, which is the point of running it again.
    expect(repo.setItemSupplier).toHaveBeenCalledOnce();
  });
});

describe("the supplier the price came from", () => {
  it("writes the product number onto the item", async () => {
    await run();

    expect(repo.findOrCreateSupplier).toHaveBeenCalledWith("Performance Foodservice Nashville");
    expect(repo.setItemSupplier).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: ITEM_ID,
        supplierId: "pfg",
        supplierPartNumber: "158754",
        cost: 44.25,
        packSize: "4 / 10 lb",
      }),
    );
  });

  it("takes primary for an item that has no supplier yet", async () => {
    await run();
    expect(approved()).toMatchObject({ isPrimary: true });
  });

  it("does not unseat the supplier an item already buys from", async () => {
    repo.loadSupplierLinks.mockResolvedValue([
      { itemId: ITEM_ID, supplierId: "other", supplierName: "Sysco", partNumber: "UF-1", isPrimary: true },
    ]);
    await run();

    expect(approved()).toMatchObject({ isPrimary: false });
  });

  it("keeps a supplier's own primary flag when its price is refreshed", async () => {
    repo.loadSupplierLinks.mockResolvedValue([
      { itemId: ITEM_ID, supplierId: "pfg", supplierName: "Performance Foodservice Nashville", partNumber: "158754", isPrimary: true },
    ]);
    const result = await run();

    expect(approved()).toMatchObject({ isPrimary: true });
    // The number was already on file, so nothing new was linked.
    expect(result.linked).toBe(0);
  });
});

describe("when something goes wrong", () => {
  it("turns away anything that isn't an item id", async () => {
    await expect(run({}, "not-a-uuid")).rejects.toThrow(/not a valid id/);
    expect(repo.updateItem).not.toHaveBeenCalled();
  });

  it("turns away a price that isn't a number", async () => {
    await expect(run({ cost: "lots" as unknown as number })).rejects.toThrow(/must be a number/);
    expect(repo.updateItem).not.toHaveBeenCalled();
  });

  it("saves the rows it can and names the one it couldn't", async () => {
    const second = "66666666-7777-8888-9999-000000000000";
    repo.findItemById.mockImplementation(async (id: string) =>
      id === second ? null : makeItem(),
    );

    const result = await importPricesAction(
      [
        { itemId: ITEM_ID, product: product() },
        { itemId: second, product: product({ partNumber: "61296", description: "CABBAGE GRN BOX" }) },
      ],
      "Performance Foodservice Nashville",
    );

    expect(result.updated).toBe(1);
    expect(result.failed).toEqual(["CABBAGE GRN BOX"]);
  });
});
