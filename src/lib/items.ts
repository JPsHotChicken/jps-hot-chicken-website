/**
 * The items database: types, unit maths, and cost roll-up.
 *
 * Everything physical in the operation is an `Item` with a permanent `code`.
 * Assembled items — prepped batches, menu items, modifiers — hold no ingredient
 * text of their own; they point at other items through `components`, which is
 * what lets one supplier price entered once ripple up through every recipe
 * built on it.
 *
 * This is also the ingredient list the menu description generator writes from:
 * an item carries how it tastes and how it eats alongside what it costs, so a
 * thing bought, costed and described is one record rather than three.
 *
 * Nothing in here touches the database. The repo loads rows, this works out
 * what they mean, and the components render it.
 */

import {
  GenerationError,
  GenerationFormatError,
  boundedInteger,
  clip,
  optionalNumber,
  readReplyObject,
  stringList,
} from "@/lib/model-reply";

/* --------------------------------------------------------------- vocabulary */

export type ItemType =
  | "raw"
  | "prepped"
  | "menu"
  | "modifier"
  | "packaging"
  | "chemical"
  | "smallware"
  | "marketing";

export type ItemStatus = "active" | "seasonal" | "regional" | "test" | "discontinued";
export type ItemScope = "core" | "optional" | "regional";
export type StorageZone = "none" | "dry" | "refrigerated" | "frozen";
export type UnitBasis = "stock" | "portion";

export const ITEM_TYPES: ItemType[] = [
  "raw",
  "prepped",
  "menu",
  "modifier",
  "packaging",
  "chemical",
  "smallware",
  "marketing",
];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  raw: "Raw / purchased",
  prepped: "Prepped / sub-recipe",
  menu: "Menu item",
  modifier: "Modifier / add-on",
  packaging: "Packaging",
  chemical: "Chemical / cleaning",
  smallware: "Smallware / equipment",
  marketing: "Marketing / POS",
};

/** The prefix a new item's code is generated from, per type. */
export const ITEM_TYPE_PREFIX: Record<ItemType, string> = {
  raw: "RAW",
  prepped: "PRP",
  menu: "MNU",
  modifier: "MOD",
  packaging: "PKG",
  chemical: "CHM",
  smallware: "SMW",
  marketing: "MKT",
};

export const ITEM_STATUSES: ItemStatus[] = [
  "active",
  "seasonal",
  "regional",
  "test",
  "discontinued",
];

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  active: "Active",
  seasonal: "Seasonal",
  regional: "Regional",
  test: "Test",
  discontinued: "Discontinued",
};

export const ITEM_SCOPES: ItemScope[] = ["core", "optional", "regional"];

export const ITEM_SCOPE_LABELS: Record<ItemScope, string> = {
  core: "Core — brand standard",
  optional: "Approved optional",
  regional: "Regional variant",
};

export const STORAGE_ZONES: StorageZone[] = ["none", "dry", "refrigerated", "frozen"];

export const STORAGE_ZONE_LABELS: Record<StorageZone, string> = {
  none: "Not set",
  dry: "Dry",
  refrigerated: "Refrigerated",
  frozen: "Frozen",
};

/**
 * The FDA's nine major allergens, plus the marker below.
 *
 * An empty allergen list is ambiguous — it reads the same whether an item has
 * been checked and cleared or never checked at all. `None` is how "checked,
 * contains nothing" is said out loud, which is what makes the missing-data flag
 * mean something.
 */
export const ALLERGEN_NONE = "None";

export const ALLERGENS = [
  ALLERGEN_NONE,
  "Milk",
  "Egg",
  "Fish",
  "Shellfish",
  "Tree nuts",
  "Peanuts",
  "Wheat",
  "Soy",
  "Sesame",
];

/* ------------------------------------------------------------ how it tastes */

/**
 * What the menu description generator reads off an item. Fixed lists by design:
 * adding a flavour is a code change, not a settings screen, because every
 * description ever written was weighed against these same words.
 */

export const FLAVOR_TAGS = [
  "sweet",
  "salty",
  "sour",
  "bitter",
  "umami",
  "spicy",
  "smoky",
  "tangy",
  "herbal",
  "garlicky",
  "oniony",
  "creamy",
  "nutty",
  "earthy",
  "citrusy",
  "buttery",
  "fermented",
  "charred",
  "peppery",
] as const;

export const TEXTURE_TAGS = [
  "crispy",
  "crunchy",
  "creamy",
  "tender",
  "juicy",
  "chewy",
  "flaky",
  "soft",
  "firm",
  "silky",
  "crumbly",
] as const;

export type FlavorTag = (typeof FLAVOR_TAGS)[number];
export type TextureTag = (typeof TEXTURE_TAGS)[number];

/** How loudly an item reads in a dish: 1 barely there, 5 dominates. */
export const MAX_INTENSITY = 5;
export const DEFAULT_INTENSITY = 3;

/** Keep only values that are on `allowed`, in the vocabulary's own order. */
export function pickFrom<T extends string>(values: readonly string[], allowed: readonly T[]): T[] {
  const chosen = new Set(values);
  return allowed.filter((value) => chosen.has(value));
}

/* -------------------------------------------------------------------- shapes */

export type Item = {
  id: string;
  code: string;
  type: ItemType;
  internalName: string;
  customerName: string;
  aliases: string[];
  category: string;
  subcategory: string;
  status: ItemStatus;

  purchaseUnit: string;
  packSize: string;
  purchaseCost: number | null;
  parLevel: number | null;
  reorderPoint: number | null;

  stockUnit: string;
  portionUnit: string;
  stockPerPurchaseUnit: number | null;
  portionsPerStockUnit: number | null;
  yieldFactor: number;

  batchYieldQuantity: number;
  recipeUrl: string;

  menuPrice: number | null;

  allergens: string[];
  flavorTags: FlavorTag[];
  textureTags: TextureTag[];
  intensity: number;
  storageZone: StorageZone;
  storageTemp: string;
  shelfLifeDays: number | null;
  dateLabelRule: string;
  nutrition: Record<string, number | string>;

  photoUrl: string;
  sopLinks: SopLink[];

  notes: string;

  scope: ItemScope;
  availableEverywhere: boolean;

  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
};

export type SopLink = { label: string; url: string };

/** One edge of the bill of materials, as it hangs off its parent. */
export type Component = {
  id: string;
  componentId: string;
  quantity: number;
  basis: UnitBasis;
  sortOrder: number;
  note: string;
};

export type Supplier = {
  id: string;
  name: string;
  accountNumber: string;
  contact: string;
  notes: string;
  active: boolean;
};

export type ItemSupplier = {
  id: string;
  supplierId: string;
  supplierName: string;
  supplierPartNumber: string;
  purchaseUnit: string;
  packSize: string;
  cost: number | null;
  isPrimary: boolean;
  approved: boolean;
};

export type Location = {
  id: string;
  code: string;
  name: string;
  region: string;
  active: boolean;
};

export type Revision = {
  id: string;
  version: number;
  changedAt: string;
  changedBy: string;
  summary: string;
};

/** Everything the catalogue holds, as the cost roll-up needs to see it. */
export type ItemGraph = {
  items: Item[];
  /** The same items keyed by id, built once rather than per lookup. */
  byId: Map<string, Item>;
  /** Components keyed by their parent's item id. */
  components: Map<string, Component[]>;
  /** Parents keyed by the id of a component they use — the "where used" index. */
  parents: Map<string, string[]>;
};

/**
 * Index the catalogue for the walks below.
 *
 * Both directions are built up front: down through `components` for costing and
 * "what's in it", up through `parents` for "where used". Inverting the edges on
 * demand would mean walking every component of every item once per question
 * asked, which at a few thousand items is the difference between a page that
 * opens and one that thinks about it.
 */
export function buildGraph(items: Item[], components: Map<string, Component[]>): ItemGraph {
  const parents = new Map<string, string[]>();
  for (const [parentId, parts] of components) {
    for (const part of parts) {
      const list = parents.get(part.componentId);
      if (list) list.push(parentId);
      else parents.set(part.componentId, [parentId]);
    }
  }
  return { items, byId: indexById(items), components, parents };
}

/* ------------------------------------------------------------- field groups */

/**
 * Which groups of fields apply to which type of item. This is the whole of
 * "the type of an item determines which field groups apply" — the editor draws
 * from it, and so does the completeness check, so the two can never disagree
 * about whether a missing field matters.
 */
export type FieldGroup =
  | "purchasing"
  | "units"
  | "recipe"
  | "taste"
  | "allergens"
  | "storage"
  | "menu"
  | "assets";

export const FIELD_GROUPS: Record<ItemType, FieldGroup[]> = {
  raw: ["purchasing", "units", "taste", "allergens", "storage", "assets"],
  prepped: ["units", "recipe", "taste", "allergens", "storage", "assets"],
  menu: ["recipe", "taste", "allergens", "menu", "assets"],
  modifier: ["recipe", "taste", "allergens", "menu", "assets"],
  packaging: ["purchasing", "units", "assets"],
  chemical: ["purchasing", "units", "storage", "assets"],
  smallware: ["purchasing", "assets"],
  marketing: ["purchasing", "assets"],
};

export const FIELD_GROUP_LABELS: Record<FieldGroup, string> = {
  purchasing: "Purchasing",
  units: "Units & conversions",
  recipe: "What's in it",
  taste: "Taste & texture",
  allergens: "Allergens",
  storage: "Storage & shelf life",
  menu: "Menu",
  assets: "Reference",
};

export const hasGroup = (type: ItemType, group: FieldGroup): boolean =>
  FIELD_GROUPS[type].includes(group);

/** Items that get bought, counted, portioned and costed. */
export const isConsumable = (type: ItemType): boolean =>
  type === "raw" || type === "prepped" || type === "menu" || type === "modifier";

/** Items built by reference from other items rather than bought. */
export const isAssembled = (type: ItemType): boolean => hasGroup(type, "recipe");

/**
 * Whether an item may go on a line of a menu description recipe.
 *
 * Looser than `canBeComponent`, deliberately: describing what a dish tastes
 * like needs no unit conversion, so an item nobody has costed yet can still be
 * written about. A discontinued item is left out — it isn't in anything now.
 */
export const canBeIngredient = (item: Item): boolean =>
  isConsumable(item.type) && item.status !== "discontinued";

/* ------------------------------------------------------------------ costing */

export type CostLine = {
  /** The edge's own id, so a row can be edited or removed. */
  id: string;
  componentId: string;
  code: string;
  name: string;
  quantity: number;
  basis: UnitBasis;
  unitLabel: string;
  /** The quantity converted into the component's stock unit. */
  stockQuantity: number | null;
  /** What one stock unit of the component costs. */
  unitCost: number | null;
  lineCost: number | null;
  note: string;
};

export type ItemCost = {
  /** Cost of one stock unit — null when anything underneath is unknown. */
  perStockUnit: number | null;
  /** Cost of one whole build or batch. */
  perBatch: number | null;
  /** Cost of one portion, where a portion conversion exists. */
  perPortion: number | null;
  lines: CostLine[];
  /** Codes of items at or below this one whose cost could not be worked out. */
  missing: string[];
};

const EMPTY_COST: ItemCost = {
  perStockUnit: null,
  perBatch: null,
  perPortion: null,
  lines: [],
  missing: [],
};

/** Index a flat list of items by id. */
export function indexById(items: Item[]): Map<string, Item> {
  return new Map(items.map((item) => [item.id, item]));
}

/**
 * Convert a component quantity into the component's stock unit.
 *
 * A recipe that calls for "2 slices" of an item counted in pounds is the case
 * this exists for: the portion conversion on the component turns the slices
 * into pounds so the costing never asks anybody to do it by hand.
 */
export function toStockQuantity(quantity: number, basis: UnitBasis, component: Item): number | null {
  if (basis === "stock") return quantity;
  const per = component.portionsPerStockUnit;
  if (!per || per <= 0) return null;
  return quantity / per;
}

/**
 * What one stock unit of a purchased item costs, after pack size and yield.
 *
 * A case costing $24 that breaks down into 6 usable pounds is $4 a pound; if a
 * fifth of it is trimmed away, the usable pound costs $5.
 */
export function purchasedUnitCost(item: Item): number | null {
  const { purchaseCost, stockPerPurchaseUnit, yieldFactor } = item;
  if (purchaseCost === null || !stockPerPurchaseUnit || stockPerPurchaseUnit <= 0) return null;
  if (!yieldFactor || yieldFactor <= 0) return null;
  return purchaseCost / stockPerPurchaseUnit / yieldFactor;
}

/**
 * Roll a cost up through every layer beneath an item.
 *
 * Assembled items are costed from their components' costs, which are costed
 * from theirs, all the way down to purchased goods. Anything unknown stays
 * `null` rather than being counted as zero — a recipe missing one price should
 * read as "we don't know yet", never as a confidently wrong number.
 *
 * `seen` carries the ids on the current path. The database rejects loops, but a
 * roll-up that trusted that and was wrong would recurse forever.
 */
export function costOf(itemId: string, graph: ItemGraph): ItemCost {
  return costWithIndex(itemId, graph.byId, graph.components, new Set(), new Map());
}

/**
 * Every item's cost in one pass.
 *
 * The list page needs a cost per row, and costing each one separately would
 * re-walk the shared layers underneath them over and over. One memo across the
 * whole catalogue means each item is costed once however many recipes use it.
 */
export function costAll(graph: ItemGraph): Map<string, ItemCost> {
  const memo = new Map<string, ItemCost>();
  const costs = new Map<string, ItemCost>();
  for (const item of graph.items) {
    costs.set(item.id, costWithIndex(item.id, graph.byId, graph.components, new Set(), memo));
  }
  return costs;
}

function costWithIndex(
  itemId: string,
  byId: Map<string, Item>,
  components: Map<string, Component[]>,
  seen: Set<string>,
  memo: Map<string, ItemCost>,
): ItemCost {
  const cached = memo.get(itemId);
  if (cached) return cached;

  const item = byId.get(itemId);
  if (!item) return EMPTY_COST;

  // A loop can only mean corrupt data, and costing it is meaningless.
  if (seen.has(itemId)) return { ...EMPTY_COST, missing: [item.code] };

  const parts = components.get(itemId) ?? [];

  if (parts.length === 0) {
    const unit = purchasedUnitCost(item);
    const result: ItemCost = {
      perStockUnit: unit,
      perBatch: unit,
      perPortion: perPortion(unit, item),
      lines: [],
      missing: unit === null ? [item.code] : [],
    };
    memo.set(itemId, result);
    return result;
  }

  const nextSeen = new Set(seen).add(itemId);
  const lines: CostLine[] = [];
  const missing = new Set<string>();
  let batch = 0;
  let known = true;

  for (const part of parts) {
    const component = byId.get(part.componentId);
    if (!component) {
      known = false;
      continue;
    }

    const below = costWithIndex(part.componentId, byId, components, nextSeen, memo);
    for (const code of below.missing) missing.add(code);

    const stockQuantity = toStockQuantity(part.quantity, part.basis, component);
    const unitCost = below.perStockUnit;
    const lineCost =
      stockQuantity === null || unitCost === null ? null : stockQuantity * unitCost;

    if (lineCost === null) {
      known = false;
      // A portion quantity with no portion conversion is itself the gap.
      if (stockQuantity === null) missing.add(component.code);
    } else {
      batch += lineCost;
    }

    lines.push({
      id: part.id,
      componentId: part.componentId,
      code: component.code,
      name: component.internalName,
      quantity: part.quantity,
      basis: part.basis,
      unitLabel: unitLabelFor(component, part.basis),
      stockQuantity,
      unitCost,
      lineCost,
      note: part.note,
    });
  }

  // A batch yield of 4 quarts means the batch cost divides four ways.
  const divisor = item.batchYieldQuantity > 0 ? item.batchYieldQuantity : 1;
  const loss = item.yieldFactor > 0 ? item.yieldFactor : 1;
  const perStockUnit = known ? batch / divisor / loss : null;

  const result: ItemCost = {
    perStockUnit,
    perBatch: known ? batch : null,
    perPortion: perPortion(perStockUnit, item),
    lines,
    missing: [...missing],
  };
  memo.set(itemId, result);
  return result;
}

function perPortion(perStockUnit: number | null, item: Item): number | null {
  if (perStockUnit === null) return null;
  const per = item.portionsPerStockUnit;
  if (!per || per <= 0) return null;
  return perStockUnit / per;
}

/** The unit a component quantity is counted in, for display beside the number. */
export function unitLabelFor(component: Item, basis: UnitBasis): string {
  const unit = basis === "portion" ? component.portionUnit : component.stockUnit;
  return unit || (basis === "portion" ? "portion" : "unit");
}

/**
 * Cost as a share of menu price. Null unless both numbers are known — the
 * headline number an operator actually watches.
 */
export function foodCostPercent(cost: number | null, menuPrice: number | null): number | null {
  if (cost === null || menuPrice === null || menuPrice <= 0) return null;
  return cost / menuPrice;
}

/* -------------------------------------------------------------- where used */

/**
 * Every item that is built from `itemId`, however many layers up.
 *
 * A price change on a raw good is only as useful as the answer to "so what does
 * that move?" — this is that answer.
 */
export function whereUsed(itemId: string, graph: ItemGraph): Item[] {
  const found = new Set<string>();
  const queue = [itemId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const parentId of graph.parents.get(current) ?? []) {
      if (found.has(parentId)) continue;
      found.add(parentId);
      queue.push(parentId);
    }
  }

  return [...found]
    .map((id) => graph.byId.get(id))
    .filter((item): item is Item => item !== undefined)
    .sort(compareItems);
}

/** Whether anything references this item directly — the deletion guard. */
export const isReferenced = (itemId: string, graph: ItemGraph): boolean =>
  (graph.parents.get(itemId) ?? []).length > 0;

/* ------------------------------------------------------------ completeness */

export type Gap = { field: string; message: string };

/**
 * What is missing from a record before it can be trusted in a recipe or on a
 * cost sheet. Only fields the item's own type calls for are checked, so a
 * thermometer is never nagged about allergens.
 */
export function gapsIn(item: Item, componentCount: number): Gap[] {
  const gaps: Gap[] = [];
  const groups = FIELD_GROUPS[item.type];

  if (!item.code.trim()) gaps.push({ field: "code", message: "No item code" });
  if (!item.internalName.trim()) gaps.push({ field: "internalName", message: "No internal name" });
  if (!item.category.trim()) gaps.push({ field: "category", message: "No category" });

  if (groups.includes("purchasing")) {
    if (!item.purchaseUnit.trim())
      gaps.push({ field: "purchaseUnit", message: "No purchase unit" });
    if (item.purchaseCost === null)
      gaps.push({ field: "purchaseCost", message: "No purchase cost" });
  }

  if (groups.includes("units")) {
    if (!item.stockUnit.trim()) gaps.push({ field: "stockUnit", message: "No stock unit" });
    if (groups.includes("purchasing") && !item.stockPerPurchaseUnit) {
      gaps.push({
        field: "stockPerPurchaseUnit",
        message: "No purchase → stock conversion",
      });
    }
  }

  if (groups.includes("recipe") && componentCount === 0) {
    gaps.push({ field: "components", message: "Nothing in it yet" });
  }

  if (groups.includes("allergens") && item.allergens.length === 0) {
    gaps.push({ field: "allergens", message: "Allergens not reviewed" });
  }

  if (groups.includes("storage") && item.storageZone === "none") {
    gaps.push({ field: "storageZone", message: "No storage zone" });
  }

  if (groups.includes("menu") && item.menuPrice === null && item.type === "menu") {
    gaps.push({ field: "menuPrice", message: "No menu price" });
  }

  return gaps;
}

/**
 * Whether an item may be used as a component of something else. The spec's rule
 * is that unit conversions must be complete before a recipe can reference it —
 * without them there is no way to cost or count what a recipe takes.
 */
export function canBeComponent(item: Item): boolean {
  if (!isConsumable(item.type) && item.type !== "packaging") return false;
  return Boolean(item.stockUnit.trim());
}

/* ---------------------------------------------------------------- searching */

export type ItemFilters = {
  query: string;
  type: ItemType | "all";
  status: ItemStatus | "all";
  category: string | "all";
  allergen: string | "all";
  storageZone: StorageZone | "all";
  scope: ItemScope | "all";
  incompleteOnly: boolean;
};

export const EMPTY_FILTERS: ItemFilters = {
  query: "",
  type: "all",
  status: "all",
  category: "all",
  allergen: "all",
  storageZone: "all",
  scope: "all",
  incompleteOnly: false,
};

/** Code, name, customer name and aliases all match — aliases are why they exist. */
export function matchesQuery(item: Item, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [item.code, item.internalName, item.customerName, ...item.aliases]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function filterItems(
  items: Item[],
  filters: ItemFilters,
  gapCount: (item: Item) => number,
): Item[] {
  return items.filter((item) => {
    if (!matchesQuery(item, filters.query)) return false;
    if (filters.type !== "all" && item.type !== filters.type) return false;
    if (filters.status !== "all" && item.status !== filters.status) return false;
    if (filters.scope !== "all" && item.scope !== filters.scope) return false;
    if (filters.category !== "all" && item.category !== filters.category) return false;
    if (filters.storageZone !== "all" && item.storageZone !== filters.storageZone) return false;
    if (filters.allergen !== "all" && !item.allergens.includes(filters.allergen)) return false;
    if (filters.incompleteOnly && gapCount(item) === 0) return false;
    return true;
  });
}

/** Grouped by type, then by code, which is how the catalogue reads on screen. */
export function compareItems(a: Item, b: Item): number {
  const byType = ITEM_TYPES.indexOf(a.type) - ITEM_TYPES.indexOf(b.type);
  if (byType !== 0) return byType;
  return a.code.localeCompare(b.code, undefined, { numeric: true });
}

/* --------------------------------------------------------------- formatting */

export function formatMoney(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Costs per unit are often fractions of a cent, so they get more places. */
export const formatUnitCost = (value: number | null): string => formatMoney(value, 4);

export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

export function formatQuantity(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  // Trailing zeroes on a recipe quantity are noise: 2 not 2.0000.
  return String(Number(value.toFixed(4)));
}

/**
 * The next code for a type — the highest number already used, plus one.
 *
 * Codes are never reused, so this reads the maximum rather than filling gaps
 * left by discontinued items.
 */
export function nextCode(type: ItemType, existing: string[]): string {
  const prefix = ITEM_TYPE_PREFIX[type];
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, "i");
  const highest = existing.reduce((max, code) => {
    const match = pattern.exec(code.trim());
    if (!match) return max;
    return Math.max(max, Number(match[1]));
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(4, "0")}`;
}

/** Codes are compared and stored case-insensitively; this is the canonical form. */
export const normaliseCode = (code: string): string =>
  code.trim().toUpperCase().replace(/\s+/g, "-");

export function isValidCode(code: string): boolean {
  return /^[A-Z0-9][A-Z0-9-]{1,31}$/.test(normaliseCode(code));
}

/* ----------------------------------------------------- reading a spec sheet */

/**
 * What the model read off a supplier's spec sheet, label or product photo.
 *
 * Only fields a document can actually answer. Par levels, menu price, yield
 * after trim and where the item is sold are decisions about this operation, not
 * facts about the product, so they are never guessed at — the form leaves them
 * alone for somebody to set.
 */
export type ItemSheetFields = {
  type: ItemType;
  internalName: string;
  customerName: string;
  aliases: string[];
  category: string;
  subcategory: string;

  purchaseUnit: string;
  packSize: string;
  purchaseCost: number | null;

  stockUnit: string;
  portionUnit: string;
  stockPerPurchaseUnit: number | null;
  portionsPerStockUnit: number | null;

  allergens: string[];
  flavorTags: FlavorTag[];
  textureTags: TextureTag[];
  intensity: number;

  storageZone: StorageZone;
  storageTemp: string;
  shelfLifeDays: number | null;
  dateLabelRule: string;

  notes: string;
};

export type ItemSheetReading = {
  fields: ItemSheetFields;
  /**
   * "May contain" and shared-equipment warnings. Shown to the owner but never
   * saved: the allergen list means "contains", and a warning quietly folded
   * into it would make every allergen matrix built on this item wrong.
   */
  crossContact: string;
};

/** Raised when the file isn't a product's spec sheet, label or photo. */
export class NotAProductSheetError extends GenerationError {
  constructor() {
    super("That file doesn't look like a product's spec sheet, label or photo.");
    this.name = "NotAProductSheetError";
  }
}

/**
 * Parse and check what the model read off a sheet.
 *
 * Every value is forced back onto the lists the record accepts, so the form
 * never opens holding something it can't save. A category that matches one
 * already in use is snapped to that spelling — "produce" typed into a
 * catalogue full of "Produce" would otherwise quietly split the filter in two.
 */
export function parseItemSheet(text: string, categories: readonly string[]): ItemSheetReading {
  const reply = readReplyObject(text);
  if (reply.is_product === false) throw new NotAProductSheetError();

  const internalName = clip(reply.internal_name, 120);
  if (!internalName) throw new GenerationFormatError("internal_name is missing");

  const list = (field: string): string[] => {
    const value = reply[field];
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === "string");
  };

  const category = clip(reply.category, 60);
  const known = categories.find((existing) => existing.toLowerCase() === category.toLowerCase());

  const allergens = pickFrom(list("allergens"), ALLERGENS);

  return {
    fields: {
      type: (ITEM_TYPES as string[]).includes(String(reply.type))
        ? (reply.type as ItemType)
        : "raw",
      internalName,
      customerName: clip(reply.customer_name, 120),
      aliases: stringList(reply.aliases, "aliases", 5).map((alias) => alias.slice(0, 60)),
      category: known ?? category,
      subcategory: clip(reply.subcategory, 60),

      purchaseUnit: clip(reply.purchase_unit, 40),
      packSize: clip(reply.pack_size, 40),
      purchaseCost: optionalNumber(reply.purchase_cost, { max: 100_000, places: 2 }),

      stockUnit: clip(reply.stock_unit, 40),
      portionUnit: clip(reply.portion_unit, 40),
      stockPerPurchaseUnit: optionalNumber(reply.stock_per_purchase_unit, { min: 0.0001 }),
      portionsPerStockUnit: optionalNumber(reply.portions_per_stock_unit, { min: 0.0001 }),

      // "None" is a claim of its own — kept only when it stands alone.
      allergens: allergens.length > 1 ? allergens.filter((name) => name !== ALLERGEN_NONE) : allergens,
      flavorTags: pickFrom(list("flavor_tags"), FLAVOR_TAGS),
      textureTags: pickFrom(list("texture_tags"), TEXTURE_TAGS),
      intensity: boundedInteger(reply.intensity, 1, MAX_INTENSITY, DEFAULT_INTENSITY),

      storageZone: (STORAGE_ZONES as string[]).includes(String(reply.storage_zone))
        ? (reply.storage_zone as StorageZone)
        : "none",
      storageTemp: clip(reply.storage_temp, 60),
      shelfLifeDays: (() => {
        const days = optionalNumber(reply.shelf_life_days, { min: 1, max: 3650, places: 0 });
        return days === null ? null : Math.round(days);
      })(),
      dateLabelRule: clip(reply.date_label_rule, 200),

      notes: clip(reply.notes, 2000),
    },
    crossContact: clip(reply.cross_contact, 300),
  };
}

/* ------------------------------------------------------------- list rows */

/** One line of the catalogue list, with everything the row needs precomputed. */
export type CatalogueRow = {
  item: Item;
  unitCost: number | null;
  gaps: number;
  /** How many items are built from this one, at any depth. */
  usedBy: number;
  componentCount: number;
};

/**
 * The whole catalogue as rows, costed and checked in one pass.
 *
 * Doing this once on the server keeps the browser from re-walking the graph on
 * every keystroke in the search box — filtering then only reads numbers that
 * are already worked out.
 */
export function catalogueRows(graph: ItemGraph): CatalogueRow[] {
  const costs = costAll(graph);
  return graph.items
    .map((item) => {
      const componentCount = (graph.components.get(item.id) ?? []).length;
      return {
        item,
        unitCost: costs.get(item.id)?.perStockUnit ?? null,
        gaps: gapsIn(item, componentCount).length,
        usedBy: whereUsed(item.id, graph).length,
        componentCount,
      };
    })
    .sort((a, b) => compareItems(a.item, b.item));
}

/** Every category in use, for the filter menu. */
export function categoriesOf(items: Item[]): string[] {
  return [...new Set(items.map((item) => item.category.trim()).filter(Boolean))].sort();
}
