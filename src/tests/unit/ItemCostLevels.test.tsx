import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ItemRecord } from "@/components/items/ItemRecord";
import { buildGraph, costOf, type Item } from "@/lib/items";

/**
 * The cost-at-every-level table on an item's record.
 *
 * The arithmetic is pinned in `Items.test.ts`; this is about what the owner
 * reads — one row per level, blanks rather than zeroes, and the warning when a
 * pack size contradicts the conversion the costing runs on.
 */

vi.mock("@/app/admin/items/actions", () => ({}));
vi.mock("@/app/admin/actions", () => ({ logout: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const item = (over: Partial<Item>): Item => ({
  id: "item",
  code: "RAW-0063",
  type: "raw",
  internalName: "Original barbecue sauce",
  customerName: "",
  aliases: [],
  category: "Condiments & sauces",
  subcategory: "",
  status: "active",
  purchaseUnit: "case",
  packSize: "",
  purchaseCost: null,
  parLevel: null,
  reorderPoint: null,
  stockUnit: "",
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
});

function record(subject: Item) {
  render(
    <ItemRecord
      item={subject}
      cost={costOf(subject.id, buildGraph([subject], new Map()))}
      gaps={[]}
      usedBy={[]}
      candidates={[]}
      suppliers={[]}
      itemSuppliers={[]}
      locations={[]}
      itemLocationIds={[]}
      revisions={[]}
      canEdit={false}
      basePath="/operations/items"
      chrome="operations"
    />,
  );
}

/** The table's body rows, each as its cells' text. */
function levels(): string[][] {
  const panel = screen.getByRole("heading", { name: "Cost at every level" }).closest("section")!;
  return within(panel)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent ?? ""));
}

describe("cost at every level", () => {
  it("prices a case of sauce down to the ounce", () => {
    record(
      item({
        packSize: "4 / 1 ga",
        purchaseCost: 59.16,
        stockUnit: "gal",
        stockPerPurchaseUnit: 4,
        portionUnit: "serving",
        portionsPerStockUnit: 128,
      }),
    );

    expect(screen.getByRole("columnheader", { name: "In a case" })).toBeInTheDocument();
    expect(levels()).toEqual([
      ["case4 / 1 ga", "1", "$59.16"],
      ["gal", "4", "$14.79"],
      ["fl oz = 1 serving", "512", "$0.1155"],
    ]);
  });

  it("shows the breakdown blank, not zero, before there is a price", () => {
    record(
      item({
        code: "PKG-0003",
        type: "packaging",
        internalName: "Black foam hinged container",
        packSize: "2 / 100 ct",
        stockUnit: "each",
        stockPerPurchaseUnit: 200,
      }),
    );

    expect(levels()).toEqual([
      ["case2 / 100 ct", "1", "—"],
      ["pack100 ct", "2", "—"],
      ["each", "200", "—"],
    ]);
    expect(screen.getByText(/No price per case yet/)).toBeInTheDocument();
  });

  it("warns when the pack size contradicts the conversion", () => {
    record(
      item({
        code: "PKG-0004",
        type: "packaging",
        internalName: "20 oz plastic cup",
        packSize: "200 / .5 oz",
        purchaseCost: 42.95,
        stockUnit: "each",
        stockPerPurchaseUnit: 1000,
      }),
    );

    expect(levels()).toEqual([
      ["case200 / .5 oz", "1", "$42.95"],
      ["each", "1000", "$0.0430"],
    ]);
    expect(screen.getByText(/doesn't come to 1000 each a case/)).toBeInTheDocument();
  });

  it("is left off a record with nothing to break down", () => {
    record(item({ type: "smallware", purchaseUnit: "each", purchaseCost: 30 }));
    expect(screen.queryByRole("heading", { name: "Cost at every level" })).toBeNull();
  });
});
