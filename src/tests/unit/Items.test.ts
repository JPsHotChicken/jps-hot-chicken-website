import { describe, it, expect } from "vitest";

import {
  ALLERGEN_NONE,
  buildGraph,
  canBeComponent,
  costAll,
  costOf,
  filterItems,
  foodCostPercent,
  gapsIn,
  isReferenced,
  nextCode,
  normaliseCode,
  isValidCode,
  purchasedUnitCost,
  toStockQuantity,
  whereUsed,
  EMPTY_FILTERS,
  type Component,
  type Item,
  type ItemType,
} from "@/lib/items";

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

function makeComponent(componentId: string, quantity: number, over: Partial<Component> = {}): Component {
  return {
    id: `${componentId}-edge`,
    componentId,
    quantity,
    basis: "stock",
    sortOrder: 0,
    note: "",
    ...over,
  };
}

describe("purchased unit cost", () => {
  it("divides a case price by its pack size", () => {
    // $24 a case, 6 lb usable per case.
    const item = makeItem("RAW-0001", "raw", { purchaseCost: 24, stockPerPurchaseUnit: 6 });
    expect(purchasedUnitCost(item)).toBe(4);
  });

  it("charges the yield loss to the usable part", () => {
    // A fifth is trimmed away, so the usable pound costs a quarter more.
    const item = makeItem("RAW-0001", "raw", {
      purchaseCost: 24,
      stockPerPurchaseUnit: 6,
      yieldFactor: 0.8,
    });
    expect(purchasedUnitCost(item)).toBe(5);
  });

  it("is unknown rather than zero when a price or conversion is missing", () => {
    expect(purchasedUnitCost(makeItem("A", "raw", { stockPerPurchaseUnit: 6 }))).toBeNull();
    expect(purchasedUnitCost(makeItem("B", "raw", { purchaseCost: 24 }))).toBeNull();
    expect(
      purchasedUnitCost(makeItem("C", "raw", { purchaseCost: 24, stockPerPurchaseUnit: 0 })),
    ).toBeNull();
  });
});

describe("unit conversion", () => {
  it("leaves a stock quantity alone", () => {
    const flour = makeItem("RAW-0001", "raw");
    expect(toStockQuantity(2, "stock", flour)).toBe(2);
  });

  it("converts a portion quantity into stock units", () => {
    // 16 slices to the pound, so 2 slices is an eighth of a pound.
    const tomato = makeItem("PRP-0001", "prepped", { portionsPerStockUnit: 16 });
    expect(toStockQuantity(2, "portion", tomato)).toBe(0.125);
  });

  it("cannot convert a portion with no conversion on file", () => {
    expect(toStockQuantity(2, "portion", makeItem("X", "raw"))).toBeNull();
  });
});

describe("cost roll-up", () => {
  /**
   * Three layers: a case of chicken and a bag of flour, a seasoned-flour batch
   * made from the flour, and a sandwich made from the chicken and the batch.
   */
  function kitchen() {
    const chicken = makeItem("RAW-0001", "raw", {
      purchaseCost: 40,
      stockPerPurchaseUnit: 10, // $4.00/lb
    });
    const flour = makeItem("RAW-0002", "raw", {
      purchaseCost: 12,
      stockPerPurchaseUnit: 24, // $0.50/lb
    });
    const dredge = makeItem("PRP-0001", "prepped", {
      batchYieldQuantity: 4, // one build makes 4 lb
    });
    const sandwich = makeItem("MNU-0001", "menu", { menuPrice: 10 });

    const components = new Map<string, Component[]>([
      // 8 lb of flour makes a 4 lb batch (the rest is seasoning, ignored here).
      ["PRP-0001", [makeComponent("RAW-0002", 8)]],
      [
        "MNU-0001",
        [makeComponent("RAW-0001", 0.5), makeComponent("PRP-0001", 0.25)],
      ],
    ]);

    return buildGraph([chicken, flour, dredge, sandwich], components);
  }

  it("costs a batch and divides it by the yield", () => {
    // 8 lb of flour at $0.50 = $4.00 a batch, over 4 lb = $1.00/lb.
    const cost = costOf("PRP-0001", kitchen());
    expect(cost.perBatch).toBe(4);
    expect(cost.perStockUnit).toBe(1);
  });

  it("rolls a cost up through more than one layer", () => {
    // 0.5 lb chicken at $4 = $2.00, plus 0.25 lb dredge at $1 = $0.25.
    const cost = costOf("MNU-0001", kitchen());
    expect(cost.perStockUnit).toBeCloseTo(2.25, 10);
    expect(cost.lines).toHaveLength(2);
    expect(cost.lines[0].lineCost).toBe(2);
    expect(cost.lines[1].lineCost).toBe(0.25);
  });

  it("reprices everything above a raw good when its price moves", () => {
    const graph = kitchen();
    const flour = graph.byId.get("RAW-0002")!;
    // The bag doubles in price; nothing else is touched.
    flour.purchaseCost = 24;

    const cost = costOf("MNU-0001", buildGraph(graph.items, graph.components));
    // Dredge is now $2.00/lb, so the sandwich is $2.00 + $0.50.
    expect(cost.perStockUnit).toBeCloseTo(2.5, 10);
  });

  it("reports an unknown cost rather than counting a gap as zero", () => {
    const chicken = makeItem("RAW-0001", "raw"); // no price on file
    const sandwich = makeItem("MNU-0001", "menu");
    const graph = buildGraph(
      [chicken, sandwich],
      new Map([["MNU-0001", [makeComponent("RAW-0001", 1)]]]),
    );

    const cost = costOf("MNU-0001", graph);
    expect(cost.perStockUnit).toBeNull();
    expect(cost.missing).toContain("RAW-0001");
  });

  it("names the item whose portion conversion is missing", () => {
    const slice = makeItem("PRP-0001", "prepped", { purchaseCost: 1, stockPerPurchaseUnit: 1 });
    const burger = makeItem("MNU-0001", "menu");
    const graph = buildGraph(
      [slice, burger],
      new Map([["MNU-0001", [makeComponent("PRP-0001", 2, { basis: "portion" })]]]),
    );

    const cost = costOf("MNU-0001", graph);
    expect(cost.perStockUnit).toBeNull();
    expect(cost.missing).toContain("PRP-0001");
  });

  it("costs every item in one pass", () => {
    const costs = costAll(kitchen());
    expect(costs.get("RAW-0002")!.perStockUnit).toBe(0.5);
    expect(costs.get("PRP-0001")!.perStockUnit).toBe(1);
    expect(costs.get("MNU-0001")!.perStockUnit).toBeCloseTo(2.25, 10);
  });

  it("refuses to loop forever on a cycle", () => {
    const a = makeItem("A", "prepped");
    const b = makeItem("B", "prepped");
    const graph = buildGraph(
      [a, b],
      new Map([
        ["A", [makeComponent("B", 1)]],
        ["B", [makeComponent("A", 1)]],
      ]),
    );
    // The database rejects this; the roll-up must survive it anyway.
    expect(costOf("A", graph).perStockUnit).toBeNull();
  });

  it("works out food cost as a share of menu price", () => {
    expect(foodCostPercent(2.25, 10)).toBeCloseTo(0.225, 10);
    expect(foodCostPercent(null, 10)).toBeNull();
    expect(foodCostPercent(2, 0)).toBeNull();
  });
});

describe("where used", () => {
  function graph() {
    return buildGraph(
      [
        makeItem("RAW-0001", "raw"),
        makeItem("PRP-0001", "prepped"),
        makeItem("MNU-0001", "menu"),
        makeItem("MNU-0002", "menu"),
      ],
      new Map([
        ["PRP-0001", [makeComponent("RAW-0001", 1)]],
        ["MNU-0001", [makeComponent("PRP-0001", 1)]],
        ["MNU-0002", [makeComponent("RAW-0001", 1)]],
      ]),
    );
  }

  it("finds users through every layer, not just the one above", () => {
    const codes = whereUsed("RAW-0001", graph()).map((item) => item.code);
    expect(codes).toEqual(["PRP-0001", "MNU-0001", "MNU-0002"]);
  });

  it("reports nothing for an item nobody uses", () => {
    expect(whereUsed("MNU-0001", graph())).toEqual([]);
  });

  it("guards deletion of anything still referenced", () => {
    expect(isReferenced("RAW-0001", graph())).toBe(true);
    expect(isReferenced("MNU-0001", graph())).toBe(false);
  });
});

describe("completeness", () => {
  it("asks a raw good for its purchasing and conversion data", () => {
    const fields = gapsIn(makeItem("RAW-0001", "raw"), 0).map((gap) => gap.field);
    expect(fields).toContain("purchaseUnit");
    expect(fields).toContain("purchaseCost");
    expect(fields).toContain("stockPerPurchaseUnit");
    expect(fields).toContain("allergens");
    expect(fields).toContain("storageZone");
  });

  it("never asks a thermometer about allergens", () => {
    const fields = gapsIn(makeItem("SMW-0001", "smallware"), 0).map((gap) => gap.field);
    expect(fields).not.toContain("allergens");
    expect(fields).not.toContain("storageZone");
  });

  it("counts an explicit 'None' as allergens reviewed", () => {
    const reviewed = makeItem("RAW-0001", "raw", { allergens: [ALLERGEN_NONE] });
    expect(gapsIn(reviewed, 0).map((gap) => gap.field)).not.toContain("allergens");
  });

  it("flags a menu item with nothing in it", () => {
    expect(gapsIn(makeItem("MNU-0001", "menu"), 0).map((g) => g.field)).toContain("components");
    expect(gapsIn(makeItem("MNU-0001", "menu"), 2).map((g) => g.field)).not.toContain("components");
  });

  it("only lets an item be a component once it has a stock unit", () => {
    expect(canBeComponent(makeItem("RAW-0001", "raw"))).toBe(true);
    expect(canBeComponent(makeItem("RAW-0002", "raw", { stockUnit: "" }))).toBe(false);
    expect(canBeComponent(makeItem("SMW-0001", "smallware"))).toBe(false);
  });
});

describe("codes", () => {
  it("numbers a new code above the highest already used", () => {
    expect(nextCode("raw", ["RAW-0001", "RAW-0007", "MNU-0002"])).toBe("RAW-0008");
  });

  it("does not refill a gap left by a discontinued item", () => {
    // 0002 is gone, but its number is spent for good.
    expect(nextCode("raw", ["RAW-0001", "RAW-0003"])).toBe("RAW-0004");
  });

  it("starts a type at one", () => {
    expect(nextCode("menu", [])).toBe("MNU-0001");
  });

  it("normalises and validates typed codes", () => {
    expect(normaliseCode(" raw 0001 ")).toBe("RAW-0001");
    expect(isValidCode("raw-0001")).toBe(true);
    expect(isValidCode("A")).toBe(false);
    expect(isValidCode("-BAD")).toBe(false);
  });
});

describe("filtering", () => {
  const items = [
    makeItem("RAW-0001", "raw", { internalName: "Chicken breast", category: "Protein" }),
    makeItem("MNU-0001", "menu", {
      internalName: "Hot sandwich",
      aliases: ["JP's Chicken Sandwich"],
      category: "Sandwiches",
      allergens: ["Wheat"],
      status: "discontinued",
    }),
  ];
  const noGaps = () => 0;

  it("matches on an alias, which is what aliases are for", () => {
    const found = filterItems(items, { ...EMPTY_FILTERS, query: "jp's chicken" }, noGaps);
    expect(found.map((item) => item.code)).toEqual(["MNU-0001"]);
  });

  it("matches on code and name too", () => {
    expect(filterItems(items, { ...EMPTY_FILTERS, query: "raw-0001" }, noGaps)).toHaveLength(1);
    expect(filterItems(items, { ...EMPTY_FILTERS, query: "breast" }, noGaps)).toHaveLength(1);
  });

  it("filters by type, status and allergen", () => {
    expect(filterItems(items, { ...EMPTY_FILTERS, type: "menu" }, noGaps)).toHaveLength(1);
    expect(filterItems(items, { ...EMPTY_FILTERS, status: "active" }, noGaps)).toHaveLength(1);
    expect(filterItems(items, { ...EMPTY_FILTERS, allergen: "Wheat" }, noGaps)).toHaveLength(1);
  });

  it("can show only records with something missing", () => {
    const gapsFor = (item: Item) => (item.type === "raw" ? 1 : 0);
    const found = filterItems(items, { ...EMPTY_FILTERS, incompleteOnly: true }, gapsFor);
    expect(found.map((item) => item.code)).toEqual(["RAW-0001"]);
  });
});
