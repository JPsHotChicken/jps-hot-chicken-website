# Items database

The items database is the single source of truth for
every physical and menu item in the operation. Handbooks, recipe cards, cost
sheets, order guides and allergen matrices are meant to *point at* it rather
than restate what it holds.

It uses the same Supabase project and the same environment variables as the
scheduler — see [`scheduler-database-setup.md`](./scheduler-database-setup.md).
Nothing extra needs configuring.

## The core idea

It is a **layered bill of materials**, not a flat menu list. Every physical
thing has a row and a permanent code. Higher layers are assembled *by reference*
from lower ones:

```
RAW-0002  All-purpose flour   $0.45 / lb   ← bought
RAW-0003  Cayenne pepper      $6.20 / lb   ← bought
   └── PRP-0001  Nashville dredge  $1.60 / lb   ← 8 lb flour + 2 lb cayenne, makes 10 lb
          └── MNU-0001  Hot chicken sandwich  $2.02   ← 0.15 lb dredge + chicken + bun + …
```

Nothing is duplicated as text. Change the cayenne price once and the dredge, the
sandwich and the tenders all reprice — no re-entry anywhere.

## Two surfaces, one catalogue

| | Where | Who | Can change it |
|---|---|---|---|
| **The master** | `/admin/items` | owner, admin password | ✅ |
| **The crew's copy** | `/operations/items` | anyone with the operations code | ❌ |

Both read the same tables and render the same components. They differ in exactly
two ways: the dashboard copy passes `canEdit`, and it wears the dashboard's
drawer instead of a back arrow.

The catalogue is a **controlled document**, so the crew's copy is read-only *by
construction* rather than by permission — there is no edit control on it to
disable, and no write action reachable from it. Every Server Action lives under
`/admin/items` and re-checks the admin session itself, because a Server Action is
a public endpoint and being rendered on a page nobody could reach proves nothing
about who called it.

This is the seed of the franchise model: a location consumes the standard, it
does not set it.

### Editing, all in one place

Everything that changes a record is on `/admin/items`:

- **New item** — identity first, then the record itself.
- **Edit** on any record — every field its type calls for.
- **What's in it** — add and remove components, in stock or portion units.
- **Approved suppliers** — approve a supplier, record their part number and price.
- **Delete** — refused while anything is still built from the item.

Each save bumps the version and writes a dated, attributed line to the history.

## Item layers

Eight types, each showing only the field groups its role calls for — a
thermometer is never asked about allergens.

Reached from the dashboard drawer, next to the truck order and tips payout.

| Type | Code prefix | Field groups |
|---|---|---|
| Raw / purchased | `RAW-` | purchasing, units, allergens, storage |
| Prepped / sub-recipe | `PRP-` | units, what's in it, allergens, storage |
| Menu item | `MNU-` | what's in it, allergens, menu price |
| Modifier / add-on | `MOD-` | what's in it, allergens, menu price |
| Packaging | `PKG-` | purchasing, units |
| Chemical / cleaning | `CHM-` | purchasing, units, storage |
| Smallware / equipment | `SMW-` | purchasing |
| Marketing / POS | `MKT-` | purchasing |

Adding a type later is one `alter type item_type add value '…'` plus an entry in
`FIELD_GROUPS` in [`src/lib/items.ts`](../src/lib/items.ts). Existing rows are
untouched.

## Units, and the arithmetic nobody should do by hand

Each consumable is handled in up to three units, with the factors between them
stored on the record:

```
purchase unit  ──stock_per_purchase_unit──▶  stock unit  ──portions_per_stock_unit──▶  portion unit
   (case)                                      (lb)                                      (slice)
```

Everything is counted and costed in the **stock unit**. A recipe line may be
written in either the stock unit or the portion unit, and the system converts:
4 pickle chips out of a $24.75 pail that yields 180 chips per gallon costs
$0.11, and nobody had to work that out.

`yield_factor` is the usable fraction after trim, cook loss or spoilage. A case
at $24 giving 6 lb is $4.00/lb; if a fifth is trimmed away, the *usable* pound
costs $5.00. Costing runs on the usable pound, because that is the one the
recipe actually consumes.

## How a cost is worked out

- **Bought item:** `purchase_cost ÷ stock_per_purchase_unit ÷ yield_factor`
- **Assembled item:** `(sum of its lines) ÷ batch_yield_quantity ÷ yield_factor`

A line's cost is the component's cost per stock unit × the quantity, converted
first if it was written in portions. This recurses all the way down.

Anything unknown stays **unknown**, never zero — a recipe missing one price
reads as "we don't know yet" and names the item that is missing, rather than
showing a confidently wrong number.

## Data integrity

These are enforced in the database, not just the UI:

- **Item codes are unique and permanent**, compared case-insensitively. Nothing
  reuses or renumbers them; `nextCode` reads the highest number ever used rather
  than filling the gap left by a discontinued item.
- **An item something is built from cannot be deleted.** `item_components`
  references items with `on delete restrict`. The usual end for an item is
  `discontinued`, which keeps every document that ever referenced it readable.
- **No loops.** A trigger walks down from the component being added; if it
  arrives back at the parent, the insert is rejected. The picker also never
  offers an item that would close a loop, so the trigger is the backstop rather
  than the first line of defence.
- **Relationships are stored by id**, never by copied text.

## Tables

| Table | Holds |
|---|---|
| `items` | One row per physical or menu item. The spine. |
| `item_components` | The bill of materials — one row per "X is made from Y". |
| `suppliers` | Who the operation buys from. |
| `item_suppliers` | Approved suppliers per item, with their part number and price. |
| `locations` | The units. Used for item availability. |
| `item_locations` | Which locations an item is available at, when not all. |
| `item_revisions` | Every change, dated, attributed, with the record as it stood. |

All have **RLS enabled with no policies**, exactly like the scheduler's tables:
nothing is reachable through the public API, and every read and write goes
through the service role from server code. The Supabase linter's
`rls_enabled_no_policy` (INFO) notice on them is the intended posture.

## Cost, and where it lives

`items.purchase_cost` is the cost **used for costing**. `item_suppliers` holds
each approved supplier's quoted price alongside it.

Two numbers that could disagree is a deliberate call: an operation needs one
current cost to build sheets on, and separately needs to know what each approved
supplier charges. The quotes inform the cost; they do not silently become it.

## Sample data

The catalogue currently holds **12 sample items with invented prices** — a
working three-layer example (flour and cayenne → dredge → sandwich). Every one
is marked **Test** so the product itself says so.

To clear them before entering real data:

```sql
delete from item_components;
delete from item_suppliers;
delete from items;
delete from suppliers;
```

## Not built yet

The spec this was built from goes further. What is here is layers 1–5 of its
build order, plus the governance *columns* of layer 6 so nothing needs a painful
retrofit:

- **Publishing snapshots.** `scope`, `available_everywhere` and `item_locations`
  are in the schema and on the record, and every change is versioned in
  `item_revisions`. What does not exist yet is the "publish the March build"
  action and the read-only franchisee view of it. The scheduler's
  publish-a-snapshot pattern (`published_weeks`) is the model to follow.
- **Nutrition.** There is a `nutrition` jsonb column but no entry UI.
- **Photos and SOP links** are URL fields; there is no upload.
- **Approved-supplier enforcement** is recorded but not yet enforced against
  ordering — the truck order at `/admin/truck-order` still has its own item
  list, and merging the two is the obvious next consolidation.
