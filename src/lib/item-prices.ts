/**
 * Reading prices off a distributor invoice and working out which item each one
 * belongs to.
 *
 * The invoice already parses — `truck.ts` reads the same PFG CustomerFirst
 * export for the order history, and this reuses it rather than reading the file
 * a second way. What is new here is the join: an invoice names a product the
 * distributor's way ("CHICKEN TNDR JUMBO CLPPD CVP") and the catalogue names it
 * the kitchen's way ("Chicken tenderloin"), and nothing in either file says
 * they are the same thing.
 *
 * So the first import is guesswork, shown to the owner to confirm. Confirming
 * writes the product number onto the item's approved-supplier row, and every
 * import after that matches on the number instead — the guessing is only ever
 * done once per item.
 *
 * Nothing in here touches the database or React: the page parses the file in
 * the browser, the owner settles the matches, and only then does an action
 * write anything.
 */

import { parseInvoiceExport, type ParsedInvoice } from "@/lib/truck";
import { readPackSize, type Item } from "@/lib/items";

/* ------------------------------------------------------------ what was paid */

/** One product at the price an invoice charged for it. */
export type PricedProduct = {
  /** The distributor's own product number — the handle that makes it exact. */
  partNumber: string;
  /** The description as the invoice printed it. */
  description: string;
  brand: string;
  /** The distributor's pack description, e.g. "4/10 LB". */
  packSize: string;
  /** What one of these is bought by, spelled out: "case", "each". */
  purchaseUnit: string;
  /** Cost of one purchase unit. */
  cost: number;
  invoiceNumber: string;
  /** ISO date of the invoice this price came off. */
  invoiceDate: string;
};

export type PriceReading = {
  products: PricedProduct[];
  /** The branch that billed it, e.g. "Performance Foodservice Nashville". */
  supplier: string;
  /** How many invoices the file held — a month's download holds several. */
  invoiceCount: number;
  /** ISO dates of those invoices, newest first. */
  dates: string[];
  /** Credit lines passed over: a return is not what an item costs. */
  credits: number;
};

const EMPTY_READING: PriceReading = {
  products: [],
  supplier: "",
  invoiceCount: 0,
  dates: [],
  credits: 0,
};

/**
 * Every product on an invoice export, at the newest price the file carries.
 *
 * A download of several months lists the same case a dozen times. Only the most
 * recent price is worth putting on a record, so the newest invoice wins — and
 * within one date, the later line, since the file is read in order.
 *
 * Lines with no price and lines with no product number are dropped: the first
 * has nothing to fill in, and the second can't be matched again next month,
 * which is the point of the exercise.
 */
export function readPrices(csv: string): PriceReading {
  const { invoices, credits } = parseInvoiceExport(csv);
  if (invoices.length === 0) return { ...EMPTY_READING, credits };

  const newest = new Map<string, PricedProduct>();

  for (const invoice of invoices) {
    for (const line of invoice.lines) {
      const partNumber = line.item.supplierItemCode.trim();
      if (!partNumber || line.unitPrice === null) continue;

      const product: PricedProduct = {
        partNumber,
        description: line.item.name,
        brand: line.item.brand,
        packSize: line.item.packSize,
        purchaseUnit: line.item.unit,
        cost: line.unitPrice,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
      };

      const held = newest.get(partNumber);
      if (!held || held.invoiceDate <= product.invoiceDate) newest.set(partNumber, product);
    }
  }

  return {
    products: [...newest.values()].sort((a, b) => a.description.localeCompare(b.description)),
    supplier: invoices[0].supplier,
    invoiceCount: invoices.length,
    dates: invoiceDates(invoices),
    credits,
  };
}

const invoiceDates = (invoices: ParsedInvoice[]): string[] =>
  [...new Set(invoices.map((invoice) => invoice.invoiceDate))].sort().reverse();

/**
 * Which kind of file this is, so a page can say "that isn't an invoice export"
 * before it says "no prices found". The invoice reader is shared with the truck
 * order page, and so is this.
 */
export { detectImportKind } from "@/lib/truck";

/* -------------------------------------------------------------- the wording */

/**
 * Distributor shorthand, spelled out.
 *
 * PFG prints descriptions into a fixed-width field, so every word that can be
 * squeezed is: "CHICKEN BRST 7 OZ B/S DBL CVP" is a double-lobe boneless
 * skinless breast. None of it matches a catalogue name until it is expanded,
 * and expanding is what turns "TNDR" into something "tenderloin" can be
 * compared against.
 *
 * An abbreviation may open out into several words — "B/S" is two — so the
 * values are phrases, not words. Anything not listed is left as it was, which
 * is why an unfamiliar export still matches on the words it spells out in full.
 */
const ABBREVIATIONS: Record<string, string> = {
  ap: "all purpose",
  aptz: "appetizer",
  bbq: "barbecue",
  blchd: "bleached",
  blk: "black",
  bnls: "boneless",
  brd: "breaded",
  brst: "breast",
  bs: "boneless skinless",
  ched: "cheddar",
  chkn: "chicken",
  chsc: "cheesecake",
  clppd: "clipped",
  conc: "concentrate",
  cont: "container",
  dbl: "double",
  fcy: "fancy",
  fil: "fillet",
  flt: "fillet",
  frsh: "fresh",
  grn: "green",
  hngd: "hinged",
  hvy: "heavy",
  jlpno: "jalapeno",
  mayo: "mayonnaise",
  orgnl: "original",
  qrtr: "quarter",
  reg: "regular",
  rst: "roasted",
  seasnd: "seasoned",
  shred: "shredded",
  skns: "skinless",
  sknls: "skinless",
  slcd: "sliced",
  slcs: "slices",
  stfd: "stuffed",
  thgh: "thigh",
  tndr: "tender",
  veg: "vegetable",
  whl: "whole",
  whi: "white",
  wht: "white",
};

/**
 * Words that say nothing about what a thing is.
 *
 * Units, pack codes and the distributor's own markers — "CVP" is their vacuum
 * packaging, "CS" is a case. Left in, they are tokens that can never match a
 * catalogue name, which drags every score down by the same amount and makes the
 * threshold below meaningless.
 */
const NOISE = new Set([
  "bag",
  "box",
  "bx",
  "ca",
  "can",
  "cn",
  "ct",
  "cs",
  "cvp",
  "ea",
  "fp",
  "ga",
  "gal",
  "gf",
  "hd",
  "in",
  "jg",
  "lb",
  "lbs",
  "oz",
  "packer",
  "pk",
  "qt",
  "rl",
  "style",
  "tu",
  "usa",
]);

/**
 * A name reduced to the words worth comparing.
 *
 * Punctuation becomes spaces rather than nothing, so "B/S" splits and
 * "all-purpose" becomes two words that can each be matched. Numbers and
 * dimensions go: "7 OZ", "9X6.5X3" and "375-425" describe a pack, not a
 * product, and two unrelated cases share them often enough to matter.
 */
export function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, " ")
    .split(" ")
    .flatMap(expand)
    .filter((word) => word.length > 1 && !NOISE.has(word) && !/\d/.test(word));
}

/**
 * One word of an invoice description, spelled out.
 *
 * A slash is read as part of the abbreviation before it is read as a separator,
 * because "B/S" is one shorthand and "3/8" is one measurement. Only when the
 * whole thing means nothing is it split and each half tried on its own.
 */
function expand(token: string): string[] {
  const whole = ABBREVIATIONS[token.replace(/\//g, "")];
  if (whole) return whole.split(" ");
  return token.split("/").flatMap((part) => (ABBREVIATIONS[part] ?? part).split(" "));
}

/**
 * True when two words plausibly name the same thing.
 *
 * Two things happen in practice: a shortening that lives inside the longer word
 * ("tender" inside "tenderloin", "chip" inside "chips"), and a spelling that
 * drifts by a letter ("ketsup"). Anything looser starts putting the price of
 * chicken breast on chicken thighs.
 */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  // A drifting spelling still has to start the same way. Without that, one
  // letter of slack makes "popper" a pepper, which is how a jalapeño popper
  // ends up priced as cayenne.
  return a.length >= 5 && b.length >= 5 && a.slice(0, 2) === b.slice(0, 2) && editDistance(a, b) <= 1;
}

/** Levenshtein distance, given up on early once it cannot come in under the cap. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 99;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/** How many of `needles` turn up in `haystack`. */
const overlap = (needles: string[], haystack: string[]): number =>
  needles.filter((needle) => haystack.some((word) => sameWord(needle, word))).length;

/* ------------------------------------------------------------- the matching */

/** How a product came to be tied to an item, weakest last. */
export type MatchSource = "linked" | "name" | "close" | "none";

/** Strongest first — used to settle two products competing for one item. */
const MATCH_RANK: Record<MatchSource, number> = { linked: 3, name: 2, close: 1, none: 0 };

/**
 * How much of an item's name a product has to account for before it is worth
 * mentioning, and how many words that has to be.
 *
 * Half of a two-word name is one word, and one word in common is how "BEAN BLK"
 * comes to look like black pepper. Two words and two thirds is the point where
 * a guess is worth a second of the owner's attention — and a guess is all it is
 * called, never a match.
 */
const CLOSE_ENOUGH = 2 / 3;
const CLOSE_WORDS = 2;

export type PriceMatch = {
  product: PricedProduct;
  /** The item this price belongs to, or null while nobody has said. */
  itemId: string | null;
  match: MatchSource;
};

/** A product number already written onto an item, which settles it outright. */
export type SupplierLink = {
  itemId: string;
  partNumber: string;
  /** The supplier who issued it. */
  supplierName: string;
};

/**
 * The best guess at which item each product is, with nobody guessed at twice.
 *
 * Two products pointing at one item means at least one of them is wrong, and a
 * wrong one here puts the price of a case of wings on a case of breasts. The
 * stronger claim keeps the item; the weaker product is handed back unmatched
 * for the owner to settle by hand.
 *
 * Only part numbers issued by `supplier` count. A six-digit number is a handle
 * on a case inside one distributor's catalogue and nothing at all outside it,
 * so a number that happens to be on file against another supplier is left to
 * the name matching like any other row.
 */
export function matchProducts(
  products: readonly PricedProduct[],
  items: readonly Item[],
  links: readonly SupplierLink[] = [],
  supplier = "",
): PriceMatch[] {
  const from = supplier.trim().toLowerCase();
  const linked = new Map(
    links
      .filter((link) => !from || link.supplierName.trim().toLowerCase() === from)
      .map((link) => [link.partNumber.trim().toLowerCase(), link.itemId]),
  );

  const buyable = items.filter(canTakePrice);
  const indexed = buyable.map((item) => ({ item, names: itemNames(item) }));

  const matches = products.map<PriceMatch>((product) => {
    const known = linked.get(product.partNumber.trim().toLowerCase());
    if (known && buyable.some((item) => item.id === known)) {
      return { product, itemId: known, match: "linked" };
    }
    return { product, ...guess(product, indexed) };
  });

  return settleDuplicates(matches);
}

/**
 * Whether an invoiced price belongs on this item at all.
 *
 * Only things that are bought have a purchase price to fill in: a prepped batch
 * costs what its parts cost, and a case price written onto one would be ignored
 * by the roll-up anyway. The importer matches against this set and the screen
 * offers the same set to choose from, so the two can never disagree about what
 * a price can land on.
 */
export const canTakePrice = (item: Item): boolean =>
  item.status !== "discontinued" &&
  (item.type === "raw" ||
    item.type === "packaging" ||
    item.type === "chemical" ||
    item.type === "smallware" ||
    item.type === "marketing");

/**
 * Every name an item goes by, each kept as its own list of words.
 *
 * Kept apart rather than poured into one bag because an alias is an
 * *alternative* name, not more of the same one. "House seasoning", also known
 * as "Colonel Jims breading", is named in full by an invoice that says
 * "BREADING CHICKEN SEASND / COL JIMS" — but only if the two names are scored
 * separately. Together they read as a five-word name that nothing will match.
 */
const itemNames = (item: Item): string[][] =>
  [item.internalName, item.customerName, ...item.aliases]
    .map(words)
    .filter((named) => named.length > 0);

/**
 * The closest item to one product, and how sure that is.
 *
 * Scored from both sides. An item's own words all having to appear is what
 * makes a match certain — "Chicken tenderloin" is only tenderloin if both words
 * are there. The product's words then break ties: "APTZ PICKLE CHIP DILL BRD"
 * covers every word of "Dill pickle chips" *and* of "Breaded dill pickle
 * chips", and the breaded one accounts for more of what the invoice said.
 */
function guess(
  product: PricedProduct,
  indexed: readonly { item: Item; names: string[][] }[],
): { itemId: string | null; match: MatchSource } {
  const said = words(`${product.description} ${product.brand}`);
  if (said.length === 0) return { itemId: null, match: "none" };

  let best: { itemId: string; score: number; covered: number } | null = null;

  for (const { item, names } of indexed) {
    for (const named of names) {
      const hits = overlap(named, said);
      const covered = hits / named.length;
      if (covered < CLOSE_ENOUGH || (covered < 1 && hits < CLOSE_WORDS)) continue;

      // Item coverage decides; product coverage only separates equals.
      const score = covered * 2 + overlap(said, named) / said.length;
      if (!best || score > best.score) best = { itemId: item.id, score, covered };
    }
  }

  if (!best) return { itemId: null, match: "none" };
  return { itemId: best.itemId, match: best.covered === 1 ? "name" : "close" };
}

/** Leave the strongest claim on each item and unmatch the rest. */
function settleDuplicates(matches: PriceMatch[]): PriceMatch[] {
  const claimed = new Map<string, PriceMatch>();

  for (const match of matches) {
    if (!match.itemId) continue;
    const holder = claimed.get(match.itemId);
    if (!holder) {
      claimed.set(match.itemId, match);
      continue;
    }
    const loser = MATCH_RANK[match.match] > MATCH_RANK[holder.match] ? holder : match;
    const winner = loser === holder ? match : holder;
    claimed.set(winner.itemId!, winner);
    loser.itemId = null;
    loser.match = "none";
  }

  return matches;
}

/* ---------------------------------------------------------------- pack size */

/** Units the same thing can be counted in, so a pack size can be compared to one. */
const UNIT_NAMES: Record<string, string> = {
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  ct: "ct",
  count: "ct",
  ea: "ct",
  each: "ct",
  piece: "ct",
  pieces: "ct",
  pc: "ct",
  ga: "gal",
  gal: "gal",
  gallon: "gal",
  gallons: "gal",
  qt: "qt",
  quart: "qt",
  quarts: "qt",
  dz: "dz",
  doz: "dz",
  dozen: "dz",
  kg: "kg",
  g: "g",
  gram: "g",
  grams: "g",
  l: "l",
  liter: "l",
  liters: "l",
  ml: "ml",
};

const unitName = (value: string): string =>
  UNIT_NAMES[value.trim().toLowerCase()] ?? value.trim().toLowerCase();

/** What a pack holds, in its own unit: "4/10 LB" is 40 lb; "2/100 CT" is 200 ct. */
export function packContents(packSize: string): { quantity: number; unit: string } | null {
  const pack = readPackSize(packSize);
  if (!pack) return null;

  // "6/#10 CN" has no number to multiply by — six cans is all it says.
  const quantity = pack.count * (pack.size ?? 1);
  return { quantity: Math.round(quantity * 10_000) / 10_000, unit: unitName(pack.unit) };
}

/**
 * How many stock units one purchase unit holds, worked out from the pack.
 *
 * Only answered when the pack is described in the same unit the item is counted
 * in. A case of "96/2.8 OZ" buns is 96 buns or 268.8 ounces depending on which
 * question is being asked, and guessing which would quietly divide every cost
 * built on it by the wrong number.
 */
export function stockPerPack(packSize: string, stockUnit: string): number | null {
  const pack = packContents(packSize);
  if (!pack || !stockUnit.trim()) return null;
  return pack.unit === unitName(stockUnit) ? pack.quantity : null;
}

/** "4/10 LB" in the catalogue's own house style: "4 / 10 lb". */
export function tidyPackSize(packSize: string): string {
  const trimmed = packSize.trim();
  const match = /^(\d+(?:\.\d+)?)\s*\/\s*(.+)$/.exec(trimmed);
  return match ? `${match[1]} / ${match[2].trim().toLowerCase()}` : trimmed.toLowerCase();
}

/* ------------------------------------------------------------ what changes */

/** A field an import would overwrite, as the preview shows it. */
export type FieldChange = {
  field: "purchaseCost" | "purchaseUnit" | "packSize" | "stockPerPurchaseUnit";
  label: string;
  /** What the record says now — null or "" where it says nothing. */
  from: string | number | null;
  to: string | number;
};

/** The values an import would write onto an item. */
export type PricePatch = {
  purchaseCost: number;
  purchaseUnit: string;
  packSize: string;
  /** Left null when the pack size can't be read in the item's stock unit. */
  stockPerPurchaseUnit: number | null;
};

export function patchFor(product: PricedProduct, item: Item): PricePatch {
  return {
    purchaseCost: product.cost,
    purchaseUnit: product.purchaseUnit,
    packSize: tidyPackSize(product.packSize),
    stockPerPurchaseUnit: stockPerPack(product.packSize, item.stockUnit),
  };
}

/**
 * What would actually change on the record, and nothing else.
 *
 * A row that changes nothing is still a match — it says the price held — but it
 * is worth writing nothing for, so the owner isn't reading a list of thirty
 * rows to find the four that moved.
 */
export function changesFor(product: PricedProduct, item: Item): FieldChange[] {
  const patch = patchFor(product, item);
  const changes: FieldChange[] = [];

  if (!near(item.purchaseCost, patch.purchaseCost)) {
    changes.push({
      field: "purchaseCost",
      label: "Cost",
      from: item.purchaseCost,
      to: patch.purchaseCost,
    });
  }
  if (patch.purchaseUnit && item.purchaseUnit.trim().toLowerCase() !== patch.purchaseUnit) {
    changes.push({
      field: "purchaseUnit",
      label: "Purchase unit",
      from: item.purchaseUnit,
      to: patch.purchaseUnit,
    });
  }
  if (patch.packSize && tidyPackSize(item.packSize) !== patch.packSize) {
    changes.push({
      field: "packSize",
      label: "Pack size",
      from: item.packSize,
      to: patch.packSize,
    });
  }
  if (
    patch.stockPerPurchaseUnit !== null &&
    !near(item.stockPerPurchaseUnit, patch.stockPerPurchaseUnit)
  ) {
    changes.push({
      field: "stockPerPurchaseUnit",
      label: `${item.stockUnit || "Stock units"} per ${patch.purchaseUnit || "purchase unit"}`,
      from: item.stockPerPurchaseUnit,
      to: patch.stockPerPurchaseUnit,
    });
  }

  return changes;
}

/** Equal to the fourth decimal place, which is as fine as a cost is stored. */
const near = (a: number | null, b: number): boolean =>
  a !== null && Math.abs(a - b) < 0.00005;

/* ---------------------------------------------------------------- reporting */

/** How much a cost moved, as a share of what it was. Null when it was unknown. */
export function priceChange(from: number | null, to: number): number | null {
  if (from === null || from <= 0) return null;
  return (to - from) / from;
}
