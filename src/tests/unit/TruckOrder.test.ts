import { describe, expect, it } from "vitest";

import {
  canMoveItem,
  clampQuantity,
  compareItems,
  groupByCategory,
  moveCategory,
  moveItem,
  reorderedIds,
  hasEveryPrice,
  orderItemCount,
  orderTotal,
  orderUnitCount,
  parseCsv,
  parseOrderGuide,
  toOrderCsv,
  type TruckItem,
  type TruckOrderDetail,
  type TruckOrderLine,
} from "@/lib/truck";

function line(overrides: Partial<TruckOrderLine> = {}): TruckOrderLine {
  return {
    id: "l1",
    itemId: "i1",
    name: "Chicken tenders",
    category: "Chicken",
    unit: "case",
    packSize: "4/5 LB",
    supplierItemCode: "123456",
    unitPrice: 42.5,
    quantity: 2,
    sortOrder: 0,
    ...overrides,
  };
}

function item(overrides: Partial<TruckItem> = {}): TruckItem {
  return {
    id: "i1",
    name: "Chicken tenders",
    category: "Chicken",
    unit: "case",
    packSize: "",
    brand: "",
    supplier: "Performance Food Group",
    supplierItemCode: "",
    unitPrice: null,
    parQuantity: 0,
    sortOrder: 0,
    ...overrides,
  };
}

describe("order totals", () => {
  it("counts only what is actually being ordered", () => {
    const lines = [line({ quantity: 2 }), line({ id: "l2", quantity: 0 }), line({ id: "l3", quantity: 1 })];
    expect(orderItemCount(lines)).toBe(2);
    expect(orderUnitCount(lines)).toBe(3);
  });

  it("adds up the priced lines and ignores the rest", () => {
    const lines = [
      line({ quantity: 2, unitPrice: 10 }),
      line({ id: "l2", quantity: 3, unitPrice: null }),
    ];
    expect(orderTotal(lines)).toBe(20);
    expect(hasEveryPrice(lines)).toBe(false);
  });

  it("treats a missing price on something not being ordered as no obstacle", () => {
    const lines = [line({ quantity: 2, unitPrice: 10 }), line({ id: "l2", quantity: 0, unitPrice: null })];
    expect(hasEveryPrice(lines)).toBe(true);
  });

  it("keeps half cases, and refuses negatives and nonsense", () => {
    expect(clampQuantity(2.5)).toBe(2.5);
    expect(clampQuantity(-4)).toBe(0);
    expect(clampQuantity(Number.NaN)).toBe(0);
    expect(clampQuantity(5000)).toBe(999);
  });
});

/** The categories a list falls into, in the order the sheet would draw them. */
const sections = (items: TruckItem[]) =>
  groupByCategory([...items].sort(compareItems)).map((group) => group.category);

describe("sheet order", () => {
  it("lists known categories in walk-in order, with Other last", () => {
    const rows = [
      item({ id: "a", category: "Other" }),
      item({ id: "b", category: "Produce" }),
      item({ id: "c", category: "Chicken" }),
      item({ id: "d", category: "Zebra sauce" }),
    ];
    expect(sections(rows)).toEqual(["Chicken", "Produce", "Zebra sauce", "Other"]);
  });

  it("lets a saved arrangement override the built-in order", () => {
    const rows = [
      item({ id: "a", category: "Chicken", sortOrder: 2 }),
      item({ id: "b", category: "Cleaning", sortOrder: 0 }),
      item({ id: "c", category: "Produce", sortOrder: 1 }),
    ];
    expect(sections(rows)).toEqual(["Cleaning", "Produce", "Chicken"]);
  });

  it("keeps a section together even when its rows arrive scattered", () => {
    const rows = [
      item({ id: "a", name: "Alpha", category: "Chicken", sortOrder: 0 }),
      item({ id: "b", name: "Beta", category: "Produce", sortOrder: 1 }),
      item({ id: "c", name: "Gamma", category: "Chicken", sortOrder: 2 }),
    ];
    const groups = groupByCategory([...rows].sort(compareItems));
    expect(groups.map((group) => group.category)).toEqual(["Chicken", "Produce"]);
    expect(groups[0].rows.map((row) => row.name)).toEqual(["Alpha", "Gamma"]);
  });
});

describe("arranging", () => {
  /** Three chicken items and two produce, in a known order. */
  const list = () => [
    item({ id: "c1", name: "Tenders", category: "Chicken", sortOrder: 0 }),
    item({ id: "c2", name: "Breasts", category: "Chicken", sortOrder: 1 }),
    item({ id: "c3", name: "Wings", category: "Chicken", sortOrder: 2 }),
    item({ id: "p1", name: "Cabbage", category: "Produce", sortOrder: 3 }),
    item({ id: "p2", name: "Onions", category: "Produce", sortOrder: 4 }),
  ];

  const names = (items: TruckItem[]) => items.map((one) => one.name);

  it("moves an item up and down within its section", () => {
    expect(names(moveItem(list(), "c3", -1))).toEqual([
      "Tenders",
      "Wings",
      "Breasts",
      "Cabbage",
      "Onions",
    ]);
    expect(names(moveItem(list(), "c1", 1))).toEqual([
      "Breasts",
      "Tenders",
      "Wings",
      "Cabbage",
      "Onions",
    ]);
  });

  it("will not push an item out of its own section", () => {
    // Wings is last in Chicken; down would put it among the produce.
    expect(names(moveItem(list(), "c3", 1))).toEqual(names(list()));
    expect(names(moveItem(list(), "c1", -1))).toEqual(names(list()));
    expect(canMoveItem(list(), "c3", 1)).toBe(false);
    expect(canMoveItem(list(), "c3", -1)).toBe(true);
  });

  it("leaves the list alone when the item isn't on it", () => {
    expect(names(moveItem(list(), "nope", 1))).toEqual(names(list()));
    expect(canMoveItem(list(), "nope", 1)).toBe(false);
  });

  it("moves a whole section past its neighbour, rows and all", () => {
    expect(names(moveCategory(list(), "Produce", -1))).toEqual([
      "Cabbage",
      "Onions",
      "Tenders",
      "Breasts",
      "Wings",
    ]);
  });

  it("builds each move on the one before it", () => {
    // Both moves re-sort on sortOrder before doing anything, so a result that
    // still carried its old positions would quietly discard the earlier move.
    const twice = moveItem(moveItem(list(), "c3", -1), "c3", -1);
    expect(names(twice)).toEqual(["Wings", "Tenders", "Breasts", "Cabbage", "Onions"]);

    const mixed = moveItem(moveCategory(list(), "Produce", -1), "p2", -1);
    expect(names(mixed)).toEqual(["Onions", "Cabbage", "Tenders", "Breasts", "Wings"]);
  });

  it("hands back positions that match the order it returned", () => {
    const moved = moveItem(list(), "c3", -1);
    expect(moved.map((one) => one.sortOrder)).toEqual([0, 1, 2, 3, 4]);
  });

  it("will not move the first section up or the last one down", () => {
    expect(names(moveCategory(list(), "Chicken", -1))).toEqual(names(list()));
    expect(names(moveCategory(list(), "Produce", 1))).toEqual(names(list()));
  });

  it("arranges a never-arranged list off its alphabetical starting order", () => {
    // Everything sits at 0 on a freshly imported list, so the sheet reads
    // alphabetically within each section: Breasts, Tenders, Wings.
    const flat = list().map((one) => ({ ...one, sortOrder: 0 }));
    expect(names([...flat].sort(compareItems))).toEqual([
      "Breasts",
      "Tenders",
      "Wings",
      "Cabbage",
      "Onions",
    ]);

    // Moving Wings up therefore puts it above Tenders, not above Breasts.
    const moved = moveItem(flat, "c3", -1);
    expect(reorderedIds(moved)).toEqual(["c2", "c3", "c1", "p1", "p2"]);
  });
});

describe("CSV parsing", () => {
  it("handles quoted fields, embedded commas and doubled quotes", () => {
    expect(parseCsv('a,"b,c","say ""hi"""')).toEqual([["a", "b,c", 'say "hi"']]);
  });

  it("reads CRLF, a trailing newline, and Excel's byte order mark", () => {
    expect(parseCsv("﻿h1,h2\r\n1,2\r\n")).toEqual([
      ["h1", "h2"],
      ["1", "2"],
    ]);
  });

  it("drops blank rows rather than treating them as items", () => {
    expect(parseCsv("a,b\n\n,\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("order guide import", () => {
  const guide = [
    "Item #,Description,Pack Size,Brand,Case Price,Class",
    '123456,Chicken Tenders,4/5 LB,Sysco,"$1,234.50",Chicken',
    "789,Brioche Buns,8/12 CT,Local,18.99,Bread & Buns",
  ].join("\n");

  it("matches columns whatever the export calls them", () => {
    const { items, matched } = parseOrderGuide(guide);
    expect(matched).toEqual(["code", "name", "brand", "packSize", "price", "category"]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      supplierItemCode: "123456",
      name: "Chicken Tenders",
      packSize: "4/5 LB",
      brand: "Sysco",
      unitPrice: 1234.5,
      category: "Chicken",
    });
  });

  it("defaults what the file didn't carry, and says what it did", () => {
    const { items, matched } = parseOrderGuide(guide);
    expect(matched).not.toContain("unit");
    expect(matched).not.toContain("par");
    expect(items[1]).toMatchObject({ unit: "case", parQuantity: 0 });
  });

  it("prefers an exact header over one that merely contains the alias", () => {
    const { items } = parseOrderGuide(
      ["Long Description,Item Description", "wrong one,right one"].join("\n"),
    );
    expect(items[0].name).toBe("right one");
  });

  it("skips rows with nothing to name them by", () => {
    const { items, skipped } = parseOrderGuide(
      ["Item #,Description,Price", "111,Buns,2.00", "222,,3.00", "SUBTOTAL,,99.00"].join("\n"),
    );
    expect(items).toHaveLength(1);
    expect(skipped).toBe(2);
  });

  it("reads a price it can't make sense of as unknown, not as free", () => {
    const { items } = parseOrderGuide(["Description,Price", "Buns,call for pricing"].join("\n"));
    expect(items[0].unitPrice).toBeNull();
  });

  it("takes the supplier it is given", () => {
    const { items } = parseOrderGuide("Description\nBuns", "Restaurant Depot");
    expect(items[0].supplier).toBe("Restaurant Depot");
  });

  it("finds nothing in a file with only a header", () => {
    expect(parseOrderGuide("Item #,Description").items).toEqual([]);
  });
});

describe("order export", () => {
  const order: TruckOrderDetail = {
    id: "o1",
    orderDate: "2026-08-14",
    deliveryDate: "2026-08-16",
    status: "submitted",
    note: "",
    submittedAt: null,
    receivedAt: null,
    invoiceNumber: "",
    invoiceTotal: null,
    lines: [
      line({ id: "l1", name: "Chicken tenders", quantity: 2, unitPrice: 42.5 }),
      line({ id: "l2", name: 'Buns, "brioche"', quantity: 0, unitPrice: 18.99 }),
      line({ id: "l3", name: "Pickles", quantity: 1, unitPrice: null }),
    ],
  };

  it("writes a row per item on the truck, and nothing for the rest", () => {
    const rows = parseCsv(toOrderCsv(order));
    expect(rows[0][0]).toBe("Item code");
    expect(rows.map((row) => row[1])).toEqual(["Item", "Chicken tenders", "Pickles", "Total"]);
  });

  it("totals the units and the money", () => {
    const rows = parseCsv(toOrderCsv(order));
    const total = rows.at(-1)!;
    expect(total[4]).toBe("3");
    expect(total[6]).toBe("85.00");
  });

  it("leaves an unknown price blank rather than calling it zero", () => {
    const pickles = parseCsv(toOrderCsv(order)).find((row) => row[1] === "Pickles")!;
    expect(pickles[5]).toBe("");
    expect(pickles[6]).toBe("");
  });

  it("quotes a name that would otherwise break the row", () => {
    const csv = toOrderCsv({ ...order, lines: [line({ name: 'Buns, "brioche"', quantity: 1 })] });
    expect(csv).toContain('"Buns, ""brioche"""');
    expect(parseCsv(csv)[1][1]).toBe('Buns, "brioche"');
  });
});
