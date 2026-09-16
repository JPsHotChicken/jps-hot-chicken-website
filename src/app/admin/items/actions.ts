"use server";

import { revalidatePath } from "next/cache";

import { assertISODate, assertText, assertUuid, requireAdmin } from "@/lib/admin-guard";
import { changesFor, patchFor, type PricedProduct } from "@/lib/item-prices";
import * as repo from "@/lib/items-repo";
import { markStaleForItems } from "@/lib/menu-descriptions-repo";
import { MENU_DESCRIPTIONS_PATH, itemContentKey } from "@/lib/menu-descriptions";
import {
  FLAVOR_TAGS,
  ITEM_SCOPES,
  ITEM_STATUSES,
  ITEM_TYPES,
  MAX_INTENSITY,
  STORAGE_ZONES,
  TEXTURE_TAGS,
  isValidCode,
  normaliseCode,
  pickFrom,
  type Item,
  type ItemScope,
  type ItemStatus,
  type ItemType,
  type StorageZone,
  type UnitBasis,
} from "@/lib/items";

/**
 * Writes to the items database.
 *
 * The catalogue is a controlled document with one editor: the owner, signed in
 * at `/admin`. Everywhere else — the crew's copy at `/operations/items` — is a
 * read-only view of it. Every action re-checks the admin session itself, because
 * a Server Action is a public endpoint and being rendered on a page nobody could
 * reach proves nothing about who called it.
 */

/** Who is making a change, for the revision history. */
const AUTHOR = "owner";

const requireEditor = requireAdmin;

/* ------------------------------------------------------------- validation */

const oneOf = <T extends string>(value: string, allowed: readonly T[], field: string): T => {
  if (!(allowed as readonly string[]).includes(value)) throw new Error(`${field} is not valid.`);
  return value as T;
};

/**
 * A number from a form, or null where the box was left empty.
 *
 * Unlike the shared `assertNumber` this keeps four decimal places: a conversion
 * factor and a per-unit cost are both routinely finer than a cent, and rounding
 * them to two would quietly corrupt every cost built on them.
 */
function optionalNumber(
  value: unknown,
  field: string,
  { min = 0, max = 1_000_000_000 } = {},
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a number.`);
  if (parsed < min || parsed > max) throw new Error(`${field} must be between ${min} and ${max}.`);
  return Math.round(parsed * 10_000) / 10_000;
}

function requiredNumber(value: unknown, field: string, opts?: { min?: number; max?: number }) {
  const parsed = optionalNumber(value, field, opts);
  if (parsed === null) throw new Error(`${field} is required.`);
  return parsed;
}

/** A whole number from a fixed range — the 1-to-5 buttons, not a typed box. */
function wholeNumber(value: unknown, field: string, min: number, max: number): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} must be a whole number from ${min} to ${max}.`);
  }
  return parsed;
}

/** The shape a form posts. Everything arrives as text or null. */
export type ItemFormInput = {
  code: string;
  type: string;
  internalName: string;
  customerName: string;
  aliases: string[];
  category: string;
  subcategory: string;
  status: string;
  purchaseUnit: string;
  packSize: string;
  purchaseCost: string | null;
  parLevel: string | null;
  reorderPoint: string | null;
  stockUnit: string;
  portionUnit: string;
  stockPerPurchaseUnit: string | null;
  portionsPerStockUnit: string | null;
  yieldFactor: string | null;
  batchYieldQuantity: string | null;
  recipeUrl: string;
  menuPrice: string | null;
  allergens: string[];
  flavorTags: string[];
  textureTags: string[];
  intensity: number;
  storageZone: string;
  storageTemp: string;
  shelfLifeDays: string | null;
  dateLabelRule: string;
  photoUrl: string;
  notes: string;
  scope: string;
  availableEverywhere: boolean;
};

function toDraft(input: ItemFormInput): repo.ItemDraft {
  const code = normaliseCode(input.code);
  if (!isValidCode(code)) {
    throw new Error("An item code is letters, numbers and dashes — at least two characters.");
  }

  const shelfLife = optionalNumber(input.shelfLifeDays, "Shelf life", { max: 3650 });

  return {
    code,
    type: oneOf<ItemType>(input.type, ITEM_TYPES, "Type"),
    internalName: assertText(input.internalName, "Internal name", { required: true, max: 120 }),
    customerName: assertText(input.customerName, "Customer name", { max: 120 }),
    aliases: input.aliases
      .map((alias) => alias.trim())
      .filter(Boolean)
      .slice(0, 20),
    category: assertText(input.category, "Category", { max: 60 }),
    subcategory: assertText(input.subcategory, "Subcategory", { max: 60 }),
    status: oneOf<ItemStatus>(input.status, ITEM_STATUSES, "Status"),

    purchaseUnit: assertText(input.purchaseUnit, "Purchase unit", { max: 40 }),
    packSize: assertText(input.packSize, "Pack size", { max: 40 }),
    purchaseCost: optionalNumber(input.purchaseCost, "Purchase cost"),
    parLevel: optionalNumber(input.parLevel, "Par level"),
    reorderPoint: optionalNumber(input.reorderPoint, "Reorder point"),

    stockUnit: assertText(input.stockUnit, "Stock unit", { max: 40 }),
    portionUnit: assertText(input.portionUnit, "Portion unit", { max: 40 }),
    stockPerPurchaseUnit: optionalNumber(input.stockPerPurchaseUnit, "Stock per purchase unit"),
    portionsPerStockUnit: optionalNumber(input.portionsPerStockUnit, "Portions per stock unit"),
    // A yield of 0 would divide every cost above it by zero.
    yieldFactor: optionalNumber(input.yieldFactor, "Yield", { min: 0.0001, max: 1 }) ?? 1,
    batchYieldQuantity:
      optionalNumber(input.batchYieldQuantity, "Batch yield", { min: 0.0001 }) ?? 1,
    recipeUrl: assertText(input.recipeUrl, "Recipe link", { max: 500 }),

    menuPrice: optionalNumber(input.menuPrice, "Menu price"),

    allergens: input.allergens.filter((allergen) => allergen.trim()).slice(0, 20),
    flavorTags: pickFrom(input.flavorTags ?? [], FLAVOR_TAGS),
    textureTags: pickFrom(input.textureTags ?? [], TEXTURE_TAGS),
    intensity: wholeNumber(input.intensity, "Intensity", 1, MAX_INTENSITY),
    storageZone: oneOf<StorageZone>(input.storageZone, STORAGE_ZONES, "Storage zone"),
    storageTemp: assertText(input.storageTemp, "Storage temperature", { max: 60 }),
    shelfLifeDays: shelfLife === null ? null : Math.round(shelfLife),
    dateLabelRule: assertText(input.dateLabelRule, "Date label rule", { max: 200 }),
    nutrition: {},

    photoUrl: assertText(input.photoUrl, "Photo link", { max: 500 }),
    sopLinks: [],

    notes: assertText(input.notes, "Notes", { max: 2000 }),

    scope: oneOf<ItemScope>(input.scope, ITEM_SCOPES, "Scope"),
    availableEverywhere: Boolean(input.availableEverywhere),
  };
}

/* --------------------------------------------------- reaching menu copy */

/**
 * What the menu description writer reads off this item. Cost, pack size and par
 * level aren't in it: they change often and change nothing about how a dish is
 * described.
 */
const tasteKey = (item: Item) =>
  itemContentKey({
    name: item.internalName,
    category: item.category,
    flavorTags: item.flavorTags,
    textureTags: item.textureTags,
    intensity: item.intensity,
    notes: item.notes,
    // The build is compared separately: this is only called for field edits.
    parts: [],
  });

/**
 * Mark every generated description written from these items out of date, and
 * say how many were fresh until now.
 *
 * Never worth losing an edit over: the catalogue is the record that matters,
 * and a description left looking fresh is a smaller problem than a save that
 * failed. A failure is logged and reported as "none".
 */
async function markDescriptionsStale(itemIds: string[]): Promise<number> {
  try {
    const count = await markStaleForItems(itemIds);
    if (count > 0) revalidatePath(MENU_DESCRIPTIONS_PATH, "layout");
    return count;
  } catch (error) {
    console.error("[items] could not mark descriptions out of date:", error);
    return 0;
  }
}

/* ---------------------------------------------------------------- actions */

export async function createItemAction(input: ItemFormInput): Promise<string> {
  await requireEditor();
  const item = await repo.createItem(toDraft(input), AUTHOR);
  revalidatePath("/operations/items");
  return item.code;
}

/**
 * Save an edit. Comes back with the item's code — which may have changed — and
 * how many menu descriptions the edit put out of date, so the record can say so.
 */
export async function updateItemAction(
  id: string,
  input: ItemFormInput,
  summary: string,
): Promise<{ code: string; staleCount: number }> {
  await requireEditor();
  assertUuid(id, "Item");

  const before = await repo.findItemById(id);
  const item = await repo.updateItem(
    id,
    toDraft(input),
    AUTHOR,
    assertText(summary, "Change note", { max: 200 }) || "Edited",
  );

  const staleCount =
    before && tasteKey(before) === tasteKey(item) ? 0 : await markDescriptionsStale([id]);

  revalidatePath("/operations/items");
  revalidatePath(`/operations/items/${item.code}`);
  return { code: item.code, staleCount };
}

export async function deleteItemAction(id: string): Promise<void> {
  await requireEditor();
  assertUuid(id, "Item");
  await repo.deleteItem(id);
  revalidatePath("/operations/items");
}

export async function addComponentAction(input: {
  parentId: string;
  componentId: string;
  quantity: string;
  basis: string;
}): Promise<void> {
  await requireEditor();
  assertUuid(input.parentId, "Item");
  assertUuid(input.componentId, "Component");
  await repo.addComponent(
    input.parentId,
    input.componentId,
    requiredNumber(input.quantity, "Quantity", { min: 0.0001 }),
    oneOf<UnitBasis>(input.basis, ["stock", "portion"], "Unit"),
  );
  // What an item is made of is part of how it is described.
  await markDescriptionsStale([input.parentId]);
  revalidatePath("/operations/items");
}

export async function updateComponentAction(
  id: string,
  patch: { quantity?: string; basis?: string; note?: string },
): Promise<void> {
  await requireEditor();
  assertUuid(id, "Component");
  const parentId = await repo.updateComponent(id, {
    ...(patch.quantity !== undefined
      ? { quantity: requiredNumber(patch.quantity, "Quantity", { min: 0.0001 }) }
      : {}),
    ...(patch.basis !== undefined
      ? { basis: oneOf<UnitBasis>(patch.basis, ["stock", "portion"], "Unit") }
      : {}),
    ...(patch.note !== undefined
      ? { note: assertText(patch.note, "Note", { max: 200 }) }
      : {}),
  });
  await markDescriptionsStale([parentId]);
  revalidatePath("/operations/items");
}

export async function removeComponentAction(id: string): Promise<void> {
  await requireEditor();
  assertUuid(id, "Component");
  const parentId = await repo.removeComponent(id);
  await markDescriptionsStale([parentId]);
  revalidatePath("/operations/items");
}

/* ------------------------------------------------- prices from an invoice */

/** One decision the owner made on the import screen: this product is that item. */
export type PriceImportRow = {
  itemId: string;
  product: PricedProduct;
};

export type PriceImportResult = {
  /** Items whose record was changed. */
  updated: number;
  /** Items that already said what the invoice says, so nothing was written. */
  unchanged: number;
  /** Product numbers written onto an item, so the next import matches outright. */
  linked: number;
  /** Items that couldn't be saved, by code, with nothing half-written. */
  failed: string[];
};

/** A month of invoices is a few hundred products; past that it isn't one. */
const MAX_PRICE_ROWS = 1000;

/** The same checks a hand-typed price gets. The file came from outside. */
function checkedProduct(product: PricedProduct): PricedProduct {
  return {
    partNumber: assertText(product.partNumber, "Product number", { required: true, max: 60 }),
    description: assertText(product.description, "Product description", { max: 200 }),
    brand: assertText(product.brand, "Brand", { max: 60 }),
    packSize: assertText(product.packSize, "Pack size", { max: 40 }),
    purchaseUnit: assertText(product.purchaseUnit, "Purchase unit", { max: 40 }),
    cost: requiredNumber(product.cost, "Cost", { min: 0, max: 1_000_000 }),
    invoiceNumber: assertText(product.invoiceNumber, "Invoice number", { max: 40 }),
    invoiceDate: assertISODate(product.invoiceDate, "Invoice date"),
  };
}

/**
 * Write invoiced prices onto the items the owner matched them to.
 *
 * The rows arriving here are decisions, not guesses: the page did the matching,
 * the owner settled it, and anything they left unmatched never gets this far.
 * What is written is worked out again on this side with `patchFor`, from the
 * item as the database currently holds it — so a record edited in another tab
 * while the import screen sat open is costed off its real stock unit rather
 * than the one the browser remembered.
 *
 * Each item is saved the ordinary way, which means each one gets a version and
 * a history entry naming the invoice the price came off. The product number is
 * written onto the item's approved-supplier row at the same time: that is what
 * makes next month's import exact rather than another round of guessing.
 */
export async function importPricesAction(
  rows: PriceImportRow[],
  supplierName: string,
): Promise<PriceImportResult> {
  await requireEditor();

  if (rows.length === 0) return { updated: 0, unchanged: 0, linked: 0, failed: [] };
  if (rows.length > MAX_PRICE_ROWS) {
    throw new Error(`That is ${rows.length} products — more than one import will take.`);
  }

  const checked = rows.map((row) => ({
    itemId: assertUuid(row.itemId, "Item"),
    product: checkedProduct(row.product),
  }));

  // One item twice would have the two prices race each other, and the loser
  // would still be on the record. The last decision wins, as it reads on screen.
  const byItem = new Map(checked.map((row) => [row.itemId, row]));

  const supplier = await repo.findOrCreateSupplier(
    assertText(supplierName, "Supplier", { required: true, max: 120 }),
  );
  const links = await repo.loadSupplierLinks();

  const decisions = [...byItem.values()];
  const results = await Promise.allSettled(
    decisions.map((row) => applyPrice(row, supplier.id, links)),
  );

  const failed: string[] = [];
  let updated = 0;
  let unchanged = 0;
  let linked = 0;

  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      console.error("[items] a price could not be saved:", result.reason);
      failed.push(decisions[index].product.description);
      continue;
    }
    if (result.value.changed) updated++;
    else unchanged++;
    if (result.value.linked) linked++;
  }

  revalidatePath("/admin/items");
  revalidatePath("/operations/items");
  return { updated, unchanged, linked, failed };
}

/** One item: its price, its pack, and the product number that found it. */
async function applyPrice(
  row: PriceImportRow,
  supplierId: string,
  links: repo.SupplierLinkRow[],
): Promise<{ changed: boolean; linked: boolean }> {
  const item = await repo.findItemById(row.itemId);
  if (!item) throw new Error(`Item ${row.itemId} is no longer there.`);

  const patch = patchFor(row.product, item);
  // The same rule the preview drew its list of changes from, so an item saved
  // here and an item shown as unchanged there can never mean different things.
  const changed = changesFor(row.product, item).length > 0;

  if (changed) {
    // The record as it stands, with these fields moved and nothing else touched.
    // `updateItem` reads only the draft fields, so the identity and audit
    // columns that come along with the spread are ignored rather than written.
    await repo.updateItem(
      row.itemId,
      {
        ...item,
        purchaseCost: patch.purchaseCost,
        purchaseUnit: patch.purchaseUnit,
        packSize: patch.packSize,
        // Null means the pack size couldn't be read in this item's stock unit,
        // which is a reason to leave the conversion alone, not to clear it.
        stockPerPurchaseUnit: patch.stockPerPurchaseUnit ?? item.stockPerPurchaseUnit,
      },
      AUTHOR,
      `Price from invoice ${row.product.invoiceNumber} (${row.product.invoiceDate})`,
    );
    revalidatePath(`/operations/items/${item.code}`);
  }

  // Keep whichever supplier the item already buys from as its primary; an item
  // that has never had one takes this invoice's supplier.
  const held = links.find(
    (link) => link.itemId === row.itemId && link.supplierId === supplierId,
  );
  const hasPrimary = links.some((link) => link.itemId === row.itemId && link.isPrimary);

  await repo.setItemSupplier({
    itemId: row.itemId,
    supplierId,
    supplierPartNumber: row.product.partNumber,
    purchaseUnit: patch.purchaseUnit,
    packSize: patch.packSize,
    cost: patch.purchaseCost,
    isPrimary: held ? held.isPrimary : !hasPrimary,
  });

  return { changed, linked: held?.partNumber !== row.product.partNumber };
}

export async function createSupplierAction(name: string): Promise<void> {
  await requireEditor();
  await repo.createSupplier(assertText(name, "Supplier name", { required: true, max: 120 }));
  revalidatePath("/operations/items");
}

export async function setItemSupplierAction(input: {
  itemId: string;
  supplierId: string;
  supplierPartNumber: string;
  purchaseUnit: string;
  packSize: string;
  cost: string | null;
  isPrimary: boolean;
}): Promise<void> {
  await requireEditor();
  assertUuid(input.itemId, "Item");
  assertUuid(input.supplierId, "Supplier");
  await repo.setItemSupplier({
    itemId: input.itemId,
    supplierId: input.supplierId,
    supplierPartNumber: assertText(input.supplierPartNumber, "Part number", { max: 60 }),
    purchaseUnit: assertText(input.purchaseUnit, "Purchase unit", { max: 40 }),
    packSize: assertText(input.packSize, "Pack size", { max: 40 }),
    cost: optionalNumber(input.cost, "Cost"),
    isPrimary: Boolean(input.isPrimary),
  });
  revalidatePath("/operations/items");
}

export async function removeItemSupplierAction(id: string): Promise<void> {
  await requireEditor();
  assertUuid(id, "Approved supplier");
  await repo.removeItemSupplier(id);
  revalidatePath("/operations/items");
}

export async function setItemLocationsAction(
  itemId: string,
  locationIds: string[],
): Promise<void> {
  await requireEditor();
  assertUuid(itemId, "Item");
  for (const id of locationIds) assertUuid(id, "Location");
  await repo.setItemLocations(itemId, locationIds);
  revalidatePath("/operations/items");
}
