import "server-only";

import { getDb } from "@/lib/supabase/server";
import {
  DEFAULT_SUPPLIER,
  OTHER_CATEGORY,
  clampQuantity,
  compareItems,
  orderItemCount,
  orderTotal,
  orderUnitCount,
  type OrderGuideField,
  type OrderPatch,
  type ParsedInvoice,
  type ParsedInvoiceLine,
  type TruckItem,
  type TruckItemDraft,
  type TruckOrder,
  type TruckOrderDetail,
  type TruckOrderLine,
  type TruckOrderStatus,
  type TruckOrderSummary,
} from "@/lib/truck";

/**
 * Every read and write behind the truck order page.
 *
 * An order stores only the lines that are actually being ordered — setting a
 * quantity back to zero deletes the row rather than parking a 0 in the table.
 * The sheet gets its shape from `truck_items` and its numbers from whichever
 * lines exist, so an order is never carrying a row per item in the catalogue.
 */

/** How many past orders the history list reaches back over — a year of weekly trucks. */
export const HISTORY_LIMIT = 52;

const ITEM_COLUMNS =
  "id, name, category, unit, pack_size, brand, supplier, supplier_item_code, unit_price, par_quantity, sort_order";
const LINE_COLUMNS =
  "id, item_id, name, category, unit, pack_size, supplier_item_code, unit_price, quantity, sort_order";
const ORDER_COLUMNS =
  "id, order_date, delivery_date, status, note, submitted_at, received_at, invoice_number, invoice_total";

function fail(context: string, error: { message: string; code?: string } | null): never {
  throw new Error(`[truck] ${context}: ${error?.message ?? "unknown error"}`);
}

/** Postgres's duplicate-key error, which here only ever means a repeated item code. */
const isDuplicate = (error: { code?: string } | null) => error?.code === "23505";

/* ------------------------------------------------------------------ shaping */

type ItemRow = {
  id: string;
  name: string;
  category: string;
  unit: string;
  pack_size: string;
  brand: string;
  supplier: string;
  supplier_item_code: string;
  unit_price: number | null;
  par_quantity: number;
  sort_order: number;
};

function toItem(row: ItemRow): TruckItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    packSize: row.pack_size,
    brand: row.brand,
    supplier: row.supplier,
    supplierItemCode: row.supplier_item_code,
    unitPrice: row.unit_price,
    parQuantity: row.par_quantity,
    sortOrder: row.sort_order,
  };
}

type LineRow = {
  id: string;
  item_id: string | null;
  name: string;
  category: string;
  unit: string;
  pack_size: string;
  supplier_item_code: string;
  unit_price: number | null;
  quantity: number;
  sort_order: number;
};

function toLine(row: LineRow): TruckOrderLine {
  return {
    id: row.id,
    itemId: row.item_id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    packSize: row.pack_size,
    supplierItemCode: row.supplier_item_code,
    unitPrice: row.unit_price,
    quantity: row.quantity,
    sortOrder: row.sort_order,
  };
}

type OrderRow = {
  id: string;
  order_date: string;
  delivery_date: string | null;
  status: TruckOrderStatus;
  note: string;
  submitted_at: string | null;
  received_at: string | null;
  invoice_number: string;
  invoice_total: number | null;
};

function toOrder(row: OrderRow): TruckOrder {
  return {
    id: row.id,
    orderDate: row.order_date,
    deliveryDate: row.delivery_date,
    status: row.status,
    note: row.note,
    submittedAt: row.submitted_at,
    receivedAt: row.received_at,
    invoiceNumber: row.invoice_number,
    invoiceTotal: row.invoice_total,
  };
}

/** The snapshot a line carries, taken off the item at the moment it's added. */
function snapshotOf(item: TruckItem) {
  return {
    item_id: item.id,
    name: item.name,
    category: item.category,
    unit: item.unit,
    pack_size: item.packSize,
    supplier_item_code: item.supplierItemCode,
    unit_price: item.unitPrice,
    sort_order: item.sortOrder,
  };
}

/* --------------------------------------------------------------------- read */

export type TruckBase = {
  items: TruckItem[];
  /** Most recent first, capped at `HISTORY_LIMIT`. */
  orders: TruckOrderSummary[];
};

/** The set list, and enough of every past order for the history panel. */
export async function loadTruckBase(): Promise<TruckBase> {
  const db = getDb();

  const [items, orders] = await Promise.all([
    db.from("truck_items").select(ITEM_COLUMNS),
    db
      .from("truck_orders")
      .select(ORDER_COLUMNS)
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  if (items.error) fail("loading items", items.error);
  if (orders.error) fail("loading orders", orders.error);

  return {
    items: items.data.map(toItem).sort(compareItems),
    orders: await summarise(orders.data.map(toOrder)),
  };
}

/**
 * Attach the counts and totals the history list shows.
 *
 * One query for every order's lines rather than one per order — the numbers are
 * a sum over a handful of columns, and the alternative is 52 round trips to
 * draw a list.
 */
async function summarise(orders: TruckOrder[]): Promise<TruckOrderSummary[]> {
  if (orders.length === 0) return [];

  const { data, error } = await getDb()
    .from("truck_order_lines")
    .select("order_id, quantity, unit_price")
    .in(
      "order_id",
      orders.map((order) => order.id),
    );
  if (error) fail("loading order totals", error);

  const byOrder = new Map<string, Pick<TruckOrderLine, "quantity" | "unitPrice">[]>();
  for (const row of data) {
    const line = { quantity: row.quantity, unitPrice: row.unit_price };
    const existing = byOrder.get(row.order_id);
    if (existing) existing.push(line);
    else byOrder.set(row.order_id, [line]);
  }

  return orders.map((order) => {
    const lines = byOrder.get(order.id) ?? [];
    return {
      ...order,
      itemCount: orderItemCount(lines),
      totalUnits: orderUnitCount(lines),
      total: orderTotal(lines),
    };
  });
}

/** One order with every line on it, or null when the id doesn't exist. */
export async function loadOrder(id: string): Promise<TruckOrderDetail | null> {
  const db = getDb();

  const [order, lines] = await Promise.all([
    db.from("truck_orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle(),
    db.from("truck_order_lines").select(LINE_COLUMNS).eq("order_id", id),
  ]);

  if (order.error) fail("loading an order", order.error);
  if (lines.error) fail("loading the lines on an order", lines.error);
  if (!order.data) return null;

  return { ...toOrder(order.data), lines: lines.data.map(toLine) };
}

/** The order the page opens on: whichever is most recent. */
export async function loadLatestOrder(): Promise<TruckOrderDetail | null> {
  const { data, error } = await getDb()
    .from("truck_orders")
    .select("id")
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) fail("finding the most recent order", error);
  return data ? loadOrder(data.id) : null;
}

/* ------------------------------------------------------------------- orders */

export async function insertOrder(input: {
  orderDate: string;
  deliveryDate: string | null;
}): Promise<TruckOrderDetail> {
  const { data, error } = await getDb()
    .from("truck_orders")
    .insert({ order_date: input.orderDate, delivery_date: input.deliveryDate })
    .select(ORDER_COLUMNS)
    .single();

  if (error) fail("starting an order", error);
  return { ...toOrder(data), lines: [] };
}

/**
 * Edit an order's own details.
 *
 * The status timestamps are set here rather than by the caller, so each one
 * means the moment that status was actually reached. Marking an order delivered
 * deliberately leaves "placed at" alone — that already happened.
 */
export async function updateOrder(id: string, patch: OrderPatch): Promise<TruckOrder> {
  const now = new Date().toISOString();
  const { data, error } = await getDb()
    .from("truck_orders")
    .update({
      ...(patch.orderDate !== undefined && { order_date: patch.orderDate }),
      ...(patch.deliveryDate !== undefined && { delivery_date: patch.deliveryDate }),
      ...(patch.note !== undefined && { note: patch.note }),
      ...(patch.status !== undefined && {
        status: patch.status,
        // Going back to draft un-places the order; both stamps go with it.
        ...(patch.status === "draft" && { submitted_at: null, received_at: null }),
        ...(patch.status === "submitted" && { submitted_at: now, received_at: null }),
        ...(patch.status === "received" && { received_at: now }),
      }),
      updated_at: now,
    })
    .eq("id", id)
    .select(ORDER_COLUMNS)
    .single();

  if (error) fail("saving that order", error);
  return toOrder(data);
}

/** Delete an order. Its lines go with it via `on delete cascade`. */
export async function deleteOrder(id: string): Promise<void> {
  const { error } = await getDb().from("truck_orders").delete().eq("id", id);
  if (error) fail("deleting that order", error);
}

/**
 * Start a new order carrying the same quantities as an old one.
 *
 * Details are re-read off the items rather than copied from the old lines, so a
 * reorder is priced at today's prices. Anything since deleted from the set list
 * keeps the snapshot it had, because there is nothing left to re-read.
 */
export async function copyOrder(
  fromId: string,
  input: { orderDate: string; deliveryDate: string | null },
): Promise<TruckOrderDetail> {
  const source = await loadOrder(fromId);
  if (!source) throw new Error("[truck] copying an order: that order no longer exists.");

  const order = await insertOrder(input);
  const lines = source.lines.filter((line) => line.quantity > 0);
  if (lines.length === 0) return order;

  const items = new Map((await loadItems()).map((item) => [item.id, item]));
  const rows = lines.map((line) => {
    const item = line.itemId ? items.get(line.itemId) : undefined;
    const base = item
      ? snapshotOf(item)
      : {
          item_id: null,
          name: line.name,
          category: line.category,
          unit: line.unit,
          pack_size: line.packSize,
          supplier_item_code: line.supplierItemCode,
          unit_price: line.unitPrice,
          sort_order: line.sortOrder,
        };
    return { ...base, order_id: order.id, quantity: line.quantity };
  });

  const { data, error } = await getDb().from("truck_order_lines").insert(rows).select(LINE_COLUMNS);
  if (error) fail("copying an order", error);

  return { ...order, lines: data.map(toLine) };
}

/* -------------------------------------------------------------------- lines */

/**
 * Set how many of one item are on an order.
 *
 * Zero removes the line outright — an order holds what is being ordered and
 * nothing else, which is what makes the history readable years later.
 */
export async function setLineQuantity(
  orderId: string,
  itemId: string,
  quantity: number,
): Promise<TruckOrderLine | null> {
  const db = getDb();
  const amount = clampQuantity(quantity);

  if (amount === 0) {
    const { error } = await db
      .from("truck_order_lines")
      .delete()
      .eq("order_id", orderId)
      .eq("item_id", itemId);
    if (error) fail("taking that item off the order", error);
    await touch(orderId);
    return null;
  }

  const item = await loadItem(itemId);
  if (!item) throw new Error("[truck] setting a quantity: that item no longer exists.");

  const { data, error } = await db
    .from("truck_order_lines")
    .upsert(
      { ...snapshotOf(item), order_id: orderId, quantity: amount },
      { onConflict: "order_id,item_id" },
    )
    .select(LINE_COLUMNS)
    .single();

  if (error) fail("saving that quantity", error);
  await touch(orderId);
  return toLine(data);
}

/** Set the quantity on a line whose item has been deleted — by line id, not item. */
export async function setOrphanLineQuantity(
  orderId: string,
  lineId: string,
  quantity: number,
): Promise<TruckOrderLine | null> {
  const db = getDb();
  const amount = clampQuantity(quantity);

  if (amount === 0) {
    const { error } = await db
      .from("truck_order_lines")
      .delete()
      .eq("id", lineId)
      .eq("order_id", orderId);
    if (error) fail("removing that line", error);
    await touch(orderId);
    return null;
  }

  const { data, error } = await db
    .from("truck_order_lines")
    .update({ quantity: amount })
    .eq("id", lineId)
    .eq("order_id", orderId)
    .select(LINE_COLUMNS)
    .single();

  if (error) fail("saving that quantity", error);
  await touch(orderId);
  return toLine(data);
}

/**
 * Put every item with a par onto the order at that par, leaving anything
 * already typed in alone — the button is for filling the blanks, not for
 * overwriting a sheet halfway through being counted.
 */
export async function fillFromPars(orderId: string): Promise<TruckOrderLine[]> {
  const db = getDb();

  const [items, existing] = await Promise.all([
    loadItems(),
    db.from("truck_order_lines").select("item_id").eq("order_id", orderId),
  ]);
  if (existing.error) fail("reading the order before filling it", existing.error);

  const taken = new Set(existing.data.map((row) => row.item_id));
  const rows = items
    .filter((item) => item.parQuantity > 0 && !taken.has(item.id))
    .map((item) => ({ ...snapshotOf(item), order_id: orderId, quantity: item.parQuantity }));

  if (rows.length === 0) return [];

  const { data, error } = await db.from("truck_order_lines").insert(rows).select(LINE_COLUMNS);
  if (error) fail("filling the order from pars", error);

  await touch(orderId);
  return data.map(toLine);
}

/** Take everything off the order, leaving the order itself in place. */
export async function clearOrder(orderId: string): Promise<void> {
  const { error } = await getDb().from("truck_order_lines").delete().eq("order_id", orderId);
  if (error) fail("clearing the order", error);
  await touch(orderId);
}

/** Mark an order as edited. Failing this shouldn't lose the edit that caused it. */
async function touch(orderId: string): Promise<void> {
  const { error } = await getDb()
    .from("truck_orders")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) console.error(`[truck] Could not stamp order ${orderId}:`, error.message);
}

/* -------------------------------------------------------------------- items */

export async function loadItems(): Promise<TruckItem[]> {
  const { data, error } = await getDb().from("truck_items").select(ITEM_COLUMNS);
  if (error) fail("loading items", error);
  return data.map(toItem).sort(compareItems);
}

async function loadItem(id: string): Promise<TruckItem | null> {
  const { data, error } = await getDb()
    .from("truck_items")
    .select(ITEM_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("loading an item", error);
  return data ? toItem(data) : null;
}

function itemColumns(draft: TruckItemDraft) {
  return {
    name: draft.name,
    category: draft.category || OTHER_CATEGORY,
    unit: draft.unit,
    pack_size: draft.packSize,
    brand: draft.brand,
    supplier: draft.supplier || DEFAULT_SUPPLIER,
    supplier_item_code: draft.supplierItemCode,
    unit_price: draft.unitPrice,
    par_quantity: draft.parQuantity,
  };
}

/** The message the owner sees when two items claim the same distributor code. */
const DUPLICATE_CODE = "Another item already uses that item code.";

export async function insertItem(draft: TruckItemDraft): Promise<TruckItem> {
  const { data, error } = await getDb()
    .from("truck_items")
    .insert(itemColumns(draft))
    .select(ITEM_COLUMNS)
    .single();

  if (isDuplicate(error)) throw new Error(DUPLICATE_CODE);
  if (error) fail("adding that item", error);
  return toItem(data);
}

/**
 * Edit an item. Lines already on past orders keep their own copy of the old
 * details, so changing a price here doesn't rewrite what an order cost.
 */
export async function updateItem(id: string, draft: TruckItemDraft): Promise<TruckItem> {
  const { data, error } = await getDb()
    .from("truck_items")
    .update(itemColumns(draft))
    .eq("id", id)
    .select(ITEM_COLUMNS)
    .single();

  if (isDuplicate(error)) throw new Error(DUPLICATE_CODE);
  if (error) fail("saving that item", error);
  return toItem(data);
}

/**
 * Take an item off the set list. Lines pointing at it become orphans rather
 * than disappearing (`on delete set null`), so a past order still shows what
 * was on the truck even after the item stops being carried.
 */
export async function deleteItem(id: string): Promise<void> {
  const { error } = await getDb().from("truck_items").delete().eq("id", id);
  if (error) fail("removing that item", error);
}

/**
 * Save the order the sheet is arranged in: `ids` in the order they should read.
 *
 * Only the rows whose position actually changed are written. The first arrange
 * of a freshly imported list moves everything off zero and so touches every
 * row, but every nudge after that is two writes.
 */
export async function setItemOrder(ids: readonly string[]): Promise<void> {
  const db = getDb();
  const current = new Map((await loadItems()).map((item) => [item.id, item.sortOrder]));

  const changed = ids
    .map((id, index) => ({ id, index }))
    .filter(({ id, index }) => current.has(id) && current.get(id) !== index);
  if (changed.length === 0) return;

  const results = await Promise.all(
    changed.map(({ id, index }) =>
      db.from("truck_items").update({ sort_order: index }).eq("id", id),
    ),
  );
  const firstFailure = results.find((result) => result.error);
  if (firstFailure?.error) fail("saving the new order", firstFailure.error);
}

/* ------------------------------------------------------------------ importing */

type ItemColumns = ReturnType<typeof itemColumns>;

/** Copy just the named columns across, each keeping its own type. */
function pick<K extends keyof ItemColumns>(
  columns: ItemColumns,
  keys: readonly K[],
): Pick<ItemColumns, K> {
  return Object.fromEntries(keys.map((key) => [key, columns[key]])) as Pick<ItemColumns, K>;
}

/** Which item column each order guide field lands in. */
const IMPORT_COLUMNS: Record<OrderGuideField, keyof ItemColumns> = {
  code: "supplier_item_code",
  name: "name",
  brand: "brand",
  packSize: "pack_size",
  unit: "unit",
  price: "unit_price",
  category: "category",
  par: "par_quantity",
};

export type ImportResult = { added: number; updated: number };

/**
 * Fold an order guide into the set list.
 *
 * Matching is by item code first and name second, so re-importing next month's
 * guide moves the prices on the items already being ordered instead of laying a
 * second copy of the catalogue beside them. Only the fields the file actually
 * had are written — an export with no category column must not quietly file
 * every item under "Other".
 */
export async function importOrderGuide(
  drafts: readonly TruckItemDraft[],
  fields: readonly OrderGuideField[],
): Promise<ImportResult> {
  if (drafts.length === 0) return { added: 0, updated: 0 };

  const db = getDb();
  const existing = await loadItems();
  const byCode = new Map(
    existing
      .filter((item) => item.supplierItemCode !== "")
      .map((item) => [item.supplierItemCode.toLowerCase(), item]),
  );
  const byName = new Map(existing.map((item) => [item.name.trim().toLowerCase(), item]));

  // Only the columns the file carried, and never the code itself — that is what
  // the row was matched on, so rewriting it would be a no-op at best.
  const updatable = fields.filter((field) => field !== "code").map((field) => IMPORT_COLUMNS[field]);

  // A guide can list the same item twice — a second warehouse, a reprinted
  // page. Collapse those before anything is written, or the insert below would
  // trip over a duplicate item code of its own making.
  const deduped = new Map<string, TruckItemDraft>();
  for (const draft of drafts) {
    deduped.set(draft.supplierItemCode.trim().toLowerCase() || draft.name.trim().toLowerCase(), draft);
  }

  const inserts: ItemColumns[] = [];
  const updates: { id: string; values: Partial<ItemColumns> }[] = [];

  for (const draft of deduped.values()) {
    const code = draft.supplierItemCode.trim().toLowerCase();
    const match = (code ? byCode.get(code) : undefined) ?? byName.get(draft.name.trim().toLowerCase());

    if (match) updates.push({ id: match.id, values: pick(itemColumns(draft), updatable) });
    else inserts.push(itemColumns(draft));
  }

  if (inserts.length > 0) {
    const { error } = await db.from("truck_items").insert(inserts);
    if (isDuplicate(error)) throw new Error("That guide lists the same item code twice.");
    if (error) fail("importing new items", error);
  }

  // Each row differs, so these can't be folded into one statement — but they
  // don't depend on each other either, and a guide is a few hundred rows.
  const results = await Promise.all(
    updates.map(({ id, values }) => db.from("truck_items").update(values).eq("id", id)),
  );
  const firstFailure = results.find((result) => result.error);
  if (firstFailure?.error) fail("updating items from the guide", firstFailure.error);

  return { added: inserts.length, updated: updates.length };
}

/* ------------------------------------------------------- invoice importing */

/** Everything an invoice carries about an item — all of it but the par. */
const INVOICE_FIELDS: OrderGuideField[] = [
  "code",
  "name",
  "brand",
  "packSize",
  "unit",
  "price",
  "category",
];

export type InvoiceImportResult = {
  ordersAdded: number;
  /** Invoices that were already in the history, so nothing was written. */
  ordersSkipped: number;
  itemsAdded: number;
  itemsUpdated: number;
  linesAdded: number;
};

/**
 * Turn PFG invoices into delivered orders, and their lines into set items.
 *
 * An invoice is a record of a delivery that has already happened, so each one
 * becomes an order marked as received. Re-importing an export that has already
 * been read does nothing: orders are matched on invoice number, which is why
 * the column has a uniqueness guard behind it.
 *
 * The order date is the invoice date. The real order went in a day or two
 * earlier, but nothing on the invoice says when — recording the day the truck
 * came is the honest reading of what the file actually knows.
 */
export async function importInvoices(
  invoices: readonly ParsedInvoice[],
): Promise<InvoiceImportResult> {
  const empty: InvoiceImportResult = {
    ordersAdded: 0,
    ordersSkipped: 0,
    itemsAdded: 0,
    itemsUpdated: 0,
    linesAdded: 0,
  };
  if (invoices.length === 0) return empty;

  const db = getDb();

  // Which of these have been imported before.
  const numbered = invoices.filter((invoice) => invoice.invoiceNumber !== "");
  const { data: seen, error: seenError } = await db
    .from("truck_orders")
    .select("invoice_number")
    .in(
      "invoice_number",
      numbered.map((invoice) => invoice.invoiceNumber),
    );
  if (seenError) fail("checking which invoices are already in", seenError);

  const known = new Set(seen.map((row) => row.invoice_number));
  const fresh = invoices.filter((invoice) => !known.has(invoice.invoiceNumber));
  const ordersSkipped = invoices.length - fresh.length;
  if (fresh.length === 0) return { ...empty, ordersSkipped };

  // Fold every line's item into the set list first, so each one has an id to
  // point a line at. Oldest invoice first: where the same item appears on
  // several, the newest invoice should be the one that sets today's price.
  const drafts = [...fresh]
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate))
    .flatMap((invoice) => invoice.lines.map((line) => line.item));
  const items = await importOrderGuide(drafts, INVOICE_FIELDS);

  const byCode = new Map(
    (await loadItems())
      .filter((item) => item.supplierItemCode !== "")
      .map((item) => [item.supplierItemCode.toLowerCase(), item]),
  );

  let ordersAdded = 0;
  let linesAdded = 0;

  for (const invoice of fresh) {
    const { data: order, error } = await db
      .from("truck_orders")
      .insert({
        order_date: invoice.invoiceDate,
        delivery_date: invoice.invoiceDate,
        status: "received",
        received_at: new Date().toISOString(),
        invoice_number: invoice.invoiceNumber,
        invoice_total: invoice.total,
      })
      .select("id")
      .single();

    // Two imports racing, or the same invoice number twice in one file: the
    // uniqueness guard catches it, and the right answer is to move on.
    if (isDuplicate(error)) continue;
    if (error) fail(`saving invoice ${invoice.invoiceNumber}`, error);
    ordersAdded++;

    const rows = mergeLines(invoice).map((line) => {
      const item = byCode.get(line.item.supplierItemCode.toLowerCase());
      return {
        order_id: order.id,
        item_id: item?.id ?? null,
        // The invoice's own words and prices, not the item's current ones —
        // this is what was on the truck that day.
        name: line.item.name,
        category: line.item.category,
        unit: line.item.unit,
        pack_size: line.item.packSize,
        supplier_item_code: line.item.supplierItemCode,
        unit_price: line.unitPrice,
        quantity: line.quantity,
        sort_order: item?.sortOrder ?? 0,
      };
    });

    if (rows.length === 0) continue;
    const { error: linesError } = await db.from("truck_order_lines").insert(rows);
    if (linesError) fail(`saving the lines on invoice ${invoice.invoiceNumber}`, linesError);
    linesAdded += rows.length;
  }

  return {
    ordersAdded,
    ordersSkipped,
    itemsAdded: items.added,
    itemsUpdated: items.updated,
    linesAdded,
  };
}

/**
 * Collapse an invoice's lines to one per item.
 *
 * An item can be billed twice on one invoice — split across pallets, or part of
 * it credited and rebilled. An order holds one line per item, so those have to
 * be added together before they get there.
 */
function mergeLines(invoice: ParsedInvoice): ParsedInvoiceLine[] {
  const merged = new Map<string, ParsedInvoiceLine>();

  for (const line of invoice.lines) {
    if (line.quantity <= 0) continue;
    const key = line.item.supplierItemCode || line.item.name.toLowerCase();
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, line);
      continue;
    }
    merged.set(key, {
      ...existing,
      quantity: clampQuantity(existing.quantity + line.quantity),
      quantityOrdered: existing.quantityOrdered + line.quantityOrdered,
      // Two billings of one item can be at different prices; what the order
      // should show is what the item averaged out at across the whole delivery.
      unitPrice: averagePrice(existing, line),
      extendedPrice: (existing.extendedPrice ?? 0) + (line.extendedPrice ?? 0),
    });
  }

  return [...merged.values()];
}

function averagePrice(a: ParsedInvoiceLine, b: ParsedInvoiceLine): number | null {
  const quantity = a.quantity + b.quantity;
  if (quantity <= 0) return a.unitPrice ?? b.unitPrice;
  const spend = (a.unitPrice ?? 0) * a.quantity + (b.unitPrice ?? 0) * b.quantity;
  return Math.round((spend / quantity) * 100) / 100;
}
