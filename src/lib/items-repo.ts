import "server-only";

import { getDb } from "@/lib/supabase/server";
import {
  buildGraph,
  normaliseCode,
  type Component,
  type Item,
  type ItemGraph,
  type ItemScope,
  type ItemStatus,
  type ItemSupplier,
  type ItemType,
  type Location,
  type Revision,
  type SopLink,
  type StorageZone,
  type Supplier,
  type UnitBasis,
} from "@/lib/items";

/**
 * Every read and write behind the items database.
 *
 * The catalogue is loaded whole. A bill of materials is only answerable with
 * the whole graph in hand — costing a sandwich means walking down to the case
 * of chicken, and "where used" means walking up from it — so paging the rows
 * would only mean fetching them again a moment later. At the scale this is
 * built for (thousands of items, not millions) one read beats many.
 */

const ITEM_COLUMNS = `
  id, code, type, internal_name, customer_name, aliases, category, subcategory, status,
  purchase_unit, pack_size, purchase_cost, par_level, reorder_point,
  stock_unit, portion_unit, stock_per_purchase_unit, portions_per_stock_unit, yield_factor,
  batch_yield_quantity, recipe_url, menu_price,
  allergens, storage_zone, storage_temp, shelf_life_days, date_label_rule, nutrition,
  photo_url, sop_links, notes,
  scope, available_everywhere, version, created_at, updated_at, updated_by
`;

const COMPONENT_COLUMNS = "id, parent_id, component_id, quantity, basis, sort_order, note";

function fail(context: string, error: { message: string; code?: string } | null): never {
  throw new Error(`[items] ${context}: ${error?.message ?? "unknown error"}`);
}

/** Postgres's duplicate-key error, which here only ever means a repeated code. */
const isDuplicate = (error: { code?: string } | null) => error?.code === "23505";

/** Postgres's foreign-key violation — something still points at the row. */
const isStillReferenced = (error: { code?: string } | null) => error?.code === "23503";

/* ------------------------------------------------------------------ shaping */

type ItemRow = {
  id: string;
  code: string;
  type: ItemType;
  internal_name: string;
  customer_name: string;
  aliases: string[];
  category: string;
  subcategory: string;
  status: ItemStatus;
  purchase_unit: string;
  pack_size: string;
  purchase_cost: number | null;
  par_level: number | null;
  reorder_point: number | null;
  stock_unit: string;
  portion_unit: string;
  stock_per_purchase_unit: number | null;
  portions_per_stock_unit: number | null;
  yield_factor: number;
  batch_yield_quantity: number;
  recipe_url: string;
  menu_price: number | null;
  allergens: string[];
  storage_zone: StorageZone;
  storage_temp: string;
  shelf_life_days: number | null;
  date_label_rule: string;
  nutrition: unknown;
  photo_url: string;
  sop_links: unknown;
  notes: string;
  scope: ItemScope;
  available_everywhere: boolean;
  version: number;
  created_at: string;
  updated_at: string;
  updated_by: string;
};

/** `numeric` arrives as a number over the wire, but never trust a null shape. */
const num = (value: number | null): number | null =>
  value === null || value === undefined ? null : Number(value);

function toSopLinks(value: unknown): SopLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { label, url } = entry as { label?: unknown; url?: unknown };
    if (typeof url !== "string" || !url) return [];
    return [{ label: typeof label === "string" && label ? label : url, url }];
  });
}

function toNutrition(value: unknown): Record<string, number | string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, number | string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "number" || typeof raw === "string") out[key] = raw;
  }
  return out;
}

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    internalName: row.internal_name,
    customerName: row.customer_name,
    aliases: row.aliases ?? [],
    category: row.category,
    subcategory: row.subcategory,
    status: row.status,
    purchaseUnit: row.purchase_unit,
    packSize: row.pack_size,
    purchaseCost: num(row.purchase_cost),
    parLevel: num(row.par_level),
    reorderPoint: num(row.reorder_point),
    stockUnit: row.stock_unit,
    portionUnit: row.portion_unit,
    stockPerPurchaseUnit: num(row.stock_per_purchase_unit),
    portionsPerStockUnit: num(row.portions_per_stock_unit),
    yieldFactor: Number(row.yield_factor ?? 1),
    batchYieldQuantity: Number(row.batch_yield_quantity ?? 1),
    recipeUrl: row.recipe_url,
    menuPrice: num(row.menu_price),
    allergens: row.allergens ?? [],
    storageZone: row.storage_zone,
    storageTemp: row.storage_temp,
    shelfLifeDays: row.shelf_life_days,
    dateLabelRule: row.date_label_rule,
    nutrition: toNutrition(row.nutrition),
    photoUrl: row.photo_url,
    sopLinks: toSopLinks(row.sop_links),
    notes: row.notes,
    scope: row.scope,
    availableEverywhere: row.available_everywhere,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

type ComponentRow = {
  id: string;
  parent_id: string;
  component_id: string;
  quantity: number;
  basis: UnitBasis;
  sort_order: number;
  note: string;
};

/* -------------------------------------------------------------------- reads */

/** The whole catalogue, indexed both ways, ready to cost. */
export async function loadGraph(): Promise<ItemGraph> {
  const db = getDb();

  const [itemsResult, componentsResult] = await Promise.all([
    db.from("items").select(ITEM_COLUMNS),
    db.from("item_components").select(COMPONENT_COLUMNS),
  ]);

  if (itemsResult.error) fail("loading items", itemsResult.error);
  if (componentsResult.error) fail("loading components", componentsResult.error);

  const items = (itemsResult.data as unknown as ItemRow[]).map(toItem);

  const components = new Map<string, Component[]>();
  for (const row of componentsResult.data as unknown as ComponentRow[]) {
    const part: Component = {
      id: row.id,
      componentId: row.component_id,
      quantity: Number(row.quantity),
      basis: row.basis,
      sortOrder: row.sort_order,
      note: row.note,
    };
    const list = components.get(row.parent_id);
    if (list) list.push(part);
    else components.set(row.parent_id, [part]);
  }
  for (const list of components.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return buildGraph(items, components);
}

export async function findItemByCode(code: string): Promise<Item | null> {
  const db = getDb();
  const { data, error } = await db
    .from("items")
    .select(ITEM_COLUMNS)
    .ilike("code", normaliseCode(code))
    .maybeSingle();

  if (error) fail("finding an item", error);
  return data ? toItem(data as unknown as ItemRow) : null;
}

export async function listSuppliers(): Promise<Supplier[]> {
  const db = getDb();
  const { data, error } = await db
    .from("suppliers")
    .select("id, name, account_number, contact, notes, active")
    .order("name");

  if (error) fail("loading suppliers", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    accountNumber: row.account_number,
    contact: row.contact,
    notes: row.notes,
    active: row.active,
  }));
}

export async function listLocations(): Promise<Location[]> {
  const db = getDb();
  const { data, error } = await db
    .from("locations")
    .select("id, code, name, region, active")
    .order("name");

  if (error) fail("loading locations", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    region: row.region,
    active: row.active,
  }));
}

/** The approved suppliers for one item, primary first. */
export async function listItemSuppliers(itemId: string): Promise<ItemSupplier[]> {
  const db = getDb();
  const { data, error } = await db
    .from("item_suppliers")
    .select(
      "id, supplier_id, supplier_part_number, purchase_unit, pack_size, cost, is_primary, approved, suppliers(name)",
    )
    .eq("item_id", itemId);

  if (error) fail("loading approved suppliers", error);

  return (data ?? [])
    .map((row) => {
      const joined = row.suppliers as unknown as { name: string } | { name: string }[] | null;
      const name = Array.isArray(joined) ? (joined[0]?.name ?? "") : (joined?.name ?? "");
      return {
        id: row.id,
        supplierId: row.supplier_id,
        supplierName: name,
        supplierPartNumber: row.supplier_part_number,
        purchaseUnit: row.purchase_unit,
        packSize: row.pack_size,
        cost: num(row.cost),
        isPrimary: row.is_primary,
        approved: row.approved,
      };
    })
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.supplierName.localeCompare(b.supplierName));
}

export async function listItemLocations(itemId: string): Promise<string[]> {
  const db = getDb();
  const { data, error } = await db
    .from("item_locations")
    .select("location_id")
    .eq("item_id", itemId);

  if (error) fail("loading item locations", error);
  return (data ?? []).map((row) => row.location_id);
}

/** The change history for one item, newest first. */
export async function listRevisions(itemId: string, limit = 25): Promise<Revision[]> {
  const db = getDb();
  const { data, error } = await db
    .from("item_revisions")
    .select("id, version, changed_at, changed_by, summary")
    .eq("item_id", itemId)
    .order("version", { ascending: false })
    .limit(limit);

  if (error) fail("loading revisions", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    version: row.version,
    changedAt: row.changed_at,
    changedBy: row.changed_by,
    summary: row.summary,
  }));
}

/* ------------------------------------------------------------------- writes */

/** The fields a form may set. Identity and audit columns are not among them. */
export type ItemDraft = Omit<
  Item,
  "id" | "version" | "createdAt" | "updatedAt" | "updatedBy"
>;

function toRow(draft: ItemDraft) {
  return {
    code: normaliseCode(draft.code),
    type: draft.type,
    internal_name: draft.internalName.trim(),
    customer_name: draft.customerName.trim(),
    aliases: draft.aliases.map((alias) => alias.trim()).filter(Boolean),
    category: draft.category.trim(),
    subcategory: draft.subcategory.trim(),
    status: draft.status,
    purchase_unit: draft.purchaseUnit.trim(),
    pack_size: draft.packSize.trim(),
    purchase_cost: draft.purchaseCost,
    par_level: draft.parLevel,
    reorder_point: draft.reorderPoint,
    stock_unit: draft.stockUnit.trim(),
    portion_unit: draft.portionUnit.trim(),
    stock_per_purchase_unit: draft.stockPerPurchaseUnit,
    portions_per_stock_unit: draft.portionsPerStockUnit,
    yield_factor: draft.yieldFactor,
    batch_yield_quantity: draft.batchYieldQuantity,
    recipe_url: draft.recipeUrl.trim(),
    menu_price: draft.menuPrice,
    allergens: draft.allergens,
    storage_zone: draft.storageZone,
    storage_temp: draft.storageTemp.trim(),
    shelf_life_days: draft.shelfLifeDays,
    date_label_rule: draft.dateLabelRule.trim(),
    nutrition: draft.nutrition,
    photo_url: draft.photoUrl.trim(),
    sop_links: draft.sopLinks,
    notes: draft.notes.trim(),
    scope: draft.scope,
    available_everywhere: draft.availableEverywhere,
  };
}

/** Raised when a code is already taken, so the form can say so in its own words. */
export class DuplicateCodeError extends Error {
  constructor(code: string) {
    super(`${code} is already in use.`);
    this.name = "DuplicateCodeError";
  }
}

/** Raised when something still points at an item somebody tried to delete. */
export class StillReferencedError extends Error {
  constructor() {
    super("Something is still made from this item.");
    this.name = "StillReferencedError";
  }
}

export async function createItem(draft: ItemDraft, author: string): Promise<Item> {
  const db = getDb();
  const { data, error } = await db
    .from("items")
    .insert({ ...toRow(draft), updated_by: author })
    .select(ITEM_COLUMNS)
    .single();

  if (isDuplicate(error)) throw new DuplicateCodeError(normaliseCode(draft.code));
  if (error) fail("creating an item", error);

  const item = toItem(data as unknown as ItemRow);
  await recordRevision(item, "Created", author);
  return item;
}

/**
 * Save an edit, bumping the version and writing the history entry in the same
 * breath. Version and history are what make a past state of the catalogue
 * identifiable, so nothing may change without them moving too.
 */
export async function updateItem(
  id: string,
  draft: ItemDraft,
  author: string,
  summary: string,
): Promise<Item> {
  const db = getDb();

  const { data: current, error: readError } = await db
    .from("items")
    .select("version")
    .eq("id", id)
    .single();
  if (readError) fail("reading an item's version", readError);

  const { data, error } = await db
    .from("items")
    .update({
      ...toRow(draft),
      version: (current?.version ?? 0) + 1,
      updated_at: new Date().toISOString(),
      updated_by: author,
    })
    .eq("id", id)
    .select(ITEM_COLUMNS)
    .single();

  if (isDuplicate(error)) throw new DuplicateCodeError(normaliseCode(draft.code));
  if (error) fail("updating an item", error);

  const item = toItem(data as unknown as ItemRow);
  await recordRevision(item, summary, author);
  return item;
}

/** Keep the whole record as it stood, so any past state can be reproduced. */
async function recordRevision(item: Item, summary: string, author: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("item_revisions").insert({
    item_id: item.id,
    version: item.version,
    changed_by: author,
    summary,
    snapshot: JSON.parse(JSON.stringify(item)),
  });
  // History is worth having but not worth losing an edit over.
  if (error) console.error("[items] Could not write a revision:", error.message);
}

/**
 * Delete an item outright.
 *
 * Only reachable for items nothing is built from — the `on delete restrict` on
 * `item_components` is the guard, and this turns its error into a sentence. The
 * usual end for an item is `discontinued`, which keeps every document that ever
 * referenced it readable.
 */
export async function deleteItem(id: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("items").delete().eq("id", id);
  if (isStillReferenced(error)) throw new StillReferencedError();
  if (error) fail("deleting an item", error);
}

/* -------------------------------------------------------------- components */

export async function addComponent(
  parentId: string,
  componentId: string,
  quantity: number,
  basis: UnitBasis,
): Promise<void> {
  const db = getDb();

  const { data: siblings } = await db
    .from("item_components")
    .select("sort_order")
    .eq("parent_id", parentId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const { error } = await db.from("item_components").insert({
    parent_id: parentId,
    component_id: componentId,
    quantity,
    basis,
    sort_order: (siblings?.[0]?.sort_order ?? -1) + 1,
  });

  if (isDuplicate(error)) throw new Error("That item is already in this build.");
  // The cycle trigger raises a check violation with a sentence worth showing.
  if (error?.code === "23514") throw new Error(error.message);
  if (error) fail("adding a component", error);
}

export async function updateComponent(
  id: string,
  patch: { quantity?: number; basis?: UnitBasis; note?: string },
): Promise<void> {
  const db = getDb();
  const { error } = await db.from("item_components").update(patch).eq("id", id);
  if (error) fail("updating a component", error);
}

export async function removeComponent(id: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("item_components").delete().eq("id", id);
  if (error) fail("removing a component", error);
}

/* --------------------------------------------------------------- suppliers */

export async function createSupplier(name: string): Promise<Supplier> {
  const db = getDb();
  const { data, error } = await db
    .from("suppliers")
    .insert({ name: name.trim() })
    .select("id, name, account_number, contact, notes, active")
    .single();

  if (isDuplicate(error)) throw new Error(`${name.trim()} is already on file.`);
  if (error) fail("creating a supplier", error);

  return {
    id: data.id,
    name: data.name,
    accountNumber: data.account_number,
    contact: data.contact,
    notes: data.notes,
    active: data.active,
  };
}

/**
 * Approve a supplier for an item.
 *
 * Marking one primary clears the flag on the others first — "the supplier this
 * item is bought from" only means anything if exactly one row claims it.
 */
export async function setItemSupplier(input: {
  itemId: string;
  supplierId: string;
  supplierPartNumber: string;
  purchaseUnit: string;
  packSize: string;
  cost: number | null;
  isPrimary: boolean;
}): Promise<void> {
  const db = getDb();

  if (input.isPrimary) {
    const { error } = await db
      .from("item_suppliers")
      .update({ is_primary: false })
      .eq("item_id", input.itemId);
    if (error) fail("clearing the primary supplier", error);
  }

  const { error } = await db.from("item_suppliers").upsert(
    {
      item_id: input.itemId,
      supplier_id: input.supplierId,
      supplier_part_number: input.supplierPartNumber.trim(),
      purchase_unit: input.purchaseUnit.trim(),
      pack_size: input.packSize.trim(),
      cost: input.cost,
      is_primary: input.isPrimary,
    },
    { onConflict: "item_id,supplier_id" },
  );

  if (error) fail("approving a supplier", error);
}

export async function removeItemSupplier(id: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("item_suppliers").delete().eq("id", id);
  if (error) fail("removing an approved supplier", error);
}

/* --------------------------------------------------------------- locations */

/** Replace the set of locations an item is available at. */
export async function setItemLocations(itemId: string, locationIds: string[]): Promise<void> {
  const db = getDb();

  const { error: clearError } = await db.from("item_locations").delete().eq("item_id", itemId);
  if (clearError) fail("clearing item locations", clearError);

  if (locationIds.length === 0) return;

  const { error } = await db
    .from("item_locations")
    .insert(locationIds.map((locationId) => ({ item_id: itemId, location_id: locationId })));
  if (error) fail("setting item locations", error);
}
