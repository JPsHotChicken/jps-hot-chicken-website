"use server";

import { revalidatePath } from "next/cache";

import { assertText, assertUuid, requireAdmin } from "@/lib/admin-guard";
import * as repo from "@/lib/items-repo";
import {
  ITEM_SCOPES,
  ITEM_STATUSES,
  ITEM_TYPES,
  STORAGE_ZONES,
  isValidCode,
  normaliseCode,
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

/* ---------------------------------------------------------------- actions */

export async function createItemAction(input: ItemFormInput): Promise<string> {
  await requireEditor();
  const item = await repo.createItem(toDraft(input), AUTHOR);
  revalidatePath("/operations/items");
  return item.code;
}

export async function updateItemAction(
  id: string,
  input: ItemFormInput,
  summary: string,
): Promise<string> {
  await requireEditor();
  assertUuid(id, "Item");
  const item = await repo.updateItem(
    id,
    toDraft(input),
    AUTHOR,
    assertText(summary, "Change note", { max: 200 }) || "Edited",
  );
  revalidatePath("/operations/items");
  revalidatePath(`/operations/items/${item.code}`);
  return item.code;
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
  revalidatePath("/operations/items");
}

export async function updateComponentAction(
  id: string,
  patch: { quantity?: string; basis?: string; note?: string },
): Promise<void> {
  await requireEditor();
  assertUuid(id, "Component");
  await repo.updateComponent(id, {
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
  revalidatePath("/operations/items");
}

export async function removeComponentAction(id: string): Promise<void> {
  await requireEditor();
  assertUuid(id, "Component");
  await repo.removeComponent(id);
  revalidatePath("/operations/items");
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
