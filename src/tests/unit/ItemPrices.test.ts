import { describe, expect, it } from "vitest";

import {
  changesFor,
  matchProducts,
  packContents,
  patchFor,
  priceChange,
  readPrices,
  stockPerPack,
  tidyPackSize,
  words,
} from "@/lib/item-prices";
import type { Item, ItemType } from "@/lib/items";

/**
 * The invoice rows here are lifted verbatim from a real PFG CustomerFirst
 * export — the same file the truck order page reads — and the item names are
 * the ones the catalogue actually holds. Every awkward pairing in these tests
 * ("CABBAGE GRN BOX" against "Green cabbage") is one the owner would hit on
 * their first import.
 */

const HEADER =
  "Customer OpCo,Customer #,Customer Name,Address,City,State,Zip Code,Invoice Date,Invoice Number," +
  "Invoice Order Number,Invoice Type,PO Number,Route Number,Route Stop Number,Invoice Subtotal," +
  "Invoice Discount,Invoice Charges Fees,Invoice Total Tax,Invoice Total,Total Qty Ordered," +
  "Total Qty Shipped,Vendor #,Manufacturer Name,Manufacturer Product #,Category/Class,GTIN," +
  "Product #,Custom Product Number,Product Description,Custom Product Description,Brand,Pack Size," +
  "UOM,Printed Sequence,Net Price,Qty Ordered,Qty Shipped,Weight,Unit Price,Ext. Price";

/** Everything up to the per-line columns, which repeats on every row. */
const head = (date = "9/14/2026", invoice = "6908761") =>
  `Performance Foodservice Nashville,56853046,JP'S HOT CHICKEN TRENTON,2670 TRENTON RD,CLARKSVILLE,TN,37040,` +
  `${date},${invoice},6116899,Invoice,,1L57,12,2755.59,0.00,8.50,189.20,2953.29,57,57`;

/** One product line, with only the columns these tests care about spelled out. */
const line = (
  productNumber: string,
  description: string,
  brand: string,
  packSize: string,
  netPrice: string,
  quantity: string,
  extended: string,
  { date, invoice, productClass = "GROCERY DRY" } = {} as {
    date?: string;
    invoice?: string;
    productClass?: string;
  },
) =>
  `${head(date, invoice)},10420,A VENDOR,X1,${productClass},,${productNumber},,${description},,${brand},` +
  `${packSize},CS,1,${netPrice},${quantity},${quantity},,${netPrice},${extended}`;

const CABBAGE = line("61296", "CABBAGE GRN BOX", "PACKER", "1/50 LB", "33.09", "1", "33.09");
const TENDERS = line("158754", "CHICKEN TNDR JUMBO CLPPD CVP", "WEST CRK", "4/10 LB", "44.25", "3", "132.75");
const FLOUR = line("81983", "FLOUR H&R AP ENRICHED BLCHD", "ROMA", "1/25 LB", "11.89", "1", "11.89");
const BUNS = line("436459", "BUN BRIOCHE STYLE SLCD 4 IN", "HRTG OVN", "96/2.8 OZ", "46.08", "2", "92.16");
const PICKLES = line("873671", "APTZ PICKLE CHIP DILL BRD", "WEST CRK", "4/2.5 LB", "45.77", "4", "183.08");
const SPEARS = line("1046107", "PICKLE DILL SPEAR 375-425 CT", "DELANCEY", "1/5 GA", "44.29", "1", "44.29");
const BREAST = line("158775", "CHICKEN BRST 7 OZ B/S DBL CVP", "WEST CRK", "2/10 LB", "82.73", "2", "165.46");

// Catch weight: the unit price is per pound and only Ext. Price is per case.
const CHEESE = line("930624", "CHEESE CHED WHI MILD BLOCK", "MULLINS", "1/40 LB", "2.0699", "1", "90.83");

const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");

/** The branch that bills this restaurant, as the export names it. */
const PFG = "Performance Foodservice Nashville";

/** A bare item, so each test only states the fields it cares about. */
function makeItem(id: string, internalName: string, over: Partial<Item> = {}): Item {
  return {
    id,
    code: id.toUpperCase(),
    type: "raw" as ItemType,
    internalName,
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

/** The item a product was matched to, by name, for readable assertions. */
const matchedName = (
  matches: ReturnType<typeof matchProducts>,
  description: string,
  items: Item[],
) => {
  const match = matches.find((entry) => entry.product.description === description);
  return items.find((item) => item.id === match?.itemId)?.internalName ?? null;
};

describe("reading prices off an invoice export", () => {
  it("takes the price, pack and product number off every line", () => {
    const { products, supplier, invoiceCount } = readPrices(csv(CABBAGE, TENDERS));

    expect(supplier).toBe("Performance Foodservice Nashville");
    expect(invoiceCount).toBe(1);
    expect(products).toHaveLength(2);

    const tenders = products.find((product) => product.partNumber === "158754");
    expect(tenders).toMatchObject({
      description: "CHICKEN TNDR JUMBO CLPPD CVP",
      brand: "WEST CRK",
      packSize: "4/10 LB",
      purchaseUnit: "case",
      cost: 44.25,
      invoiceNumber: "6908761",
      invoiceDate: "2026-09-14",
    });
  });

  it("prices a catch-weight case from its extended price, not its unit price", () => {
    const [cheese] = readPrices(csv(CHEESE)).products;
    // $2.0699 is per pound; the case came to $90.83.
    expect(cheese.cost).toBe(90.83);
  });

  it("keeps the newest price when a product is on several invoices", () => {
    const older = line("158754", "CHICKEN TNDR JUMBO CLPPD CVP", "WEST CRK", "4/10 LB", "41.10", "1", "41.10", {
      date: "8/14/2026",
      invoice: "6883267",
    });
    const { products, invoiceCount, dates } = readPrices(csv(older, TENDERS));

    expect(products).toHaveLength(1);
    expect(products[0].cost).toBe(44.25);
    expect(invoiceCount).toBe(2);
    expect(dates).toEqual(["2026-09-14", "2026-08-14"]);
  });

  it("passes over credits — a return is not what an item costs", () => {
    const credit =
      `Performance Foodservice Nashville,56853046,JP'S HOT CHICKEN TRENTON,2670 TRENTON RD,CLARKSVILLE,TN,37040,` +
      `8/24/2026,6891615,6097049,Credit,,CRED,0,-72.73,0.00,0.00,-4.91,-77.64,-1,-1,86599,MCCAIN,` +
      `11810266,FROZEN FOOD PROCESS,,998661,,APTZ POPPER JALAPENO STFD CHED,,ENTICE,4/3 LB,CS,21,` +
      `72.73,-1,-1,,72.73,-72.73`;
    const { products, credits } = readPrices(csv(CABBAGE, credit));

    expect(credits).toBe(1);
    expect(products.map((product) => product.partNumber)).toEqual(["61296"]);
  });

  it("reads nothing out of a file that isn't an invoice export", () => {
    expect(readPrices("Item,Price\nFlour,11.89").products).toEqual([]);
  });
});

describe("spelling out the distributor's shorthand", () => {
  it("opens abbreviations out into whole words", () => {
    expect(words("CHICKEN TNDR JUMBO CLPPD CVP")).toEqual([
      "chicken",
      "tender",
      "jumbo",
      "clipped",
    ]);
    expect(words("CHICKEN BRST 7 OZ B/S DBL CVP")).toEqual([
      "chicken",
      "breast",
      "boneless",
      "skinless",
      "double",
    ]);
  });

  it("drops pack codes, units and sizes, which describe no product", () => {
    expect(words("CONT FOAM 1C 9X6.5X3 BLK HNGD")).toEqual([
      "container",
      "foam",
      "black",
      "hinged",
    ]);
  });
});

describe("matching a product to an item", () => {
  const items = [
    makeItem("a", "Green cabbage"),
    makeItem("b", "Chicken tenderloin"),
    makeItem("c", "All-purpose flour"),
    makeItem("d", "Brioche bun", { stockUnit: "bun" }),
    makeItem("e", "Breaded dill pickle chips"),
    makeItem("f", "Boneless chicken breast"),
  ];

  const matches = matchProducts(
    readPrices(csv(CABBAGE, TENDERS, FLOUR, BUNS, PICKLES, BREAST)).products,
    items,
  );

  it("reads a name written back to front", () => {
    expect(matchedName(matches, "CABBAGE GRN BOX", items)).toBe("Green cabbage");
  });

  it("reads a name written in shorthand", () => {
    expect(matchedName(matches, "CHICKEN TNDR JUMBO CLPPD CVP", items)).toBe("Chicken tenderloin");
    expect(matchedName(matches, "FLOUR H&R AP ENRICHED BLCHD", items)).toBe("All-purpose flour");
    expect(matchedName(matches, "BUN BRIOCHE STYLE SLCD 4 IN", items)).toBe("Brioche bun");
    expect(matchedName(matches, "APTZ PICKLE CHIP DILL BRD", items)).toBe("Breaded dill pickle chips");
  });

  it("keeps breast off tenderloin", () => {
    expect(matchedName(matches, "CHICKEN BRST 7 OZ B/S DBL CVP", items)).toBe(
      "Boneless chicken breast",
    );
  });

  it("calls a full-name match certain and a partial one a guess", () => {
    const certain = matches.find((match) => match.product.partNumber === "61296");
    expect(certain?.match).toBe("name");

    // Two words of three: dill and pickle are there, chips is not.
    const [spear] = matchProducts(readPrices(csv(SPEARS)).products, [
      makeItem("e", "Dill pickle chips"),
    ]);
    expect(spear.match).toBe("close");
  });

  it("says nothing at all when only one word lines up", () => {
    // "BEAN BLK" against "Black pepper" — one word each way, and a price on the
    // wrong record is worse than no price at all.
    const beans = line("629869", "BEAN BLK", "CONTIGO", "6/#10 CN", "40.23", "1", "40.23");
    const [match] = matchProducts(readPrices(csv(beans)).products, [
      makeItem("p", "Black pepper"),
    ]);
    expect(match.match).toBe("none");
  });

  it("gives an item to the product with the better claim, not both", () => {
    const chips = [makeItem("e", "Dill pickle chips")];
    const both = matchProducts(readPrices(csv(PICKLES, SPEARS)).products, chips);

    expect(both.filter((match) => match.itemId !== null)).toHaveLength(1);
    expect(matchedName(both, "APTZ PICKLE CHIP DILL BRD", chips)).toBe("Dill pickle chips");
  });

  it("takes a product number already on file over any amount of guessing", () => {
    const wrong = [makeItem("z", "Something else entirely")];
    const [match] = matchProducts(
      readPrices(csv(TENDERS)).products,
      wrong,
      [{ itemId: "z", partNumber: "158754", supplierName: PFG }],
      PFG,
    );

    expect(match).toMatchObject({ itemId: "z", match: "linked" });
  });

  it("ignores a part number another supplier issued", () => {
    // Six digits are a handle inside one distributor's catalogue and nothing
    // outside it, so a collision must not price somebody else's case.
    const [match] = matchProducts(
      readPrices(csv(TENDERS)).products,
      [makeItem("z", "Something else entirely")],
      [{ itemId: "z", partNumber: "158754", supplierName: "Sysco Nashville" }],
      PFG,
    );

    expect(match).toMatchObject({ itemId: null, match: "none" });
  });

  it("ignores a link pointing at an item that is no longer there", () => {
    const [match] = matchProducts(
      readPrices(csv(TENDERS)).products,
      [],
      [{ itemId: "gone", partNumber: "158754", supplierName: PFG }],
      PFG,
    );
    expect(match.itemId).toBeNull();
  });

  it("leaves built and discontinued items out of it", () => {
    const built = [
      makeItem("p", "Chicken tenderloin", { type: "prepped" }),
      makeItem("q", "Chicken tenderloin", { status: "discontinued" }),
    ];
    const [match] = matchProducts(readPrices(csv(TENDERS)).products, built);
    expect(match.itemId).toBeNull();
  });

  it("matches on an alias when the name gives nothing away", () => {
    const items = [makeItem("s", "House seasoning", { aliases: ["Colonel Jims breading"] })];
    const breading = line("398480", "BREADING CHICKEN SEASND", "COL JIMS", "1/25 LB", "28.25", "3", "84.75");
    const [match] = matchProducts(readPrices(csv(breading)).products, items);

    expect(match.itemId).toBe("s");
  });

  it("matches nothing rather than something wrong", () => {
    const [match] = matchProducts(readPrices(csv(CABBAGE)).products, [makeItem("x", "Frying oil")]);
    expect(match).toMatchObject({ itemId: null, match: "none" });
  });
});

describe("reading a pack size", () => {
  it("multiplies the pack out", () => {
    expect(packContents("4/10 LB")).toEqual({ quantity: 40, unit: "lb" });
    expect(packContents("2/100 CT")).toEqual({ quantity: 200, unit: "ct" });
    expect(packContents("96/2.8 OZ")).toEqual({ quantity: 268.8, unit: "oz" });
    expect(packContents("1/5 GA")).toEqual({ quantity: 5, unit: "gal" });
    // A size with no leading zero, as the honey cups are printed.
    expect(packContents("200/.5 OZ")).toEqual({ quantity: 100, unit: "oz" });
  });

  it("counts a pack with no size as its count", () => {
    expect(packContents("6/#10 CN")).toEqual({ quantity: 6, unit: "#10 cn" });
  });

  it("fills the conversion in only when the units agree", () => {
    expect(stockPerPack("4/10 LB", "lb")).toBe(40);
    expect(stockPerPack("4/10 LB", "pounds")).toBe(40);
    // 96 buns or 268.8 ounces — not a question this is allowed to guess at.
    expect(stockPerPack("96/2.8 OZ", "bun")).toBeNull();
    expect(stockPerPack("4/10 LB", "")).toBeNull();
  });

  it("writes a pack size the way the catalogue does", () => {
    expect(tidyPackSize("4/10 LB")).toBe("4 / 10 lb");
    expect(tidyPackSize("96/2.8 OZ")).toBe("96 / 2.8 oz");
    expect(tidyPackSize("")).toBe("");
  });
});

describe("what an import would change", () => {
  const [tenders] = readPrices(csv(TENDERS)).products;

  it("fills an empty record in", () => {
    const item = makeItem("b", "Chicken tenderloin");
    expect(changesFor(tenders, item).map((change) => change.field)).toEqual([
      "purchaseCost",
      "purchaseUnit",
      "packSize",
      "stockPerPurchaseUnit",
    ]);
    expect(patchFor(tenders, item)).toEqual({
      purchaseCost: 44.25,
      purchaseUnit: "case",
      packSize: "4 / 10 lb",
      stockPerPurchaseUnit: 40,
    });
  });

  it("says nothing about a record the invoice agrees with", () => {
    const item = makeItem("b", "Chicken tenderloin", {
      purchaseCost: 44.25,
      purchaseUnit: "case",
      packSize: "4 / 10 lb",
      stockPerPurchaseUnit: 40,
    });
    expect(changesFor(tenders, item)).toEqual([]);
  });

  it("names only the field that moved", () => {
    const item = makeItem("b", "Chicken tenderloin", {
      purchaseCost: 41.1,
      purchaseUnit: "case",
      packSize: "4 / 10 LB",
      stockPerPurchaseUnit: 40,
    });
    expect(changesFor(tenders, item)).toEqual([
      { field: "purchaseCost", label: "Cost", from: 41.1, to: 44.25 },
    ]);
  });

  it("leaves the conversion alone when the pack can't be read in the stock unit", () => {
    const [buns] = readPrices(csv(BUNS)).products;
    const item = makeItem("d", "Brioche bun", { stockUnit: "bun", stockPerPurchaseUnit: 96 });
    expect(changesFor(buns, item).map((change) => change.field)).not.toContain(
      "stockPerPurchaseUnit",
    );
  });

  it("works out how far a price moved", () => {
    expect(priceChange(40, 44.25)).toBeCloseTo(0.10625);
    expect(priceChange(null, 44.25)).toBeNull();
    expect(priceChange(0, 44.25)).toBeNull();
  });
});
