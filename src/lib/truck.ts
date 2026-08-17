import { matchColumns, normaliseHeader, parseCsv, toCsv } from "@/lib/csv";
import { formatShortDate, fromISODate, toISODate } from "@/lib/schedule";

/**
 * Everything the truck order page understands, with no database or React in it.
 *
 * The shapes here mirror what a distributor's order guide carries — an item
 * code, a pack size, a case price — because that is what has to line up when an
 * order is read back to a rep or matched against an invoice.
 */

/* -------------------------------------------------------------------- items */

export const DEFAULT_SUPPLIER = "Performance Food Group";

/** How one of something is counted when it is ordered. */
export const ORDER_UNITS = ["case", "bag", "box", "each", "lb", "tub", "jug", "roll"] as const;
export type OrderUnit = (typeof ORDER_UNITS)[number];

/**
 * Starting categories. Not an enum — the column is free text so a new section
 * can be typed in on the spot without a migration.
 */
export const DEFAULT_CATEGORIES = [
  "Chicken",
  "Produce",
  "Bread & Buns",
  "Dairy",
  "Fryer & Oil",
  "Sauces & Seasoning",
  "Drinks",
  "Paper & Packaging",
  "Cleaning",
  "Other",
] as const;

export const OTHER_CATEGORY = "Other";

/** One of the set items — a thing that can appear on any order. */
export type TruckItem = {
  id: string;
  name: string;
  category: string;
  unit: string;
  /** The distributor's pack description, e.g. "4/5 LB". */
  packSize: string;
  brand: string;
  supplier: string;
  /** PFG item number, blank for anything bought elsewhere. */
  supplierItemCode: string;
  /** Price for one `unit`, or null when it isn't known. */
  unitPrice: number | null;
  /** The usual order quantity, used by "Fill with pars". */
  parQuantity: number;
  sortOrder: number;
};

/** The fields an item can be created or edited with. */
export type TruckItemDraft = Omit<TruckItem, "id" | "sortOrder">;

/* ------------------------------------------------------------------- orders */

export const TRUCK_ORDER_STATUSES = ["draft", "submitted", "received"] as const;
export type TruckOrderStatus = (typeof TRUCK_ORDER_STATUSES)[number];

export const TRUCK_ORDER_STATUS_LABELS: Record<TruckOrderStatus, string> = {
  draft: "Building",
  submitted: "Placed",
  received: "Delivered",
};

/**
 * A line keeps its own copy of the item's details rather than only pointing at
 * one. Prices change and items get deleted; last March's order still has to
 * read the way it did when it was placed.
 */
export type TruckOrderLine = {
  id: string;
  /** Null once the item behind it has been deleted from the set list. */
  itemId: string | null;
  name: string;
  category: string;
  unit: string;
  packSize: string;
  supplierItemCode: string;
  unitPrice: number | null;
  quantity: number;
  sortOrder: number;
};

export type TruckOrder = {
  id: string;
  /** ISO date the order is placed. */
  orderDate: string;
  /** ISO date the truck is expected, or null while it isn't known. */
  deliveryDate: string | null;
  status: TruckOrderStatus;
  note: string;
  submittedAt: string | null;
  receivedAt: string | null;
  /** Set when the order came in from a distributor invoice; blank otherwise. */
  invoiceNumber: string;
  /**
   * What the invoice was actually charged at, tax and fees included. The lines
   * only ever add up to the subtotal, so this is kept rather than derived.
   */
  invoiceTotal: number | null;
};

/** An order together with everything on it. */
export type TruckOrderDetail = TruckOrder & { lines: TruckOrderLine[] };

/**
 * The parts of an order that can be edited. Every field is optional and `null`
 * is a real value, so "clear the delivery date" and "leave it alone" stay
 * distinguishable all the way down to the update statement.
 */
export type OrderPatch = {
  orderDate?: string;
  deliveryDate?: string | null;
  status?: TruckOrderStatus;
  note?: string;
};

/** A past order as the history list shows it — counts, not every line. */
export type TruckOrderSummary = TruckOrder & {
  itemCount: number;
  totalUnits: number;
  total: number;
};

/* ------------------------------------------------------------------- totals */

/**
 * The part of a line the totals need. Taking only this means the history list
 * can add up an order it only read two columns of.
 */
type Priced = Pick<TruckOrderLine, "quantity" | "unitPrice">;

/** What one line costs, or 0 while its price is unknown. */
export function lineTotal(line: Priced): number {
  return line.unitPrice === null ? 0 : line.unitPrice * line.quantity;
}

/**
 * The order's cost. Lines with no price contribute nothing, so this is an
 * estimate whenever any of them are missing one — `hasEveryPrice` says whether
 * the figure can be trusted as a total.
 */
export function orderTotal(lines: readonly Priced[]): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

/** True when every line being ordered has a price, so the total is complete. */
export function hasEveryPrice(lines: readonly Priced[]): boolean {
  return orderedLines(lines).every((line) => line.unitPrice !== null);
}

/** Only the lines actually being ordered — a quantity of 0 is not on the truck. */
export function orderedLines<T extends Priced>(lines: readonly T[]): T[] {
  return lines.filter((line) => line.quantity > 0);
}

/** How many different items are on the order. */
export function orderItemCount(lines: readonly Priced[]): number {
  return orderedLines(lines).length;
}

/** Total cases (or bags, or eaches) across the whole order. */
export function orderUnitCount(lines: readonly Priced[]): number {
  return orderedLines(lines).reduce((sum, line) => sum + line.quantity, 0);
}

/* ------------------------------------------------------------------ sorting */

/**
 * Quantities are typed in by hand, so keep them to something a truck can carry:
 * never negative, no more than a pallet's worth, and at most a half.
 */
export const MAX_QUANTITY = 999;

export function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_QUANTITY, Math.max(0, Math.round(value * 100) / 100));
}

/**
 * Sheet order.
 *
 * `sortOrder` is one sequence across the whole list, not a position within a
 * category, so arranging the sheet is just reordering a flat list — see
 * `reorderedIds`. Until it has been arranged every item sits at 0 and the
 * fallbacks below decide, which is what gives a freshly imported list a sensible
 * order without anyone having to set one.
 */
export function compareItems(a: TruckItem, b: TruckItem): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  const byCategory = categoryRank(a.category) - categoryRank(b.category);
  if (byCategory !== 0) return byCategory;
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  return a.name.localeCompare(b.name);
}

/**
 * Where an un-arranged category sits. The built-in ones keep the order they are
 * listed in — the sheet should read the way the walk-in is laid out. Anything
 * else sorts after them, alphabetically, with "Other" last of all.
 */
function categoryRank(category: string): number {
  if (category === OTHER_CATEGORY) return Number.MAX_SAFE_INTEGER;
  const known = DEFAULT_CATEGORIES.indexOf(category as (typeof DEFAULT_CATEGORIES)[number]);
  return known === -1 ? DEFAULT_CATEGORIES.length : known;
}

/**
 * Group rows into the sections the sheet is drawn in.
 *
 * Rows are expected to arrive in sheet order already, and a category takes its
 * place from the first row that mentions it — so this preserves an arrangement
 * rather than imposing one of its own.
 */
export function groupByCategory<T extends { category: string }>(
  rows: readonly T[],
): { category: string; rows: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const existing = groups.get(row.category);
    if (existing) existing.push(row);
    else groups.set(row.category, [row]);
  }
  // A Map iterates in insertion order, which is first-seen order.
  return [...groups.entries()].map(([category, rows]) => ({ category, rows }));
}

/* ---------------------------------------------------------------- arranging */

/** Which way a row or a section is being moved. */
export type MoveDirection = -1 | 1;

/**
 * Stamp a list's positions onto it, so it describes its own order.
 *
 * Both move functions start by sorting on `sortOrder`, so returning a list
 * whose positions still said something else would mean the second of two moves
 * threw the first one away. Renumbering here is what makes them chainable.
 */
function renumbered(items: readonly TruckItem[]): TruckItem[] {
  return items.map((item, index) =>
    item.sortOrder === index ? item : { ...item, sortOrder: index },
  );
}

/**
 * The item list with one item moved a place up or down **within its category**.
 *
 * Kept inside the category on purpose: the sheet is read section by section, so
 * nudging something off the end of Produce and into Dairy is almost never what
 * was meant. Moving between sections is done by editing the item's category.
 */
export function moveItem(
  items: readonly TruckItem[],
  id: string,
  direction: MoveDirection,
): TruckItem[] {
  const ordered = [...items].sort(compareItems);
  const from = ordered.findIndex((item) => item.id === id);
  if (from === -1) return renumbered(ordered);

  // The neighbour to trade places with is the next one in the same section,
  // which is not always the next one in the list.
  const category = ordered[from].category;
  let to = from + direction;
  while (to >= 0 && to < ordered.length && ordered[to].category !== category) to += direction;
  if (to < 0 || to >= ordered.length) return renumbered(ordered);

  const moved = [...ordered];
  [moved[from], moved[to]] = [moved[to], moved[from]];
  return renumbered(moved);
}

/** The item list with one whole section moved past the section beside it. */
export function moveCategory(
  items: readonly TruckItem[],
  category: string,
  direction: MoveDirection,
): TruckItem[] {
  const groups = groupByCategory([...items].sort(compareItems));
  const from = groups.findIndex((group) => group.category === category);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= groups.length) {
    return renumbered(groups.flatMap((group) => group.rows));
  }

  const moved = [...groups];
  [moved[from], moved[to]] = [moved[to], moved[from]];
  return renumbered(moved.flatMap((group) => group.rows));
}

/**
 * The ids of an arranged list, in order — what gets saved.
 *
 * Positions are stored rather than the list itself, so an item added later
 * lands at the end instead of disturbing everything already placed.
 */
export function reorderedIds(items: readonly TruckItem[]): string[] {
  return items.map((item) => item.id);
}

/** True when an item is the first or last of its section, so it can't move. */
export function canMoveItem(
  items: readonly TruckItem[],
  id: string,
  direction: MoveDirection,
): boolean {
  const ordered = [...items].sort(compareItems);
  const from = ordered.findIndex((item) => item.id === id);
  if (from === -1) return false;
  const category = ordered[from].category;
  let to = from + direction;
  while (to >= 0 && to < ordered.length && ordered[to].category !== category) to += direction;
  return to >= 0 && to < ordered.length;
}

/* -------------------------------------------------------------------- dates */

/** "Aug 14, 2026" */
export function formatOrderDate(iso: string): string {
  const date = fromISODate(iso);
  return `${formatShortDate(date)}, ${date.getFullYear()}`;
}

/** Today, as the date input and a new order both want it. */
export function todayISO(): string {
  return toISODate(new Date());
}

/* ---------------------------------------------------------------------- CSV */

// Both live in `csv.ts` now that the tips page reads exports too. Re-exported
// because callers here have always reached for them through this module.
export { parseCsv, toCsv };

/* ----------------------------------------------------- order guide importing */

/**
 * Header names an order guide export might use for each field.
 *
 * Distributors all describe the same columns differently, and the same
 * distributor changes them between report types. Matching on a list of aliases
 * means a new export usually just works; when it doesn't, one more string here
 * is the whole fix.
 */
const COLUMN_ALIASES: Record<OrderGuideField, string[]> = {
  code: [
    "item",
    "item #",
    "item#",
    "item no",
    "item no.",
    "item number",
    "item code",
    "product",
    "product #",
    "product code",
    "product number",
    "sku",
    "material",
  ],
  name: [
    "description",
    "item description",
    "product description",
    "name",
    "item name",
    "product name",
    "long description",
  ],
  brand: ["brand", "manufacturer", "label", "mfr"],
  packSize: ["pack", "pack size", "packsize", "size", "pack/size", "pack size desc"],
  unit: ["unit", "uom", "order unit", "unit of measure", "sell by", "order by"],
  price: [
    "price",
    "case price",
    "unit price",
    "net price",
    "last price",
    "cost",
    "case cost",
    "unit cost",
  ],
  category: ["category", "class", "class description", "group", "product category", "department"],
  par: ["par", "par level", "par qty", "quantity", "qty", "order qty", "suggested qty"],
};

/**
 * The fields an order guide can carry. Which of them a given export actually
 * has matters after the import too: a file with no category column must not be
 * allowed to reset every item to "Other" on the way in.
 */
export const ORDER_GUIDE_FIELDS = [
  "code",
  "name",
  "brand",
  "packSize",
  "unit",
  "price",
  "category",
  "par",
] as const;
export type OrderGuideField = (typeof ORDER_GUIDE_FIELDS)[number];

/** Where each field was found in the header row, or -1 when it wasn't. */
type ImportedColumns = Record<OrderGuideField, number>;

const guideColumns = (headers: readonly string[]): ImportedColumns =>
  matchColumns(headers, COLUMN_ALIASES);

/** "$1,234.56" or "1234.56" to dollars and cents; anything else to null. */
function parseMoney(value: string | undefined): number | null {
  const parsed = parseNumber(value);
  return parsed === null ? null : round2(parsed);
}

export type OrderGuideImport = {
  items: TruckItemDraft[];
  /** Fields the file turned out to carry — the only ones an update may touch. */
  matched: OrderGuideField[];
  /** Rows that had no name to file them under, and so were passed over. */
  skipped: number;
};

/**
 * Read a distributor's order guide export into item drafts.
 *
 * PFG has no public API to pull this from — a customer's route to their own
 * catalogue is either an export from the ordering portal or an EDI feed set up
 * through their integration team. This takes the export, which is the part that
 * needs no paperwork. `truck-repo.ts` does the matching against existing items,
 * so re-importing next month updates prices instead of duplicating the guide.
 */
export function parseOrderGuide(text: string, supplier = DEFAULT_SUPPLIER): OrderGuideImport {
  const rows = parseCsv(text);
  if (rows.length < 2) return { items: [], matched: [], skipped: 0 };

  const [headers, ...body] = rows;
  const columns = guideColumns(headers);
  const at = (row: string[], index: number) => (index === -1 ? "" : (row[index] ?? "").trim());

  const items: TruckItemDraft[] = [];
  let skipped = 0;

  for (const row of body) {
    const name = at(row, columns.name);
    // Without a name there is nothing to put on a sheet, whatever else the row
    // carries. Subtotal and page-break rows land here too.
    if (!name) {
      skipped++;
      continue;
    }

    const par = Number(at(row, columns.par).replace(/[^0-9.]/g, ""));

    items.push({
      name,
      category: at(row, columns.category) || OTHER_CATEGORY,
      unit: at(row, columns.unit).toLowerCase() || "case",
      packSize: at(row, columns.packSize),
      brand: at(row, columns.brand),
      supplier,
      supplierItemCode: at(row, columns.code),
      unitPrice: parseMoney(at(row, columns.price)),
      parQuantity: clampQuantity(par),
    });
  }

  const matched = ORDER_GUIDE_FIELDS.filter((field) => columns[field] !== -1);

  return { items, matched, skipped };
}

/* ------------------------------------------------------- invoice importing */

/**
 * PFG's product classes, in the words the kitchen uses.
 *
 * The classes are a warehouse's categories, not a cook's — "FROZEN FOOD
 * PROCESS" and "GROCERY REFRIGERATED" describe where a thing is kept at the
 * depot. Anything not listed here is title-cased and kept as-is, so a class
 * that turns up later still reads properly without needing this table updated.
 */
const PFG_CATEGORIES: Record<string, string> = {
  POULTRY: "Chicken",
  SEAFOOD: "Seafood",
  PRODUCE: "Produce",
  "PRODUCE PRE-CUT": "Produce",
  "DAIRY PROD & SUBS": "Dairy",
  BEVERAGE: "Drinks",
  "GROCERY DRY": "Dry Goods",
  "GROCERY REFRIGERATED": "Refrigerated",
  "FROZEN FOOD PROCESS": "Frozen",
  DISPOSABLES: "Paper & Packaging",
  "CHEMICALS & CLEANING": "Cleaning",
};

/** "GROCERY DRY" to "Dry Goods"; "SOMETHING NEW" to "Something New". */
export function categoryFromClass(productClass: string): string {
  const trimmed = productClass.trim();
  if (!trimmed) return OTHER_CATEGORY;
  return (
    PFG_CATEGORIES[trimmed.toUpperCase()] ??
    trimmed
      .toLowerCase()
      .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
  );
}

/** The distributor's unit codes, spelled out. */
const PFG_UNITS: Record<string, string> = {
  CS: "case",
  CA: "case",
  EA: "each",
  BG: "bag",
  BX: "box",
  LB: "lb",
  TU: "tub",
  JG: "jug",
  RL: "roll",
};

export function unitFromCode(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return "case";
  return PFG_UNITS[trimmed.toUpperCase()] ?? trimmed.toLowerCase();
}

/** `8/14/2026` to `2026-08-14`. Returns null for anything else. */
export function fromUsDate(value: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) {
    // Some exports already use ISO; take it if it looks right.
    const iso = value.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
  }
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** One line of an invoice: what it was, and how much of it turned up. */
export type ParsedInvoiceLine = {
  /** The set-list item this line describes. */
  item: TruckItemDraft;
  /** How many were asked for. */
  quantityOrdered: number;
  /** How many actually arrived — this is what the order records. */
  quantity: number;
  /** Cost of one, worked out from the line's own total. */
  unitPrice: number | null;
  /** What the line came to on the invoice. */
  extendedPrice: number | null;
  /** Set on catch-weight lines, e.g. "43.88/lb". */
  weight: string;
};

export type ParsedInvoice = {
  invoiceNumber: string;
  orderNumber: string;
  /** ISO date the invoice was raised, which is the day the truck came. */
  invoiceDate: string;
  /** The distributor branch, e.g. "Performance Foodservice Nashville". */
  supplier: string;
  customerName: string;
  /** The lines added up, before tax and fees. */
  subtotal: number | null;
  tax: number | null;
  fees: number | null;
  /** What was actually charged. */
  total: number | null;
  lines: ParsedInvoiceLine[];
};

export type InvoiceImport = {
  invoices: ParsedInvoice[];
  /** Rows with no product on them — page furniture, mostly. */
  skipped: number;
};

/** Headers that only an invoice export has, used to tell the two files apart. */
const INVOICE_MARKERS = ["invoice number", "invoice date"];

/**
 * Work out which kind of file this is.
 *
 * The two are handled differently enough to be worth knowing up front: a guide
 * is a catalogue to fold into the set list, while an invoice is a record of a
 * delivery that already happened and becomes an order in its own right.
 */
export function detectImportKind(text: string): "invoice" | "guide" | "unknown" {
  const [headers] = parseCsv(text);
  if (!headers) return "unknown";
  const cleaned = headers.map(normaliseHeader);
  if (INVOICE_MARKERS.every((marker) => cleaned.includes(marker))) return "invoice";
  // A guide only has to be something with names in it; `parseOrderGuide` is the
  // one that decides whether it found anything usable.
  return cleaned.length > 1 ? "guide" : "unknown";
}

/** A number from a money or quantity cell, or null when the cell is empty. */
function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Read a PFG CustomerFirst invoice export.
 *
 * The file is flat — one row per line item, with the invoice's own details
 * repeated on every row — so the work is grouping the rows back up by invoice
 * number and lifting the header fields off the first of each.
 *
 * Prices are worked out from the line's extended price divided by the quantity
 * that shipped, rather than read from the unit price column. On a catch-weight
 * item those two disagree: a block of cheese invoiced at 43.88 lb shows a unit
 * price of $2.0699 — per pound, not per case — against an extended price of
 * $90.83. Dividing gets the cost of one case right for both kinds of line
 * without having to know which kind it is looking at.
 */
export function parseInvoiceExport(text: string): InvoiceImport {
  const rows = parseCsv(text);
  if (rows.length < 2) return { invoices: [], skipped: 0 };

  const [headers, ...body] = rows;
  const cleaned = headers.map(normaliseHeader);
  const column = (name: string) => cleaned.indexOf(name);

  const columns = {
    opCo: column("customer opco"),
    customer: column("customer name"),
    invoiceDate: column("invoice date"),
    invoiceNumber: column("invoice number"),
    orderNumber: column("invoice order number"),
    subtotal: column("invoice subtotal"),
    fees: column("invoice charges fees"),
    tax: column("invoice total tax"),
    total: column("invoice total"),
    productCode: column("product #"),
    description: column("product description"),
    brand: column("brand"),
    packSize: column("pack size"),
    uom: column("uom"),
    productClass: column("category/class"),
    netPrice: column("net price"),
    quantityOrdered: column("qty ordered"),
    quantityShipped: column("qty shipped"),
    weight: column("weight"),
    unitPrice: column("unit price"),
    extendedPrice: column("ext. price"),
  };

  const at = (row: string[], index: number) => (index === -1 ? "" : (row[index] ?? "").trim());

  const invoices = new Map<string, ParsedInvoice>();
  let skipped = 0;

  for (const row of body) {
    const description = at(row, columns.description);
    const invoiceNumber = at(row, columns.invoiceNumber);
    // Totals-only and page-break rows carry no product; there is nothing to
    // order and nothing to add to the set list.
    if (!description) {
      skipped++;
      continue;
    }

    let invoice = invoices.get(invoiceNumber);
    if (!invoice) {
      invoice = {
        invoiceNumber,
        orderNumber: at(row, columns.orderNumber),
        invoiceDate: fromUsDate(at(row, columns.invoiceDate)) ?? todayISO(),
        supplier: at(row, columns.opCo) || DEFAULT_SUPPLIER,
        customerName: at(row, columns.customer),
        subtotal: parseNumber(at(row, columns.subtotal)),
        tax: parseNumber(at(row, columns.tax)),
        fees: parseNumber(at(row, columns.fees)),
        total: parseNumber(at(row, columns.total)),
        lines: [],
      };
      invoices.set(invoiceNumber, invoice);
    }

    const quantity = parseNumber(at(row, columns.quantityShipped)) ?? 0;
    const extendedPrice = parseNumber(at(row, columns.extendedPrice));
    const listed = parseNumber(at(row, columns.unitPrice)) ?? parseNumber(at(row, columns.netPrice));
    const unitPrice =
      extendedPrice !== null && quantity > 0 ? round2(extendedPrice / quantity) : listed;

    invoice.lines.push({
      item: {
        name: description,
        category: categoryFromClass(at(row, columns.productClass)),
        unit: unitFromCode(at(row, columns.uom)),
        packSize: at(row, columns.packSize),
        brand: at(row, columns.brand),
        supplier: invoice.supplier,
        supplierItemCode: at(row, columns.productCode),
        unitPrice,
        parQuantity: 0,
      },
      quantityOrdered: parseNumber(at(row, columns.quantityOrdered)) ?? quantity,
      quantity: clampQuantity(quantity),
      unitPrice,
      extendedPrice,
      weight: at(row, columns.weight),
    });
  }

  // Newest first, matching how the history list reads.
  const ordered = [...invoices.values()].sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  return { invoices: ordered, skipped };
}

/* ----------------------------------------------------- order guide exporting */

/**
 * The order as a spreadsheet — one row per item being ordered.
 *
 * Item code first, because that is the column a rep or a portal's upload keys
 * off; everything after it is there so the sheet reads on its own.
 */
export function toOrderCsv(order: TruckOrderDetail): string {
  const lines = orderedLines(order.lines);
  return toCsv([
    ["Item code", "Item", "Pack size", "Unit", "Quantity", "Unit price", "Line total"],
    ...lines.map((line) => [
      line.supplierItemCode,
      line.name,
      line.packSize,
      line.unit,
      line.quantity,
      line.unitPrice ?? "",
      line.unitPrice === null ? "" : lineTotal(line).toFixed(2),
    ]),
    [],
    ["", "Total", "", "", orderUnitCount(lines), "", orderTotal(lines).toFixed(2)],
  ]);
}

/** `truck-order-2026-08-14.csv` */
export function orderCsvFilename(order: TruckOrder): string {
  return `truck-order-${order.orderDate}.csv`;
}
