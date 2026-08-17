"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Minus,
  Package,
  Pencil,
  Plus,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { FIELD_CLASS } from "./field";
import {
  MAX_QUANTITY,
  canMoveItem,
  clampQuantity,
  compareItems,
  groupByCategory,
  lineTotal,
  type MoveDirection,
  type TruckItem,
  type TruckOrderLine,
} from "@/lib/truck";

/**
 * One line of the sheet, whether or not anything is being ordered on it.
 *
 * Rows come from two places: the set list, and any line left over from an item
 * that has since been deleted. Flattening both into this shape means the sheet
 * itself doesn't have to care which is which.
 */
export type SheetRow = {
  key: string;
  name: string;
  category: string;
  unit: string;
  packSize: string;
  brand: string;
  code: string;
  unitPrice: number | null;
  quantity: number;
  /** The set item behind the row — null once it has been deleted. */
  item: TruckItem | null;
  /** The order line, when one exists. */
  lineId: string | null;
};

type Props = {
  items: TruckItem[];
  lines: TruckOrderLine[];
  /** No order is open, so there is nothing a quantity could be saved against. */
  disabled?: boolean;
  onQuantity: (row: SheetRow, quantity: number) => void;
  onEditItem: (item: TruckItem) => void;
  onMoveItem: (id: string, direction: MoveDirection) => void;
  onMoveCategory: (category: string, direction: MoveDirection) => void;
};

/**
 * Join the set list to what's on the order, keeping deleted-item lines visible.
 *
 * Sorting happens here rather than being assumed of the caller: the sheet's
 * sections take their order from the order the rows arrive in, so a component
 * that trusted its input to be sorted would silently draw itself wrong.
 */
function buildRows(items: TruckItem[], lines: TruckOrderLine[]): SheetRow[] {
  const byItem = new Map(lines.filter((line) => line.itemId).map((line) => [line.itemId!, line]));

  const rows: SheetRow[] = [...items].sort(compareItems).map((item) => {
    const line = byItem.get(item.id);
    return {
      key: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      packSize: item.packSize,
      brand: item.brand,
      code: item.supplierItemCode,
      // The live price, not the line's copy: while an order is being built, what
      // matters is what it will cost now.
      unitPrice: item.unitPrice,
      quantity: line?.quantity ?? 0,
      item,
      lineId: line?.id ?? null,
    };
  });

  // Lines whose item was deleted mid-order still have to be visible — they are
  // on the truck, and the only way to take one off is to see it.
  for (const line of lines) {
    if (line.itemId) continue;
    rows.push({
      key: line.id,
      name: line.name,
      category: line.category,
      unit: line.unit,
      packSize: line.packSize,
      brand: "",
      code: line.supplierItemCode,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      item: null,
      lineId: line.id,
    });
  }

  return rows;
}

function matches(row: SheetRow, query: string): boolean {
  const haystack = `${row.name} ${row.code} ${row.brand} ${row.category} ${row.packSize}`;
  return haystack.toLowerCase().includes(query);
}

/** The item's own details, under its name. */
function rowMeta(row: SheetRow): string {
  return [row.packSize, row.brand, row.code && `#${row.code}`].filter(Boolean).join(" · ");
}

function QuantityField({
  row,
  disabled,
  onQuantity,
}: {
  row: SheetRow;
  disabled: boolean;
  onQuantity: (row: SheetRow, quantity: number) => void;
}) {
  // Typing is held locally so an empty box on the way to "12" doesn't read as a
  // zero and take the item off the order mid-keystroke.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (row.quantity === 0 ? "" : String(row.quantity));

  const step = (delta: number) => onQuantity(row, clampQuantity(row.quantity + delta));

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`One less ${row.name}`}
        disabled={disabled || row.quantity <= 0}
        onClick={() => step(-1)}
      >
        <Minus />
      </Button>

      <input
        value={shown}
        onChange={(event) => setDraft(event.target.value.replace(/[^0-9.]/g, "").slice(0, 6))}
        onBlur={() => {
          if (draft === null) return;
          onQuantity(row, clampQuantity(draft === "" ? 0 : Number(draft)));
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(null);
        }}
        disabled={disabled}
        inputMode="decimal"
        aria-label={`How many ${row.name}`}
        placeholder="0"
        className={`w-14 text-center tabular-nums ${FIELD_CLASS} ${
          row.quantity > 0 ? "border-brand/50 font-semibold" : ""
        }`}
      />

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`One more ${row.name}`}
        disabled={disabled || row.quantity >= MAX_QUANTITY}
        onClick={() => step(1)}
      >
        <Plus />
      </Button>
    </div>
  );
}

/**
 * The order sheet: every set item, with how many of it are going on the truck.
 *
 * Items are listed whether or not they're being ordered — the point of a set
 * list is walking it top to bottom and filling in numbers, so an item at zero
 * has to be as visible as one at six.
 */
export function OrderSheet({
  items,
  lines,
  disabled = false,
  onQuantity,
  onEditItem,
  onMoveItem,
  onMoveCategory,
}: Props) {
  const [query, setQuery] = useState("");
  const [onlyOrdered, setOnlyOrdered] = useState(false);
  const [arranging, setArranging] = useState(false);

  const rows = useMemo(() => buildRows(items, lines), [items, lines]);

  const visible = useMemo(() => {
    // Arranging works on the whole list. Moving a row a place up while rows are
    // hidden between them would land it somewhere that looks wrong on screen.
    if (arranging) return rows;
    const needle = query.trim().toLowerCase();
    return rows.filter(
      (row) => (!onlyOrdered || row.quantity > 0) && (!needle || matches(row, needle)),
    );
  }, [rows, query, onlyOrdered, arranging]);

  const groups = useMemo(() => groupByCategory(visible), [visible]);
  const orderedCount = rows.filter((row) => row.quantity > 0).length;

  return (
    <div className="rounded-xl border border-border bg-background shadow-sm">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="mr-auto flex items-center gap-2 font-heading text-base font-bold">
          <Package className="size-4 text-brand" />
          {arranging ? "Arrange the sheet" : "Order sheet"}
        </h2>

        {!arranging && (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find an item"
                aria-label="Find an item"
                className={`!w-48 pl-8 ${FIELD_CLASS}`}
              />
            </div>

            <Button
              variant={onlyOrdered ? "secondary" : "outline"}
              size="sm"
              aria-pressed={onlyOrdered}
              onClick={() => setOnlyOrdered((current) => !current)}
              title="Hide everything that isn't being ordered"
            >
              On the truck ({orderedCount})
            </Button>
          </>
        )}

        <Button
          variant={arranging ? "default" : "outline"}
          size="sm"
          aria-pressed={arranging}
          onClick={() => setArranging((current) => !current)}
          title="Change the order items are listed in, on screen and on the printed sheet"
        >
          {arranging ? <Check data-icon="inline-start" /> : <ArrowUpDown data-icon="inline-start" />}
          {arranging ? "Done" : "Arrange"}
        </Button>
      </header>

      {arranging && (
        <p className="border-b border-border bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
          Move items within a section, or move a whole section. This is the order the printed
          sheet reads in too. To move something to a different section, edit its category.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No items yet. Add them one at a time, or import an order guide.
        </p>
      ) : visible.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing matches that.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {groups.map((group, index) => (
            <section key={group.category}>
              <h3 className="sticky top-16 z-10 flex items-center gap-2 border-y border-border bg-muted/90 px-4 py-1.5 text-[0.65rem] font-bold tracking-widest text-muted-foreground uppercase backdrop-blur">
                <span className="mr-auto">{group.category}</span>
                {arranging ? (
                  <span className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Move the ${group.category} section up`}
                      disabled={index === 0}
                      onClick={() => onMoveCategory(group.category, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Move the ${group.category} section down`}
                      disabled={index === groups.length - 1}
                      onClick={() => onMoveCategory(group.category, 1)}
                    >
                      <ArrowDown />
                    </Button>
                  </span>
                ) : (
                  <span className="tabular-nums">
                    {group.rows.filter((row) => row.quantity > 0).length}/{group.rows.length}
                  </span>
                )}
              </h3>

              <ul className="divide-y divide-border">
                {group.rows.map((row) => (
                  <li
                    key={row.key}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 ${
                      row.quantity > 0 ? "bg-brand/5" : ""
                    }`}
                  >
                    <div className="min-w-40 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {row.name}
                        {!row.item && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
                            no longer carried
                          </span>
                        )}
                      </p>
                      {rowMeta(row) && (
                        <p className="truncate text-xs text-muted-foreground">{rowMeta(row)}</p>
                      )}
                    </div>

                    {arranging ? (
                      // Only real set items have a place to be moved to; a line
                      // for a deleted item is not on the list any more.
                      row.item && (
                        <span className="flex items-center gap-0.5">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label={`Move ${row.name} up`}
                            disabled={!canMoveItem(items, row.item.id, -1)}
                            onClick={() => onMoveItem(row.item!.id, -1)}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label={`Move ${row.name} down`}
                            disabled={!canMoveItem(items, row.item.id, 1)}
                            onClick={() => onMoveItem(row.item!.id, 1)}
                          >
                            <ArrowDown />
                          </Button>
                        </span>
                      )
                    ) : (
                      <>
                        <p className="w-20 text-right text-xs text-muted-foreground tabular-nums">
                          {row.unitPrice === null
                            ? "—"
                            : `${formatPrice(row.unitPrice)}/${row.unit}`}
                        </p>

                        <QuantityField row={row} disabled={disabled} onQuantity={onQuantity} />

                        <p className="w-20 text-right text-sm font-semibold tabular-nums">
                          {row.quantity > 0 && row.unitPrice !== null
                            ? formatPrice(
                                lineTotal({ quantity: row.quantity, unitPrice: row.unitPrice }),
                              )
                            : ""}
                        </p>

                        {row.item ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit ${row.name}`}
                            onClick={() => onEditItem(row.item!)}
                          >
                            <Pencil />
                          </Button>
                        ) : (
                          // Nothing to edit — the item is gone. The gap keeps
                          // the quantity columns lined up with the rows above.
                          <span className="size-7" aria-hidden />
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
