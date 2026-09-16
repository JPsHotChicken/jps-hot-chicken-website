/**
 * Allergen lookup: what every dish and ingredient contains, rolled up from the
 * bottom.
 *
 * Allergens are only ever recorded where they are true — on the case of flour,
 * the bun, the mayonnaise. Everything built on top inherits them: a dredge made
 * from flour contains wheat, and so does every menu item that uses the dredge,
 * however many layers up. Nothing above the bottom layer has to be told.
 *
 * Two things can be built from items, and both are walked: an assembled item in
 * the catalogue (its `components`), and a recipe from the menu description
 * generator (its lines, which point at items or at other recipes). A dish that
 * exists as both under one name is shown once, carrying everything either
 * record says it contains — for allergens, over-reporting is the safe mistake.
 *
 * Nothing in here touches the database, so every rule is testable with plain
 * objects.
 */

import { ALLERGEN_NONE, hasGroup, type Item, type ItemGraph } from "@/lib/items";
import { ALLERGENS, type Recipe } from "@/lib/menu-descriptions";

/* -------------------------------------------------------------------- shapes */

/** Where an entry sits, which is how the lookup groups its results. */
export type EntryKind = "menu" | "addon" | "prep" | "ingredient";

export const ENTRY_KINDS: EntryKind[] = ["menu", "addon", "prep", "ingredient"];

export const ENTRY_KIND_LABELS: Record<EntryKind, string> = {
  menu: "Menu items",
  addon: "Add-ons",
  prep: "Prepped & sub-recipes",
  ingredient: "Ingredients",
};

export type AllergenFinding = {
  allergen: string;
  /** The record lists it itself, rather than only inheriting it. */
  listed: boolean;
  /** Each route it arrives by from inside, e.g. "Dredge → All-purpose flour". */
  via: string[];
};

export type LookupEntry = {
  key: string;
  name: string;
  /** The item's code, for linking to its record. Null for a recipe, which has none. */
  code: string | null;
  kind: EntryKind;
  /** In the allergen vocabulary's order. */
  allergens: AllergenFinding[];
  /**
   * Things in it, itself included, that nobody has recorded allergens for. An
   * entry with anything here can't be called free of an allergen yet.
   */
  unchecked: string[];
};

/* --------------------------------------------------------------------- walks */

type Found = Map<string, { listed: boolean; via: string[] }>;

type Rollup = { found: Found; unchecked: string[] };

function finding(found: Found, allergen: string) {
  let entry = found.get(allergen);
  if (!entry) {
    entry = { listed: false, via: [] };
    found.set(allergen, entry);
  }
  return entry;
}

/** Fold what a part contains into its parent, naming the part on each route. */
function absorb(into: Rollup, part: Rollup, partName: string) {
  for (const [allergen, below] of part.found) {
    const entry = finding(into.found, allergen);
    const routes = [
      ...(below.listed ? [partName] : []),
      ...below.via.map((route) => `${partName} → ${route}`),
    ];
    for (const route of routes) if (!entry.via.includes(route)) entry.via.push(route);
  }
  for (const name of part.unchecked) if (!into.unchecked.includes(name)) into.unchecked.push(name);
}

/**
 * Nothing recorded and nothing to inherit from. An item built from components
 * with an empty list of its own isn't a gap — its components answer for it.
 */
const isUnchecked = (item: Item, partCount: number) =>
  hasGroup(item.type, "allergens") && item.allergens.length === 0 && partCount === 0;

/**
 * Walks both kinds of tree with one memo each, so a sauce used in twenty dishes
 * is worked out once. `stack` holds the ids on the current path: the database
 * rejects loops, but a walk that trusted that and was wrong would never end.
 */
function walker(graph: ItemGraph, recipes: Recipe[]) {
  const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const itemMemo = new Map<string, Rollup>();
  const recipeMemo = new Map<string, Rollup>();

  const item = (itemId: string, stack: Set<string>): Rollup => {
    const memo = itemMemo.get(itemId);
    if (memo) return memo;

    const rollup: Rollup = { found: new Map(), unchecked: [] };
    const record = graph.byId.get(itemId);
    if (!record) return rollup;

    for (const allergen of record.allergens) {
      if (allergen !== ALLERGEN_NONE) finding(rollup.found, allergen).listed = true;
    }

    const parts = graph.components.get(itemId) ?? [];
    for (const part of parts) {
      const child = graph.byId.get(part.componentId);
      if (!child || stack.has(child.id)) continue;
      absorb(rollup, item(child.id, new Set(stack).add(child.id)), child.internalName);
    }

    if (isUnchecked(record, parts.length)) rollup.unchecked.push(record.internalName);

    itemMemo.set(itemId, rollup);
    return rollup;
  };

  const recipe = (recipeId: string, stack: Set<string>): Rollup => {
    const memo = recipeMemo.get(recipeId);
    if (memo) return memo;

    const rollup: Rollup = { found: new Map(), unchecked: [] };
    const record = recipesById.get(recipeId);
    if (!record) return rollup;

    for (const line of record.components) {
      if (line.itemId) {
        const child = graph.byId.get(line.itemId);
        if (!child) continue;
        absorb(rollup, item(child.id, new Set([child.id])), child.internalName);
      } else if (line.childRecipeId && !stack.has(line.childRecipeId)) {
        const child = recipesById.get(line.childRecipeId);
        if (!child) continue;
        absorb(rollup, recipe(child.id, new Set(stack).add(child.id)), child.name);
      }
    }

    // A dish with nothing on it yet says nothing about what it contains.
    if (record.components.length === 0) rollup.unchecked.push(record.name);

    recipeMemo.set(recipeId, rollup);
    return rollup;
  };

  return {
    item: (itemId: string) => item(itemId, new Set([itemId])),
    recipe: (recipeId: string) => recipe(recipeId, new Set([recipeId])),
  };
}

/* ------------------------------------------------------------------ entries */

const ITEM_KIND: Partial<Record<Item["type"], EntryKind>> = {
  menu: "menu",
  modifier: "addon",
  prepped: "prep",
  raw: "ingredient",
};

/** Lower-cased with spaces collapsed, so "Fried  okra" and "Fried Okra" are one dish. */
const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

function toFindings(found: Found): AllergenFinding[] {
  return ALLERGENS.filter((allergen) => found.has(allergen)).map((allergen) => ({
    allergen,
    listed: found.get(allergen)!.listed,
    via: found.get(allergen)!.via,
  }));
}

/** Two records of one dish, as one entry holding everything either contains. */
function mergeEntries(a: LookupEntry, b: LookupEntry): LookupEntry {
  const found: Found = new Map();
  for (const entry of [a, b]) {
    for (const { allergen, listed, via } of entry.allergens) {
      const merged = finding(found, allergen);
      merged.listed ||= listed;
      for (const route of via) if (!merged.via.includes(route)) merged.via.push(route);
    }
  }
  return {
    ...a,
    code: a.code ?? b.code,
    allergens: toFindings(found),
    unchecked: [...new Set([...a.unchecked, ...b.unchecked])],
  };
}

/**
 * Everything the lookup can show, each with its allergens rolled up.
 *
 * Only things a guest could be served or a cook could reach for are entries —
 * packaging and chemicals carry no allergens, and a discontinued item isn't in
 * anything now. Discontinued items are still walked through, though: if a live
 * dish is built on one, what it contains still counts.
 */
export function buildAllergenLookup(graph: ItemGraph, recipes: Recipe[]): LookupEntry[] {
  const walk = walker(graph, recipes);
  const entries: LookupEntry[] = [];
  const dishes = new Map<string, number>();

  const add = (entry: LookupEntry) => {
    if (entry.kind !== "menu") {
      entries.push(entry);
      return;
    }
    const key = nameKey(entry.name);
    const at = dishes.get(key);
    if (at === undefined) {
      dishes.set(key, entries.length);
      entries.push(entry);
    } else {
      entries[at] = mergeEntries(entries[at], entry);
    }
  };

  for (const item of graph.items) {
    const kind = ITEM_KIND[item.type];
    if (!kind || item.status === "discontinued") continue;
    const { found, unchecked } = walk.item(item.id);
    // A dish goes by what the guest calls it; everything else by what the kitchen does.
    const servedName = kind === "menu" || kind === "addon" ? item.customerName.trim() : "";
    add({
      key: `item:${item.id}`,
      name: servedName || item.internalName,
      code: item.code,
      kind,
      allergens: toFindings(found),
      unchecked: [...unchecked],
    });
  }

  for (const recipe of recipes) {
    const { found, unchecked } = walk.recipe(recipe.id);
    add({
      key: `recipe:${recipe.id}`,
      name: recipe.name,
      code: null,
      kind: recipe.isMenuItem ? "menu" : "prep",
      allergens: toFindings(found),
      unchecked: [...unchecked],
    });
  }

  return entries.sort(
    (a, b) =>
      ENTRY_KINDS.indexOf(a.kind) - ENTRY_KINDS.indexOf(b.kind) ||
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
  );
}

/** The allergens that turn up anywhere, in vocabulary order, with how many entries carry each. */
export function allergensPresent(entries: LookupEntry[]): { allergen: string; count: number }[] {
  return ALLERGENS.map((allergen) => ({
    allergen,
    count: entries.filter((entry) => contains(entry, allergen)).length,
  })).filter(({ count }) => count > 0);
}

export const contains = (entry: LookupEntry, allergen: string): boolean =>
  entry.allergens.some((found) => found.allergen === allergen);
