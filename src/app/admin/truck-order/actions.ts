"use server";

import {
  assertISODate,
  assertNumber,
  assertText,
  assertUuid,
  requireAdmin,
} from "@/lib/admin-guard";
import * as repo from "@/lib/truck-repo";
import {
  MAX_QUANTITY,
  TRUCK_ORDER_STATUSES,
  clampQuantity,
  detectImportKind,
  parseInvoiceExport,
  parseOrderGuide,
  type OrderGuideField,
  type OrderPatch,
  type TruckItem,
  type TruckItemDraft,
  type TruckOrder,
  type TruckOrderDetail,
  type TruckOrderLine,
  type TruckOrderStatus,
} from "@/lib/truck";

/**
 * Server Actions behind the truck order page.
 *
 * Every one re-checks the admin session and validates its own arguments — see
 * `admin-guard.ts` for why being reachable only from a protected page isn't the
 * same as being protected.
 */

/* --------------------------------------------------------------- validation */

/** A price: dollars and cents, or null when it simply isn't known. */
function assertPrice(value: number | null): number | null {
  return value === null ? null : assertNumber(value, "Price", { max: 100_000 });
}

function assertStatus(value: string): TruckOrderStatus {
  if (!TRUCK_ORDER_STATUSES.includes(value as TruckOrderStatus)) {
    throw new Error(`Unknown status "${value}".`);
  }
  return value as TruckOrderStatus;
}

/** An optional delivery date — null is a real value here, not a missing one. */
function assertOptionalDate(value: string | null, field: string): string | null {
  return value === null || value === "" ? null : assertISODate(value, field);
}

function assertDraft(draft: TruckItemDraft): TruckItemDraft {
  return {
    name: assertText(draft.name, "Name", { max: 120, required: true }),
    category: assertText(draft.category, "Category", { max: 60 }),
    unit: assertText(draft.unit, "Unit", { max: 20 }),
    packSize: assertText(draft.packSize, "Pack size", { max: 60 }),
    brand: assertText(draft.brand, "Brand", { max: 80 }),
    supplier: assertText(draft.supplier, "Supplier", { max: 80 }),
    supplierItemCode: assertText(draft.supplierItemCode, "Item code", { max: 40 }),
    unitPrice: assertPrice(draft.unitPrice),
    parQuantity: assertNumber(draft.parQuantity, "Par", { max: MAX_QUANTITY }),
  };
}

/* ------------------------------------------------------------------- reads */

/**
 * Re-read everything. The page applies its edits optimistically, so this is how
 * it gets back in step with the database when a write fails.
 */
export async function reloadTruckAction(
  orderId: string | null,
): Promise<repo.TruckBase & { order: TruckOrderDetail | null }> {
  await requireAdmin();
  const base = await repo.loadTruckBase();
  const order = orderId
    ? await repo.loadOrder(assertUuid(orderId, "Order"))
    : await repo.loadLatestOrder();
  return { ...base, order };
}

export async function loadOrderAction(id: string): Promise<TruckOrderDetail | null> {
  await requireAdmin();
  return repo.loadOrder(assertUuid(id, "Order"));
}

/* ------------------------------------------------------------------ orders */

export async function createOrderAction(
  orderDate: string,
  deliveryDate: string | null,
): Promise<TruckOrderDetail> {
  await requireAdmin();
  return repo.insertOrder({
    orderDate: assertISODate(orderDate, "Order date"),
    deliveryDate: assertOptionalDate(deliveryDate, "Delivery date"),
  });
}

/** Start a new order from an old one, at today's prices. */
export async function copyOrderAction(
  fromId: string,
  orderDate: string,
  deliveryDate: string | null,
): Promise<TruckOrderDetail> {
  await requireAdmin();
  return repo.copyOrder(assertUuid(fromId, "Order"), {
    orderDate: assertISODate(orderDate, "Order date"),
    deliveryDate: assertOptionalDate(deliveryDate, "Delivery date"),
  });
}

export async function updateOrderAction(id: string, patch: OrderPatch): Promise<TruckOrder> {
  await requireAdmin();
  return repo.updateOrder(assertUuid(id, "Order"), {
    ...(patch.orderDate !== undefined && {
      orderDate: assertISODate(patch.orderDate, "Order date"),
    }),
    ...(patch.deliveryDate !== undefined && {
      deliveryDate: assertOptionalDate(patch.deliveryDate, "Delivery date"),
    }),
    ...(patch.status !== undefined && { status: assertStatus(patch.status) }),
    ...(patch.note !== undefined && { note: assertText(patch.note, "Note", { max: 1000 }) }),
  });
}

export async function deleteOrderAction(id: string): Promise<void> {
  await requireAdmin();
  await repo.deleteOrder(assertUuid(id, "Order"));
}

/* ------------------------------------------------------------------- lines */

export async function setQuantityAction(
  orderId: string,
  itemId: string,
  quantity: number,
): Promise<TruckOrderLine | null> {
  await requireAdmin();
  return repo.setLineQuantity(
    assertUuid(orderId, "Order"),
    assertUuid(itemId, "Item"),
    clampQuantity(assertNumber(quantity, "Quantity", { max: MAX_QUANTITY })),
  );
}

/** Same, for a line whose item has since been deleted from the set list. */
export async function setOrphanQuantityAction(
  orderId: string,
  lineId: string,
  quantity: number,
): Promise<TruckOrderLine | null> {
  await requireAdmin();
  return repo.setOrphanLineQuantity(
    assertUuid(orderId, "Order"),
    assertUuid(lineId, "Line"),
    clampQuantity(assertNumber(quantity, "Quantity", { max: MAX_QUANTITY })),
  );
}

export async function fillFromParsAction(orderId: string): Promise<TruckOrderLine[]> {
  await requireAdmin();
  return repo.fillFromPars(assertUuid(orderId, "Order"));
}

export async function clearOrderAction(orderId: string): Promise<void> {
  await requireAdmin();
  await repo.clearOrder(assertUuid(orderId, "Order"));
}

/* ------------------------------------------------------------------- items */

export async function addItemAction(draft: TruckItemDraft): Promise<TruckItem> {
  await requireAdmin();
  return repo.insertItem(assertDraft(draft));
}

export async function updateItemAction(id: string, draft: TruckItemDraft): Promise<TruckItem> {
  await requireAdmin();
  return repo.updateItem(assertUuid(id, "Item"), assertDraft(draft));
}

export async function removeItemAction(id: string): Promise<void> {
  await requireAdmin();
  await repo.deleteItem(assertUuid(id, "Item"));
}

/** The set list is small enough to hand over whole; this is the ceiling on it. */
const MAX_ITEMS = 5_000;

/** Save the order the sheet reads in, as a list of ids from top to bottom. */
export async function reorderItemsAction(ids: string[]): Promise<void> {
  await requireAdmin();
  if (ids.length > MAX_ITEMS) throw new Error("That is more items than this page will order.");
  await repo.setItemOrder(ids.map((id) => assertUuid(id, "Item")));
}

/* --------------------------------------------------------------- importing */

/** A guide or a few months of invoices; anything past this isn't either. */
const MAX_IMPORT_BYTES = 8_000_000;
const MAX_IMPORT_ROWS = 20_000;

/** What an order guide import did. */
export type GuideImportSummary = repo.ImportResult & {
  kind: "guide";
  skipped: number;
  matched: OrderGuideField[];
};

/** What an invoice import did. */
export type InvoiceImportSummary = repo.InvoiceImportResult & {
  kind: "invoice";
  skipped: number;
  /** Dates of the invoices that were read, newest first, for the message. */
  dates: string[];
};

export type ImportSummary = GuideImportSummary | InvoiceImportSummary;

/**
 * Read a file from the distributor — either kind.
 *
 * PFG has no customer API to pull from, so the two files their ordering site
 * exports are the way in. An **invoice export** is the richer of the two: it is
 * a record of deliveries that already happened, so it fills in the set list
 * *and* the order history at once. An **order guide** is just a catalogue, and
 * only touches the set list.
 *
 * They are told apart by their headers rather than asked about, because the
 * owner shouldn't have to know which report they downloaded.
 */
export async function importFileAction(csv: string, supplier: string): Promise<ImportSummary> {
  await requireAdmin();

  if (csv.length > MAX_IMPORT_BYTES) {
    throw new Error("That file is too big to be an order guide or an invoice export.");
  }

  return detectImportKind(csv) === "invoice"
    ? importInvoices(csv)
    : importGuide(csv, assertText(supplier, "Supplier", { max: 80 }));
}

async function importInvoices(csv: string): Promise<InvoiceImportSummary> {
  const { invoices, skipped } = parseInvoiceExport(csv);

  if (invoices.length === 0) {
    throw new Error("That looks like an invoice export, but there were no product lines on it.");
  }

  const lineCount = invoices.reduce((sum, invoice) => sum + invoice.lines.length, 0);
  if (lineCount > MAX_IMPORT_ROWS) {
    throw new Error(`That export has ${lineCount} lines — more than this page will take at once.`);
  }

  // Validate every line's item the same way a hand-typed one is validated: the
  // file came from outside, and nothing about its origin makes it trustworthy.
  const checked = invoices.map((invoice) => ({
    ...invoice,
    invoiceNumber: assertText(invoice.invoiceNumber, "Invoice number", { max: 40 }),
    invoiceDate: assertISODate(invoice.invoiceDate, "Invoice date"),
    total: invoice.total === null ? null : assertNumber(invoice.total, "Invoice total", { max: 10_000_000 }),
    lines: invoice.lines.map((line) => ({
      ...line,
      item: assertDraft(line.item),
      quantity: clampQuantity(assertNumber(line.quantity, "Quantity", { max: MAX_QUANTITY })),
      unitPrice: assertPrice(line.unitPrice),
    })),
  }));

  const result = await repo.importInvoices(checked);
  return {
    ...result,
    kind: "invoice",
    skipped,
    dates: checked.map((invoice) => invoice.invoiceDate),
  };
}

async function importGuide(csv: string, supplier: string): Promise<GuideImportSummary> {
  const { items, matched, skipped } = parseOrderGuide(csv, supplier);

  if (items.length === 0) {
    throw new Error(
      "No items were found. The file needs a header row with a description or item name column.",
    );
  }
  if (items.length > MAX_IMPORT_ROWS) {
    throw new Error(`That guide has ${items.length} rows — more than this page will take at once.`);
  }

  const result = await repo.importOrderGuide(items.map(assertDraft), matched);
  return { ...result, kind: "guide", skipped, matched };
}
