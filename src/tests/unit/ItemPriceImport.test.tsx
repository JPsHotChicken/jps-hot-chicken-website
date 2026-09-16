import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { PriceImport } from "@/components/items/PriceImport";
import type { Item } from "@/lib/items";

/**
 * Prices off an invoice, as the owner works through them.
 *
 * The matching itself is tested against `item-prices.ts`. What matters here is
 * everything that guards the writing: that a guess is never applied on its own,
 * that a product nobody has matched is left alone, and that what the button
 * sends is exactly what the screen said it would.
 */

const actions = vi.hoisted(() => ({
  importPricesAction: vi.fn(async () => ({ updated: 2, unchanged: 0, linked: 2, failed: [] })),
}));
vi.mock("@/app/admin/items/actions", () => actions);

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

/* ----------------------------------------------------------------- fixtures */

const HEADER =
  "Customer OpCo,Customer #,Customer Name,Address,City,State,Zip Code,Invoice Date,Invoice Number," +
  "Invoice Order Number,Invoice Type,PO Number,Route Number,Route Stop Number,Invoice Subtotal," +
  "Invoice Discount,Invoice Charges Fees,Invoice Total Tax,Invoice Total,Total Qty Ordered," +
  "Total Qty Shipped,Vendor #,Manufacturer Name,Manufacturer Product #,Category/Class,GTIN," +
  "Product #,Custom Product Number,Product Description,Custom Product Description,Brand,Pack Size," +
  "UOM,Printed Sequence,Net Price,Qty Ordered,Qty Shipped,Weight,Unit Price,Ext. Price";

const row = (productNumber: string, description: string, packSize: string, price: string) =>
  `Performance Foodservice Nashville,56853046,JP'S HOT CHICKEN TRENTON,2670 TRENTON RD,CLARKSVILLE,TN,37040,` +
  `9/14/2026,6908761,6116899,Invoice,,1L57,12,2755.59,0.00,8.50,189.20,2953.29,57,57,10420,A VENDOR,X1,` +
  `GROCERY DRY,,${productNumber},,${description},,WEST CRK,${packSize},CS,1,${price},1,1,,${price},${price}`;

const INVOICE = [
  HEADER,
  row("158754", "CHICKEN TNDR JUMBO CLPPD CVP", "4/10 LB", "44.25"),
  row("61296", "CABBAGE GRN BOX", "1/50 LB", "33.09"),
  row("1046107", "PICKLE DILL SPEAR 375-425 CT", "1/5 GA", "44.29"),
  row("998661", "APTZ POPPER JALAPENO STFD CHED", "4/3 LB", "72.73"),
].join("\n");

function makeItem(id: string, code: string, internalName: string, over: Partial<Item> = {}): Item {
  return {
    id,
    code,
    type: "raw",
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

const ITEMS = [
  makeItem("tender-id", "RAW-0001", "Chicken tenderloin", {
    purchaseCost: 41.1,
    purchaseUnit: "case",
    packSize: "4 / 10 lb",
    stockPerPurchaseUnit: 40,
  }),
  makeItem("cabbage-id", "RAW-0025", "Green cabbage"),
  makeItem("chips-id", "RAW-0005", "Dill pickle chips"),
  makeItem("oil-id", "RAW-0006", "Frying oil"),
];

/** Render the panel and open it — it starts collapsed on the catalogue page. */
function open(links: { itemId: string; partNumber: string; supplierName: string }[] = []) {
  const view = render(<PriceImport items={ITEMS} links={links} />);
  fireEvent.click(screen.getByRole("button", { name: /Prices from an invoice/ }));
  return view;
}

/** Hand the file input a CSV, the way choosing a file does. */
async function upload(text = INVOICE) {
  const file = new File([text], "CustomerFirstInvoiceExport.csv", { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Invoice export"), { target: { files: [file] } });
  await waitFor(() => expect(screen.queryByLabelText("Invoice export")).not.toBeInTheDocument());
}

/** The review row for one product, by the description the invoice printed. */
const rowFor = (description: string) =>
  screen.getByText(description).closest("li") as HTMLElement;

beforeEach(() => {
  actions.importPricesAction.mockClear();
  router.refresh.mockClear();
});

/* -------------------------------------------------------------------- tests */

describe("reading the file", () => {
  it("turns a file down that isn't an invoice export", async () => {
    open();
    const file = new File(["Item,Price\nFlour,11.89"], "guide.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText("Invoice export"), { target: { files: [file] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/doesn't look like an invoice export/);
  });

  it("says what it found", async () => {
    open();
    await upload();

    expect(screen.getByText(/4 products across 1 invoice/)).toBeInTheDocument();
  });
});

describe("what it proposes", () => {
  it("fills in the matches it is sure of, and prices them up", async () => {
    open();
    await upload();

    const tenders = rowFor("CHICKEN TNDR JUMBO CLPPD CVP");
    expect(within(tenders).getByRole("combobox")).toHaveValue("tender-id");
    expect(within(tenders).getByText("$44.25")).toBeInTheDocument();
    // $41.10 to $44.25 is a rise of 7.7%, which is the number worth seeing.
    expect(tenders).toHaveTextContent("+7.7%");
  });

  it("counts only the items whose record would change", async () => {
    open();
    await upload();

    // Tenderloin's price moved; the cabbage record is empty and gets filled in.
    expect(screen.getByRole("button", { name: "Update 2 items" })).toBeEnabled();
  });

  it("leaves a guess unapplied until it is accepted", async () => {
    open();
    await upload();

    const spears = rowFor("PICKLE DILL SPEAR 375-425 CT");
    expect(within(spears).getByRole("combobox")).toHaveValue("");

    fireEvent.click(within(spears).getByRole("button", { name: /Dill pickle chips/ }));

    // Accepting it moves the row up into the list of items being updated.
    const decided = rowFor("PICKLE DILL SPEAR 375-425 CT");
    expect(within(decided).getByRole("combobox")).toHaveValue("chips-id");
    expect(screen.getByRole("button", { name: "Update 3 items" })).toBeEnabled();
  });

  it("matches nothing to a product the catalogue has no answer for", async () => {
    open();
    await upload();

    const poppers = rowFor("APTZ POPPER JALAPENO STFD CHED");
    expect(within(poppers).getByRole("combobox")).toHaveValue("");
    expect(within(poppers).queryByRole("button")).not.toBeInTheDocument();
  });

  it("only offers items a purchase price belongs on", async () => {
    const mixed = [...ITEMS, makeItem("dredge-id", "PRP-0001", "Nashville dredge", { type: "prepped" })];
    render(<PriceImport items={mixed} links={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Prices from an invoice/ }));
    await upload();

    const options = within(rowFor("CABBAGE GRN BOX")).getByRole("combobox");
    // A prepped batch costs what its parts cost; a case price on one means
    // nothing, so it is not a thing a row can be pointed at.
    expect(within(options).queryByText(/Nashville dredge/)).not.toBeInTheDocument();
    expect(within(options).getByText(/Frying oil/)).toBeInTheDocument();
  });

  it("takes a product number already on file over the names", async () => {
    open([
      { itemId: "oil-id", partNumber: "158754", supplierName: "Performance Foodservice Nashville" },
    ]);
    await upload();

    const tenders = rowFor("CHICKEN TNDR JUMBO CLPPD CVP");
    expect(within(tenders).getByRole("combobox")).toHaveValue("oil-id");
  });
});

describe("writing it", () => {
  it("sends the rows the owner settled, and nothing else", async () => {
    open();
    await upload();
    fireEvent.click(screen.getByRole("button", { name: "Update 2 items" }));

    await waitFor(() => expect(actions.importPricesAction).toHaveBeenCalledOnce());
    const [rows, supplier] = actions.importPricesAction.mock.calls[0] as unknown as [
      { itemId: string; product: { partNumber: string; cost: number } }[],
      string,
    ];

    expect(supplier).toBe("Performance Foodservice Nashville");
    expect(rows.map((sent) => sent.itemId).sort()).toEqual(["cabbage-id", "tender-id"]);
    expect(rows.find((sent) => sent.itemId === "tender-id")?.product).toMatchObject({
      partNumber: "158754",
      cost: 44.25,
      packSize: "4/10 LB",
    });
  });

  it("sends a matched item whose price held, so its product number is written", async () => {
    // The record already says everything this invoice does.
    const settled = [
      makeItem("cabbage-id", "RAW-0025", "Green cabbage", {
        purchaseCost: 33.09,
        purchaseUnit: "case",
        packSize: "1 / 50 lb",
        stockPerPurchaseUnit: 50,
      }),
    ];
    render(<PriceImport items={settled} links={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Prices from an invoice/ }));
    await upload([HEADER, row("61296", "CABBAGE GRN BOX", "1/50 LB", "33.09")].join("\n"));

    fireEvent.click(screen.getByRole("button", { name: "Save 1 match" }));

    await waitFor(() => expect(actions.importPricesAction).toHaveBeenCalledOnce());
    const [rows] = actions.importPricesAction.mock.calls[0] as unknown as [{ itemId: string }[]];
    expect(rows).toHaveLength(1);
  });

  it("says what it did, and refreshes the list behind it", async () => {
    open();
    await upload();
    fireEvent.click(screen.getByRole("button", { name: "Update 2 items" }));

    expect(await screen.findByRole("status")).toHaveTextContent("2 items updated");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("keeps the file on screen when the save fails", async () => {
    actions.importPricesAction.mockRejectedValueOnce(new Error("The database said no."));
    open();
    await upload();
    fireEvent.click(screen.getByRole("button", { name: "Update 2 items" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The database said no.");
    expect(screen.getByRole("button", { name: "Update 2 items" })).toBeInTheDocument();
  });
});
