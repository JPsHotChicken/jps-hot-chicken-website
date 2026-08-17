# Truck order

The truck order page at `/admin/truck-order` keeps the standing list of things
that get ordered, turns it into a dated order, and keeps every order that came
before it.

It uses the same Supabase project and the same environment variables as the
scheduler — see [`scheduler-database-setup.md`](./scheduler-database-setup.md).
Nothing extra needs configuring.

## How it works

There are two halves.

**The set list** (`truck_items`) is the fixed part: every item that could ever go
on a truck, with its pack size, its distributor item code, and what one costs.
It changes rarely — an item is added when a new product is carried, and removed
when it isn't.

**An order** (`truck_orders`) is a dated sheet of quantities against that list.
Only what is actually being ordered is stored: setting a quantity back to zero
deletes the line rather than parking a `0` in the table, which is what keeps a
three-year-old order readable at a glance.

Each line keeps **its own copy** of the item's name, pack size, code and price.
Prices move and items stop being carried; what was on the truck last March has to
still read the way it did when it was ordered. Deleting an item therefore doesn't
erase it from past orders — the line is kept and marked *no longer carried*.

## Tables

| Table | Holds |
|---|---|
| `truck_items` | The set list. One row per item that can be ordered. |
| `truck_orders` | One row per order — its dates, status, note, and the invoice it came from. |
| `truck_order_lines` | What is on an order, one row per item being ordered. |

All three have **RLS enabled with no policies**, exactly like the scheduler's
tables: nothing is reachable through the public API, and every read and write
goes through the service role from server code. The Supabase linter's
`rls_enabled_no_policy` (INFO) notice on them is the intended posture.

Two constraints are worth knowing about:

- `truck_items (lower(supplier_item_code)) where supplier_item_code <> ''` is
  unique. One item code describes one item, which is what lets an order guide
  import update items in place instead of duplicating the catalogue. Items with
  no code are exempt.
- `truck_order_lines (order_id, item_id)` is unique, so an item appears at most
  once per order and a quantity change is a single upsert. Postgres treats NULLs
  as distinct, so the several orphaned lines an order can hold for deleted items
  are still allowed. An invoice that bills one item on two lines is merged into
  one before it gets here, at the weighted average price.
- `truck_orders (invoice_number) where invoice_number <> ''` is unique, so
  importing the same invoice export twice is a no-op.

## The printable sheet

**Print sheet** builds a blank count sheet as a PDF — the thing that goes on a
clipboard. One row per item, grouped into the same sections as the screen, with
**six undated columns** beside each row: write a date at the top of the next
empty column, walk the walk-in, fill in quantities. One printed sheet therefore
covers six orders.

It is deliberately a blank form rather than a printout of an order on screen.
What it is for is the counting that happens *before* there is an order.

The date boxes and the column numbers repeat at the top of every page, because
otherwise there would be no telling which order a number on page two belonged
to. Each item's *usual order* is printed beside its name as a prompt, when one
is set.

`ORDER_COLUMNS` in `src/lib/truck-sheet-pdf.ts` is the number of columns; the
layout works off it, so changing it is a one-line change.

## Arranging the sheet

**Arrange** turns the sheet into a list of move controls: up and down within a
section, and up and down for a whole section. The order applies on screen and on
the printed sheet, so the sheet can be made to read in the order the walk-in is
actually laid out.

`sort_order` on `truck_items` is **one sequence across the whole list**, not a
position within a category — so arranging is just reordering a flat list, and a
category's place is decided by where its first item sits. Until a list has been
arranged every item sits at 0, and `compareItems` falls back to the built-in
category order and then to name, which is what gives a freshly imported list a
sensible order without anyone setting one.

Two things follow from that, and both are load-bearing:

- `moveItem` and `moveCategory` **renumber what they return**. Both sort on
  `sortOrder` on the way in, so a result still carrying its old positions would
  make the second of two moves throw the first one away.
- `groupByCategory` takes its section order from the order rows arrive in, and
  does not impose one. Anything drawing the sheet has to sort with
  `compareItems` first — `buildRows` in `OrderSheet.tsx` does this itself rather
  than trusting its caller.

Saving only writes the rows whose position actually changed. The first arrange
of an imported list moves everything off zero and so touches every row; every
nudge after that is two writes.

## Statuses

| Stored | Shown | Means |
|---|---|---|
| `draft` | Building | Still being counted. |
| `submitted` | Placed | Sent to the distributor. Stamps `submitted_at`. |
| `received` | Delivered | The truck came. Stamps `received_at`. |

Marking an order delivered deliberately leaves `submitted_at` alone — that
already happened. Moving one back to Building clears both stamps.

## Performance Food Group

**There is no PFG API to plug into.** A single-location operator cannot get an
API key for their own catalogue or order history. The routes that exist are:

- **CustomerFirst**, the ordering portal, which is a website — but it exports
  both your invoices and your order guide.
- **EDI** (X12 850 purchase order, 810 invoice, 832 price catalogue), arranged
  through PFG's integration team. The contact depends on the account type:
  `PFS-Portal-SystemsIntegration@pfgc.com` for Portal accounts,
  `PFGCustomized.Support@pfgc.com` for PFG Custom, and
  `Vistar.EDISupport@pfgc.com` for Vistar/Roma.
- **A third-party middleman** — Orderful, Crunchtime, Restaurant365 and others
  hold PFG connections and resell them.

The last two are paid, take paperwork, and are aimed at multi-unit chains. So
this page takes the first route: export from CustomerFirst and import the file.
Both exports are accepted, and which one you dropped in is worked out from its
headers — you shouldn't have to remember which report you downloaded.

### Invoice exports (`CustomerFirstInvoiceExport_*.csv`)

This is the one worth having. An invoice is a record of a delivery that already
happened, so importing one fills in the **order history and the set list at
once**, at the prices actually charged.

The file is flat: one row per line item, with the invoice's own details repeated
on every row. `parseInvoiceExport` groups the rows back up by invoice number, so
one file containing three deliveries becomes three orders, each marked
*Delivered*.

Re-importing a file that has already been read does nothing. Orders are matched
on invoice number, which is what the unique index on
`truck_orders.invoice_number` is there to guarantee.

Four things about that format are worth knowing, because each one silently
produces wrong numbers if handled naively:

- **Bare inch marks.** Descriptions like `FRIES 3/8" REG CUT` and `BISCUIT DGH
  EASY SPLIT 3.25"` contain an unescaped `"`, and nothing else in the file is
  quoted at all. A strict RFC-4180 parser pairs those inch marks off against
  each other and swallows every row in between — in a real 116-line export that
  quietly merged it down to 81 rows with shifted columns. `parseCsv` therefore
  only treats a `"` as opening a quoted field when it is the field's first
  character, which is what Excel does.
- **Catch weight.** On weighed items the `Unit Price` column is *per pound*, not
  per case: a block of cheese shows `2.0699` against a weight of `43.88/lb` and
  an extended price of `90.83`. Prices are therefore derived as
  `Ext. Price ÷ Qty Shipped`, which gets the cost of one case right for weighed
  and unweighed lines alike without having to tell them apart.
- **Repeated invoice totals.** `Total Qty Ordered` and `Total Qty Shipped` are
  the whole invoice's, repeated on every row — they are not the line's. The line
  quantities are `Qty Ordered` and `Qty Shipped`.
- **The lines only add up to the subtotal.** Tax and the fuel charge are on the
  invoice but on no line, so `invoice_total` is stored rather than derived.
  What the page shows as the order total is the sum of the lines; the invoice
  figure is shown beside it.

Quantities come from `Qty Shipped` — what actually turned up, not what was asked
for. PFG's `Category/Class` values are warehouse categories, so `POULTRY` becomes
Chicken and `GROCERY DRY` becomes Dry Goods via `PFG_CATEGORIES`; anything not in
that table is title-cased and kept.

The order date is the invoice date. The real order went in a day or two earlier,
but nothing in the file says when.

### Order guide exports

A guide is just a catalogue, so importing one only touches the set list. It
matches on item code first and item name second, so re-importing next month's
guide moves the prices on items already on the list rather than laying a second
copy of the catalogue beside them. It only writes the columns the file actually
had — a guide with no category column will not quietly refile everything under
"Other".

Column names are matched against a list of aliases in `COLUMN_ALIASES`
(`src/lib/truck.ts`), because every distributor and every report type names them
differently. If a future export uses a heading that isn't recognised, adding one
string to that list is the entire fix. Aliases are listed best-first and matched
in that order, so a file carrying both `Item Description` and `Long Description`
is read from the one meant for a person.

### Going the other way

**Export CSV** writes the order as a spreadsheet with the item code first — the
column a rep or a portal upload keys off.

If an EDI feed is ever set up, it lands in `parseInvoiceExport` /
`parseOrderGuide` and everything downstream of them already works.

## Files

| File | What's in it |
|---|---|
| `src/lib/truck.ts` | Types, totals, CSV reading and writing. No database, no React — this is where the tests point. |
| `src/lib/truck-repo.ts` | Every read and write, `server-only`. |
| `src/app/admin/truck-order/actions.ts` | Server Actions. Each re-checks the session and validates its own arguments. |
| `src/app/admin/truck-order/page.tsx` | The page. |
| `src/components/admin/TruckOrder.tsx` | The screen, and all of its state. |
| `src/components/admin/OrderSheet.tsx` | The list of items with quantities against them. |
| `src/components/admin/OrderPanel.tsx` | The open order's dates, status and totals. |
| `src/components/admin/OrderHistory.tsx` | Previous orders. |
| `src/components/admin/ImportGuide.tsx` | The order guide importer. |
| `src/components/admin/ItemEditor.tsx` | Adding and editing one set item. |
| `src/lib/truck-sheet-pdf.ts` | The printable blank count sheet. |
| `src/tests/unit/TruckOrder.test.ts` | Totals, sheet order, CSV, order guides. |
| `src/tests/unit/TruckInvoice.test.ts` | Invoice parsing, against fixtures taken verbatim from a real export. |
| `src/tests/unit/OrderSheet.test.tsx` | The sheet's rendering and interactions. |

## Things to know

- Quantities save themselves ~400ms after you stop changing them, so holding the
  plus button is one write rather than one per click. Anything still waiting is
  sent when you leave the page.
- **Fill from usual** puts each item's par quantity on the sheet but never
  overwrites a number already typed in — it fills the blanks.
- The history list reaches back over the most recent 52 orders (`HISTORY_LIMIT`
  in `truck-repo.ts`). Older orders are still in the database.
- **Order this again** starts a new order with the same quantities, priced at
  today's prices rather than the old order's.
- Invoices carry no par levels, so everything imported starts with a *usual
  order* of 0 and **Fill from usual** does nothing until those are set. Setting
  them also fills in the prompts on the printed sheet.
