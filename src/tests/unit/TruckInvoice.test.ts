import { describe, expect, it } from "vitest";

import {
  categoryFromClass,
  detectImportKind,
  fromUsDate,
  parseCsv,
  parseInvoiceExport,
  unitFromCode,
} from "@/lib/truck";

/**
 * These fixtures are lifted verbatim from a real PFG CustomerFirst invoice
 * export, inch marks and all. Every awkward thing they contain is something
 * that file actually did.
 */
const HEADER =
  "Customer OpCo,Customer #,Customer Name,Address,City,State,Zip Code,Invoice Date,Invoice Number," +
  "Invoice Order Number,Invoice Type,PO Number,Route Number,Route Stop Number,Invoice Subtotal," +
  "Invoice Discount,Invoice Charges Fees,Invoice Total Tax,Invoice Total,Total Qty Ordered," +
  "Total Qty Shipped,Vendor #,Manufacturer Name,Manufacturer Product #,Category/Class,GTIN," +
  "Product #,Custom Product Number,Product Description,Custom Product Description,Brand,Pack Size," +
  "UOM,Printed Sequence,Net Price,Qty Ordered,Qty Shipped,Weight,Unit Price,Ext. Price";

/** Everything up to the per-line columns, which repeats on every row. */
const head = (date: string, invoice: string, subtotal: string, total: string) =>
  `Performance Foodservice Nashville,56853046,JP'S HOT CHICKEN TRENTON,2670 TRENTON RD,CLARKSVILLE,TN,37040,` +
  `${date},${invoice},6086421,Invoice,,5C40,13,${subtotal},0.00,8.00,330.09,${total},99,99`;

const SODA =
  `${head("8/14/2026", "6883267", "4757.76", "5095.85")},13225,COCA COLA NORTH AMERICA,95600100,BEVERAGE,` +
  `00049000980776,2204,,SODA SYRUP LEMON LIME BNB,,SPRITE,1/5 GA,CS,1,125.16,1,1,,125.16,125.16`;

// A bare inch mark in an unquoted field — the thing that breaks strict parsers.
const BISCUIT =
  `${head("8/14/2026", "6883267", "4757.76", "5095.85")},78877,GENERAL MILLS DRY & FRZN,106249000,FROZEN FOOD PROCESS,` +
  `10094562062498,6249,,BISCUIT DGH EASY SPLIT 3.25",,PILLSBRY,168/3.17OZ,CS,2,69.03,1,1,,69.03,69.03`;

const TENDERS =
  `${head("8/14/2026", "6883267", "4757.76", "5095.85")},11761,MOUNTAIRE FARMS INC,25249,POULTRY,` +
  `00806795004229,158754,,CHICKEN TNDR JUMBO CLPPD CVP,,WEST CRK,4/10 LB,CS,8,47.85,5,5,,47.85,239.25`;

// Catch weight: the unit price is per pound, and only Ext. Price is per case.
const CHEESE =
  `${head("8/7/2026", "6877296", "6944.40", "7434.15")},7700,MULLINS CHEESE INC,10837,DAIRY PROD & SUBS,` +
  `90745080000207,930624,,CHEESE CHED WHI MILD BLOCK,,MULLINS,1/40 LB,CS,11,2.0699,1,1,43.88/lb,2.0699,90.83`;

const invoice = (...rows: string[]) => [HEADER, ...rows].join("\n");

describe("recognising the file", () => {
  it("knows an invoice export from an order guide", () => {
    expect(detectImportKind(invoice(SODA))).toBe("invoice");
    expect(detectImportKind("Item #,Description,Price\n123,Buns,2.00")).toBe("guide");
    expect(detectImportKind("")).toBe("unknown");
  });
});

describe("PFG's own vocabulary", () => {
  it("puts warehouse classes into kitchen words", () => {
    expect(categoryFromClass("POULTRY")).toBe("Chicken");
    expect(categoryFromClass("GROCERY DRY")).toBe("Dry Goods");
    expect(categoryFromClass("DISPOSABLES")).toBe("Paper & Packaging");
    expect(categoryFromClass("PRODUCE PRE-CUT")).toBe("Produce");
  });

  it("title-cases a class it has never seen rather than dropping it", () => {
    expect(categoryFromClass("SOMETHING BRAND NEW")).toBe("Something Brand New");
    expect(categoryFromClass("")).toBe("Other");
  });

  it("spells out unit codes", () => {
    expect(unitFromCode("CS")).toBe("case");
    expect(unitFromCode("EA")).toBe("each");
    expect(unitFromCode("")).toBe("case");
  });

  it("reads American dates, and leaves ISO ones alone", () => {
    expect(fromUsDate("8/14/2026")).toBe("2026-08-14");
    expect(fromUsDate("12/1/2026")).toBe("2026-12-01");
    expect(fromUsDate("2026-08-14")).toBe("2026-08-14");
    expect(fromUsDate("not a date")).toBeNull();
  });
});

describe("bare inch marks", () => {
  it("keeps a row intact when a description contains one", () => {
    const rows = parseCsv(invoice(BISCUIT));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveLength(40);
    expect(rows[1][28]).toBe('BISCUIT DGH EASY SPLIT 3.25"');
  });

  it("does not pair two of them off and swallow the rows between", () => {
    // The bug this guards against merged 116 real rows down to 81.
    const rows = parseCsv(invoice(BISCUIT, SODA, TENDERS, CHEESE));
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.length === 40)).toBe(true);
  });

  it("still honours quotes that do wrap a field", () => {
    expect(parseCsv('a,"b,c",d')).toEqual([["a", "b,c", "d"]]);
    expect(parseCsv('"say ""hi""",x')).toEqual([['say "hi"', "x"]]);
  });
});

describe("reading an invoice export", () => {
  it("lifts the invoice's own details off the repeated columns", () => {
    const { invoices } = parseInvoiceExport(invoice(SODA, BISCUIT, TENDERS));
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({
      invoiceNumber: "6883267",
      orderNumber: "6086421",
      invoiceDate: "2026-08-14",
      supplier: "Performance Foodservice Nashville",
      customerName: "JP'S HOT CHICKEN TRENTON",
      subtotal: 4757.76,
      fees: 8,
      tax: 330.09,
      total: 5095.85,
    });
    expect(invoices[0].lines).toHaveLength(3);
  });

  it("splits the rows back into one order per invoice, newest first", () => {
    const { invoices } = parseInvoiceExport(invoice(CHEESE, SODA, TENDERS));
    expect(invoices.map((one) => one.invoiceDate)).toEqual(["2026-08-14", "2026-08-07"]);
    expect(invoices.map((one) => one.lines.length)).toEqual([2, 1]);
  });

  it("turns a line into a set item", () => {
    const { invoices } = parseInvoiceExport(invoice(TENDERS));
    expect(invoices[0].lines[0]).toMatchObject({
      quantity: 5,
      quantityOrdered: 5,
      unitPrice: 47.85,
      extendedPrice: 239.25,
      item: {
        supplierItemCode: "158754",
        name: "CHICKEN TNDR JUMBO CLPPD CVP",
        category: "Chicken",
        unit: "case",
        packSize: "4/10 LB",
        brand: "WEST CRK",
        unitPrice: 47.85,
        supplier: "Performance Foodservice Nashville",
      },
    });
  });

  it("prices a catch-weight case at what it cost, not at its price per pound", () => {
    const { invoices } = parseInvoiceExport(invoice(CHEESE));
    const [line] = invoices[0].lines;
    // The file says 2.0699 — that is per pound, against 43.88 lb of cheese.
    expect(line.weight).toBe("43.88/lb");
    expect(line.unitPrice).toBe(90.83);
    expect(line.item.unitPrice).toBe(90.83);
  });

  it("makes quantity times price add back up to the invoice subtotal", () => {
    const { invoices } = parseInvoiceExport(invoice(SODA, BISCUIT, TENDERS));
    const modelled = invoices[0].lines.reduce(
      (sum, line) => sum + (line.unitPrice ?? 0) * line.quantity,
      0,
    );
    // 125.16 + 69.03 + 239.25
    expect(modelled).toBeCloseTo(433.44, 2);
  });

  it("does not mistake the invoice-wide quantity for a line's", () => {
    // Every row repeats "Total Qty Shipped" of 99; the tenders line is 5.
    const { invoices } = parseInvoiceExport(invoice(TENDERS));
    expect(invoices[0].lines[0].quantity).toBe(5);
  });

  it("skips rows with no product on them", () => {
    const trailing = `${head("8/14/2026", "6883267", "4757.76", "5095.85")},,,,,,,,,,,,,,,,,,`;
    const { invoices, skipped } = parseInvoiceExport(invoice(SODA, trailing));
    expect(invoices[0].lines).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it("finds nothing in a file with only a header", () => {
    expect(parseInvoiceExport(HEADER).invoices).toEqual([]);
  });
});
