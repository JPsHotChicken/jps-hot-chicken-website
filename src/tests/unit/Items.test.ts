import { describe, it, expect } from "vitest";

import { GenerationFormatError } from "@/lib/model-reply";

import {
  ALLERGEN_NONE,
  NotAProductSheetError,
  buildGraph,
  canBeComponent,
  canBeIngredient,
  parseItemSheet,
  costAll,
  costLadder,
  readPackSize,
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

describe("cost at every level", () => {
  /** Each rung as "unit count cost", which is how the table reads. */
  function rungs(item: Item, cost = costOf(item.id, buildGraph([item], new Map()))) {
    return costLadder(item, cost).levels.map((level) => ({
      unit: level.unit,
      count: Number(level.count.toFixed(4)),
      cost: level.cost === null ? null : Number(level.cost.toFixed(4)),
    }));
  }

  it("breaks a case of sauce into jugs and ounces", () => {
    // RAW-0063, off a real invoice: 4 one-gallon jugs for $59.16.
    const sauce = makeItem("RAW-0063", "raw", {
      purchaseUnit: "case",
      packSize: "4 / 1 ga",
      purchaseCost: 59.16,
      stockUnit: "gal",
      stockPerPurchaseUnit: 4,
      portionUnit: "serving",
      portionsPerStockUnit: 128,
    });

    expect(rungs(sauce)).toEqual([
      { unit: "case", count: 1, cost: 59.16 },
      // The jug and the gallon are the same thing, so they are one line.
      { unit: "gal", count: 4, cost: 14.79 },
      { unit: "fl oz", count: 512, cost: 0.1155 },
    ]);
    expect(costLadder(sauce, costOf(sauce.id, buildGraph([sauce], new Map()))).levels[2].alsoCalled)
      .toEqual(["serving"]);
  });

  it("reads a bare oz on a liquid as fluid ounces", () => {
    const sauce = makeItem("RAW-0073", "raw", {
      purchaseUnit: "case",
      packSize: "4 / 64 oz",
      purchaseCost: 49.61,
      stockUnit: "fl oz",
      stockPerPurchaseUnit: 256,
    });

    const ladder = costLadder(sauce, costOf(sauce.id, buildGraph([sauce], new Map())));
    expect(ladder.mismatch).toBeNull();
    expect(ladder.levels.map((level) => [level.unit, level.size])).toEqual([
      ["case", "4 / 64 oz"],
      ["pack", "64 fl oz"],
      ["fl oz", ""],
    ]);
  });

  it("prices a packet and the ounce inside it", () => {
    // RAW-0089: 1000 packets of 9 g for $28.31.
    const ketchup = makeItem("RAW-0089", "raw", {
      purchaseUnit: "case",
      packSize: "1000 / 9 gm",
      purchaseCost: 28.31,
      stockUnit: "each",
      stockPerPurchaseUnit: 1000,
      portionUnit: "packet",
      portionsPerStockUnit: 1,
    });

    expect(rungs(ketchup)).toEqual([
      { unit: "case", count: 1, cost: 28.31 },
      // An ounce is bigger than a 9 g packet, so it comes first.
      { unit: "oz", count: 317.4657, cost: 0.0892 },
      { unit: "packet", count: 1000, cost: 0.0283 },
      { unit: "g", count: 9000, cost: 0.0031 },
    ]);
    expect(costLadder(ketchup, costOf(ketchup.id, buildGraph([ketchup], new Map()))).levels[2].size)
      .toBe("9 g");
  });

  it("gives packaging a case, a sleeve and a piece — never an ounce", () => {
    const clamshell = makeItem("PKG-0003", "packaging", {
      purchaseUnit: "case",
      packSize: "2 / 100 ct",
      purchaseCost: 50,
      stockUnit: "each",
      stockPerPurchaseUnit: 200,
    });

    expect(rungs(clamshell)).toEqual([
      { unit: "case", count: 1, cost: 50 },
      { unit: "pack", count: 2, cost: 25 },
      { unit: "each", count: 200, cost: 0.25 },
    ]);
  });

  it("goes by the stock conversion and says so when the pack size disagrees", () => {
    // PKG-0004 as it stands: a pack size copied off honey cups onto a sleeve of 1000 cups.
    const cup = makeItem("PKG-0004", "packaging", {
      purchaseUnit: "case",
      packSize: "200 / .5 oz",
      purchaseCost: 42.95,
      stockUnit: "each",
      stockPerPurchaseUnit: 1000,
    });

    const ladder = costLadder(cup, costOf(cup.id, buildGraph([cup], new Map())));
    expect(ladder.mismatch).toMatch(/200 \/ \.5 oz/);
    expect(rungs(cup)).toEqual([
      { unit: "case", count: 1, cost: 42.95 },
      { unit: "each", count: 1000, cost: 0.043 },
    ]);
  });

  it("forgives a stock conversion rounded to two places", () => {
    // Six 55 oz cans is 20.625 lb; the record says 20.63.
    const beans = makeItem("RAW-0062", "raw", {
      purchaseUnit: "case",
      packSize: "6 / 55 oz",
      purchaseCost: 30,
      stockUnit: "lb",
      stockPerPurchaseUnit: 20.63,
    });
    const ladder = costLadder(beans, costOf(beans.id, buildGraph([beans], new Map())));
    expect(ladder.mismatch).toBeNull();
    expect(ladder.levels.map((level) => level.unit)).toEqual(["case", "pack", "lb", "oz"]);
  });

  it("adds a column after yield that agrees with the headline cost", () => {
    const chicken = makeItem("RAW-0001", "raw", {
      purchaseUnit: "case",
      packSize: "1 / 40 lb",
      purchaseCost: 119.6,
      stockUnit: "lb",
      stockPerPurchaseUnit: 40,
      yieldFactor: 0.8,
    });
    const cost = costOf(chicken.id, buildGraph([chicken], new Map()));
    const [caseLevel, pound] = costLadder(chicken, cost).levels;

    // The case is what the invoice says; the loss is charged to the pound.
    expect(caseLevel.usableCost).toBeNull();
    expect(pound.cost).toBeCloseTo(2.99, 10);
    expect(pound.usableCost).toBeCloseTo(cost.perStockUnit!, 10);
  });

  it("starts an assembled item from one build", () => {
    const flour = makeItem("RAW-0002", "raw", { purchaseCost: 12, stockPerPurchaseUnit: 24 });
    const dredge = makeItem("PRP-0001", "prepped", {
      batchYieldQuantity: 4,
      portionUnit: "cup",
      portionsPerStockUnit: 3.6,
    });
    const graph = buildGraph(
      [flour, dredge],
      new Map([["PRP-0001", [makeComponent("RAW-0002", 8)]]]),
    );

    // $4.00 a build over 4 lb: $1.00 a pound, as the roll-up says.
    expect(rungs(dredge, costOf("PRP-0001", graph))).toEqual([
      { unit: "build", count: 1, cost: 4 },
      { unit: "lb", count: 4, cost: 1 },
      { unit: "cup", count: 14.4, cost: 0.2778 },
      { unit: "oz", count: 64, cost: 0.0625 },
    ]);
  });

  it("calls a pack by its portion name when the two are the same amount", () => {
    // RAW-0084: counted in pounds, but the thing in the case is a half-ounce cup.
    const honey = makeItem("RAW-0084", "raw", {
      purchaseUnit: "case",
      packSize: "200 / 0.5 oz",
      stockUnit: "lb",
      stockPerPurchaseUnit: 6.25,
      portionUnit: "cup",
      portionsPerStockUnit: 32,
    });
    const last = costLadder(honey, costOf(honey.id, buildGraph([honey], new Map()))).levels.at(-1)!;
    expect(last).toMatchObject({ unit: "cup", alsoCalled: [], size: "0.5 oz", count: 200 });
  });

  it("lays out the levels with no price, rather than pricing them at zero", () => {
    const honey = makeItem("RAW-0071", "raw", {
      purchaseUnit: "case",
      packSize: "200 / .5 oz",
      stockUnit: "each",
      stockPerPurchaseUnit: 200,
      portionUnit: "cup",
      portionsPerStockUnit: 1,
    });

    expect(rungs(honey)).toEqual([
      { unit: "case", count: 1, cost: null },
      { unit: "oz", count: 100, cost: null },
      { unit: "cup", count: 200, cost: null },
    ]);
  });

  it("reads a pack size apart", () => {
    expect(readPackSize("6 / 5 lb")).toEqual({ count: 6, size: 5, unit: "lb" });
    expect(readPackSize("200 / .5 oz")).toEqual({ count: 200, size: 0.5, unit: "oz" });
    expect(readPackSize("6/#10 CN")).toEqual({ count: 6, size: null, unit: "#10 cn" });
    expect(readPackSize("bag")).toBeNull();
    expect(readPackSize("4 / 0 lb")).toBeNull();
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

/* ------------------------------------------------------ reading a spec sheet */

describe("canBeIngredient", () => {
  it("offers what goes in a dish, and nothing a dish is wrapped in", () => {
    expect(canBeIngredient(makeItem("RAW-0001", "raw"))).toBe(true);
    expect(canBeIngredient(makeItem("PRP-0001", "prepped"))).toBe(true);
    expect(canBeIngredient(makeItem("PKG-0001", "packaging"))).toBe(false);
    expect(canBeIngredient(makeItem("CHM-0001", "chemical"))).toBe(false);
  });

  it("leaves out a discontinued item, which is in nothing now", () => {
    expect(canBeIngredient(makeItem("RAW-0009", "raw", { status: "discontinued" }))).toBe(false);
  });

  it("does not require the conversions a cost sheet needs", () => {
    const uncosted = makeItem("RAW-0010", "raw", { stockUnit: "" });
    expect(canBeComponent(uncosted)).toBe(false);
    expect(canBeIngredient(uncosted)).toBe(true);
  });
});

describe("parseItemSheet", () => {
  const CATEGORIES = ["Produce", "Frozen", "Dry goods"];
  const SHEET = {
    is_product: true,
    type: "raw",
    internal_name: "  Breaded dill pickle chips ",
    customer_name: "Fried pickles",
    aliases: ["PICKLE CHIP BRD DILL"],
    category: "frozen",
    subcategory: "Appetizers",
    purchase_unit: "case",
    pack_size: "6 / 5 lb",
    purchase_cost: "",
    stock_unit: "lb",
    stock_per_purchase_unit: "30",
    portion_unit: "chip",
    portions_per_stock_unit: "24",
    allergens: ["Wheat"],
    cross_contact: "Processed on shared equipment with shrimp and fish.",
    flavor_tags: ["tangy", "salty", "sour"],
    texture_tags: ["crunchy", "crispy"],
    intensity: 4,
    storage_zone: "frozen",
    storage_temp: "0°F or below",
    shelf_life_days: "365",
    date_label_rule: "Use within 3 days of thawing",
    notes: "Crinkle-cut dill pickle slices, battered and breaded.",
  };

  it("reads a well-formed reply, putting tags in the vocabulary's order", () => {
    const { fields, crossContact } = parseItemSheet(JSON.stringify(SHEET), CATEGORIES);

    expect(fields).toMatchObject({
      type: "raw",
      internalName: "Breaded dill pickle chips",
      customerName: "Fried pickles",
      aliases: ["PICKLE CHIP BRD DILL"],
      purchaseUnit: "case",
      packSize: "6 / 5 lb",
      purchaseCost: null,
      stockUnit: "lb",
      stockPerPurchaseUnit: 30,
      portionsPerStockUnit: 24,
      allergens: ["Wheat"],
      flavorTags: ["salty", "sour", "tangy"],
      textureTags: ["crispy", "crunchy"],
      intensity: 4,
      storageZone: "frozen",
      shelfLifeDays: 365,
    });
    expect(crossContact).toMatch(/shrimp and fish/);
  });

  it("snaps a category onto the spelling already in use", () => {
    expect(parseItemSheet(JSON.stringify(SHEET), CATEGORIES).fields.category).toBe("Frozen");
    // Nothing close enough to snap to is kept as read, for the owner to accept.
    expect(parseItemSheet(JSON.stringify(SHEET), ["Produce"]).fields.category).toBe("frozen");
  });

  it("holds every value to what the record can save", () => {
    const loose = {
      ...SHEET,
      type: "invented",
      flavor_tags: ["salty", "pickled"],
      allergens: ["Wheat", "Mustard"],
      intensity: 9,
      storage_zone: "cellar",
      stock_per_purchase_unit: "about thirty",
      shelf_life_days: "99999",
    };
    const { fields } = parseItemSheet(JSON.stringify(loose), CATEGORIES);

    expect(fields.type).toBe("raw");
    expect(fields.flavorTags).toEqual(["salty"]);
    expect(fields.allergens).toEqual(["Wheat"]);
    expect(fields.intensity).toBe(5);
    expect(fields.storageZone).toBe("none");
    // A number nobody can use is a blank box, never a zero.
    expect(fields.stockPerPurchaseUnit).toBeNull();
    expect(fields.shelfLifeDays).toBeNull();
  });

  it("keeps None only when it stands alone", () => {
    const clear = { ...SHEET, allergens: [ALLERGEN_NONE] };
    expect(parseItemSheet(JSON.stringify(clear), CATEGORIES).fields.allergens).toEqual([
      ALLERGEN_NONE,
    ]);

    const muddled = { ...SHEET, allergens: [ALLERGEN_NONE, "Soy"] };
    expect(parseItemSheet(JSON.stringify(muddled), CATEGORIES).fields.allergens).toEqual(["Soy"]);
  });

  it("refuses a document that isn't a product, and a reply with no name", () => {
    expect(() =>
      parseItemSheet(JSON.stringify({ ...SHEET, is_product: false }), CATEGORIES),
    ).toThrow(NotAProductSheetError);
    expect(() => parseItemSheet(JSON.stringify({ ...SHEET, internal_name: " " }), CATEGORIES)).toThrow(
      /internal_name/,
    );
    expect(() => parseItemSheet("not json", CATEGORIES)).toThrow(GenerationFormatError);
  });

  it("tolerates a markdown fence around the JSON", () => {
    const fenced = "```json\n" + JSON.stringify(SHEET) + "\n```";
    expect(parseItemSheet(fenced, CATEGORIES).fields.internalName).toBe("Breaded dill pickle chips");
  });
});
