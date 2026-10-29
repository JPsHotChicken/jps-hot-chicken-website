import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Where `truck-repo.ts` puts an item it writes, on a sheet that has already been
 * arranged.
 *
 * The column defaults to 0, which on an arranged list is the very top — and a
 * section takes its place from its first row, so getting this wrong doesn't
 * misplace one item, it moves a whole section. That is worth pinning down at
 * the level of what actually gets sent to the database.
 */

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  items: [] as Row[],
  inserts: [] as unknown[],
  updates: [] as Row[],
}));

/** A stand-in for a Supabase query: every step returns itself, and it awaits to `result`. */
function chain(result: { data: unknown; error: null }) {
  const query = {
    select: () => query,
    single: () => query,
    maybeSingle: () => query,
    eq: () => query,
    then: (resolve: (value: typeof result) => unknown) => resolve(result),
  };
  return query;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getDb: () => ({
    from: () => ({
      select: () => chain({ data: db.items, error: null }),
      insert: (values: Row | Row[]) => {
        db.inserts.push(values);
        return chain({ data: { ...db.items[0], ...values, id: "new" }, error: null });
      },
      update: (values: Row) => {
        db.updates.push(values);
        return chain({ data: { ...db.items[0], ...values }, error: null });
      },
    }),
  }),
}));

const { importOrderGuide, insertItem, updateItem } = await import("@/lib/truck-repo");

function row(id: string, name: string, category: string, sortOrder: number): Row {
  return {
    id,
    name,
    category,
    unit: "case",
    pack_size: "",
    brand: "",
    supplier: "Performance Food Group",
    supplier_item_code: "",
    unit_price: null,
    par_quantity: 0,
    sort_order: sortOrder,
  };
}

const draft = (name: string, category: string) => ({
  name,
  category,
  unit: "case",
  packSize: "",
  brand: "",
  supplier: "",
  supplierItemCode: "",
  unitPrice: null,
  parQuantity: 0,
});

/** Chicken, then Cleaning — arranged, so positions run 0 to 3. */
const ARRANGED = [
  row("c1", "Tenders", "Chicken", 0),
  row("c2", "Wings", "Chicken", 1),
  row("k1", "Bleach", "Cleaning", 2),
  row("k2", "Degreaser", "Cleaning", 3),
];

beforeEach(() => {
  db.items = ARRANGED.map((one) => ({ ...one }));
  db.inserts = [];
  db.updates = [];
});

describe("adding an item", () => {
  it("puts it after everything already arranged", async () => {
    await insertItem(draft("Sanitiser", "Cleaning"));
    expect(db.inserts[0]).toMatchObject({ name: "Sanitiser", sort_order: 4 });
  });

  it("leaves a never-arranged list reading by category and name", async () => {
    db.items = db.items.map((one) => ({ ...one, sort_order: 0 }));
    await insertItem(draft("Sanitiser", "Cleaning"));
    expect(db.inserts[0]).toMatchObject({ sort_order: 0 });
  });
});

describe("editing an item", () => {
  it("keeps its place while it stays in its section", async () => {
    await updateItem("c2", draft("Party wings", "Chicken"));
    expect(db.updates[0]).not.toHaveProperty("sort_order");
  });

  it("sends it to the end when it changes section", async () => {
    // Left at 0, Tenders would be the first Cleaning row and pull the whole
    // section above Chicken.
    await updateItem("c1", draft("Tenders", "Cleaning"));
    expect(db.updates[0]).toMatchObject({ category: "Cleaning", sort_order: 4 });
  });
});

describe("importing a guide", () => {
  it("adds new items on the end, in the order the guide lists them", async () => {
    await importOrderGuide([draft("Gloves", "Paper"), draft("Napkins", "Paper")], ["name", "category"]);
    expect(db.inserts[0]).toEqual([
      expect.objectContaining({ name: "Gloves", sort_order: 4 }),
      expect.objectContaining({ name: "Napkins", sort_order: 5 }),
    ]);
  });

  it("moves an item the guide re-files to the end, and leaves the rest alone", async () => {
    await importOrderGuide(
      [draft("Tenders", "Frozen"), draft("Wings", "Chicken"), draft("Gloves", "Paper")],
      ["name", "category"],
    );
    expect(db.updates).toEqual([
      expect.objectContaining({ category: "Frozen", sort_order: 4 }),
      { name: "Wings", category: "Chicken" },
    ]);
    expect(db.inserts[0]).toEqual([expect.objectContaining({ name: "Gloves", sort_order: 5 })]);
  });

  it("never moves anything when the guide carried no category", async () => {
    await importOrderGuide([draft("Tenders", "Other")], ["name"]);
    expect(db.updates).toEqual([{ name: "Tenders" }]);
  });
});
