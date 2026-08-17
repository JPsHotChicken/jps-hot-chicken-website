"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LoaderCircle,
  LogOut,
  Menu,
  PackagePlus,
  Plus,
  Printer,
  TriangleAlert,
  Truck,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { logout } from "@/app/admin/actions";
import {
  addItemAction,
  clearOrderAction,
  copyOrderAction,
  createOrderAction,
  deleteOrderAction,
  fillFromParsAction,
  importFileAction,
  loadOrderAction,
  reloadTruckAction,
  removeItemAction,
  reorderItemsAction,
  setOrphanQuantityAction,
  setQuantityAction,
  updateItemAction,
  updateOrderAction,
} from "@/app/admin/truck-order/actions";
import {
  formatOrderDate,
  moveCategory,
  moveItem,
  orderCsvFilename,
  orderItemCount,
  orderTotal,
  orderUnitCount,
  reorderedIds,
  toOrderCsv,
  todayISO,
  type MoveDirection,
  type OrderPatch,
  type TruckItem,
  type TruckItemDraft,
  type TruckOrderDetail,
  type TruckOrderLine,
  type TruckOrderSummary,
} from "@/lib/truck";
import { AdminDrawer } from "./AdminDrawer";
import { ImportGuide } from "./ImportGuide";
import { ItemEditor } from "./ItemEditor";
import { OrderHistory, StatusPill } from "./OrderHistory";
import { OrderPanel } from "./OrderPanel";
import { OrderSheet, type SheetRow } from "./OrderSheet";
import { ORDER_COLUMNS } from "@/lib/truck-sheet-pdf";

export type TruckOrderProps = {
  items: TruckItem[];
  orders: TruckOrderSummary[];
  /** The most recent order, or null before the first one is started. */
  order: TruckOrderDetail | null;
};

/** How long a row sits still before its quantity is saved. */
const SAVE_DELAY_MS = 400;

/** Push a browser download of text the page generated itself. */
function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The truck order page.
 *
 * The set list is the fixed part — every item that could go on a truck — and an
 * order is just quantities against it, saved as they are typed. Edits are
 * applied locally first: counting a walk-in means running down the sheet
 * quickly, and a round trip per keystroke would make that miserable. When a
 * save does fail the banner says so and everything is re-read, so what is on
 * screen is never quietly out of step with what is stored.
 */
export function TruckOrder({
  items: initialItems,
  orders: initialOrders,
  order: initialOrder,
}: TruckOrderProps) {
  const [items, setItems] = useState(initialItems);
  const [orders, setOrders] = useState(initialOrders);
  const [order, setOrder] = useState(initialOrder);

  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<{ item: TruckItem | null } | null>(null);
  const [starting, setStarting] = useState(false);
  const [filling, setFilling] = useState(false);
  const [copying, setCopying] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const openId = order?.id ?? null;

  /** Pull the database's version of everything back into state. */
  const reload = useCallback(async (orderId: string | null) => {
    const fresh = await reloadTruckAction(orderId);
    setItems(fresh.items);
    setOrders(fresh.orders);
    setOrder(fresh.order);
  }, []);

  /**
   * Run a save. On failure the optimistic edit is thrown away and everything is
   * re-read, so a rejected change never lingers on screen looking saved.
   */
  const save = useCallback(
    async (description: string, action: () => Promise<void>) => {
      try {
        await action();
      } catch (cause) {
        console.error(`[truck] Could not ${description}:`, cause);
        setError(`Couldn't ${description}. That change wasn't saved.`);
        try {
          await reload(openId);
        } catch (reloadCause) {
          console.error("[truck] Reload after a failed save also failed:", reloadCause);
          setError(
            `Couldn't ${description}, and reloading failed too. ` +
              "Check your connection and refresh the page.",
          );
        }
      }
    },
    [reload, openId],
  );

  /* ------------------------------------------------------------- history */

  /**
   * The history list's own row for the order that's open is worked out from the
   * sheet rather than stored, so the counts beside it always describe the order
   * as it is now instead of as it was when the page loaded.
   */
  const summaries = useMemo(
    () =>
      orders.map((summary) =>
        order && summary.id === order.id
          ? {
              ...summary,
              orderDate: order.orderDate,
              deliveryDate: order.deliveryDate,
              status: order.status,
              note: order.note,
              itemCount: orderItemCount(order.lines),
              totalUnits: orderUnitCount(order.lines),
              total: orderTotal(order.lines),
            }
          : summary,
      ),
    [orders, order],
  );

  /* ------------------------------------------------------------ quantities */

  /**
   * Saving a quantity is debounced per row, so holding the plus button is one
   * write rather than one per click. `tickets` keeps the answers in order: if a
   * row changes again while its save is in flight, the earlier reply is dropped
   * instead of overwriting the newer number.
   */
  const timers = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; send: () => void }>());
  const tickets = useRef(new Map<string, number>());

  /** Put the saved line into local state, replacing the optimistic one. */
  const applyLine = useCallback(
    (orderId: string, key: string, line: TruckOrderLine | null) => {
      setOrder((current) => {
        if (!current || current.id !== orderId) return current;
        const without = current.lines.filter(
          (existing) => existing.id !== key && existing.itemId !== key,
        );
        return { ...current, lines: line ? [...without, line] : without };
      });
    },
    [],
  );

  const flush = useCallback(
    (orderId: string, row: SheetRow, quantity: number) => {
      const key = row.item?.id ?? row.key;
      const ticket = (tickets.current.get(key) ?? 0) + 1;
      tickets.current.set(key, ticket);

      void save("save that quantity", async () => {
        const line = row.item
          ? await setQuantityAction(orderId, row.item.id, quantity)
          : await setOrphanQuantityAction(orderId, row.key, quantity);
        // A newer change to the same row is already on its way; its answer is
        // the one that should land, not this one.
        if (tickets.current.get(key) !== ticket) return;
        applyLine(orderId, key, line);
      });
    },
    [applyLine, save],
  );

  const setQuantity = useCallback(
    (row: SheetRow, quantity: number) => {
      if (!openId) return;

      // Optimistic: the sheet shows the new number straight away, carrying a
      // placeholder line until the saved one comes back with its real id.
      setOrder((current) => {
        if (!current) return current;
        const others = current.lines.filter(
          (line) => line.id !== row.key && line.itemId !== row.item?.id,
        );
        if (quantity <= 0) return { ...current, lines: others };

        const existing = current.lines.find(
          (line) => line.id === row.key || (row.item && line.itemId === row.item.id),
        );
        const line: TruckOrderLine = existing
          ? { ...existing, quantity }
          : {
              id: `pending-${row.key}`,
              itemId: row.item?.id ?? null,
              name: row.name,
              category: row.category,
              unit: row.unit,
              packSize: row.packSize,
              supplierItemCode: row.code,
              unitPrice: row.unitPrice,
              quantity,
              sortOrder: row.item?.sortOrder ?? 0,
            };
        return { ...current, lines: [...others, line] };
      });

      const key = row.item?.id ?? row.key;
      const queued = timers.current.get(key);
      if (queued) clearTimeout(queued.timer);

      // The order this change belongs to is fixed here, not read again when the
      // timer fires — by then the owner may have opened a different one.
      const send = () => {
        timers.current.delete(key);
        flush(openId, row, quantity);
      };
      timers.current.set(key, { timer: setTimeout(send, SAVE_DELAY_MS), send });
    },
    [flush, openId],
  );

  // Leaving the page with a quantity still waiting would silently lose it, so
  // anything queued is sent on the way out rather than dropped.
  useEffect(() => {
    const queue = timers.current;
    return () => {
      for (const { timer, send } of [...queue.values()]) {
        clearTimeout(timer);
        send();
      }
    };
  }, []);

  /* ---------------------------------------------------------------- orders */

  const startOrder = async () => {
    setStarting(true);
    await save("start an order", async () => {
      const fresh = await createOrderAction(todayISO(), null);
      setOrders((current) => [{ ...fresh, itemCount: 0, totalUnits: 0, total: 0 }, ...current]);
      setOrder(fresh);
    });
    setStarting(false);
  };

  const copyOrder = async () => {
    if (!order) return;

    setCopying(true);
    await save("copy that order", async () => {
      const fresh = await copyOrderAction(order.id, todayISO(), null);
      setOrders((current) => [
        {
          ...fresh,
          itemCount: orderItemCount(fresh.lines),
          totalUnits: orderUnitCount(fresh.lines),
          total: orderTotal(fresh.lines),
        },
        ...current,
      ]);
      setOrder(fresh);
    });
    setCopying(false);
  };

  const openOrder = async (id: string) => {
    if (id === order?.id) return;
    setOpeningId(id);
    try {
      const loaded = await loadOrderAction(id);
      if (loaded) setOrder(loaded);
    } catch (cause) {
      console.error(`[truck] Could not open order ${id}:`, cause);
      setError("Couldn't open that order.");
    } finally {
      setOpeningId(null);
    }
  };

  /**
   * Deleting an order takes its history with it, so it asks first. The page
   * then falls back to whichever order is next most recent.
   */
  const deleteOrder = (summary: TruckOrderSummary) => {
    if (
      !confirm(
        `Delete the order from ${formatOrderDate(summary.orderDate)}?\n\n` +
          "Everything on it goes too, and there is no undo.",
      )
    ) {
      return;
    }

    const remaining = orders.filter((existing) => existing.id !== summary.id);
    setOrders(remaining);

    void save("delete that order", async () => {
      await deleteOrderAction(summary.id);
      if (openId !== summary.id) return;
      // The open order is the one that just went; show the next one along.
      const next = remaining[0];
      setOrder(next ? await loadOrderAction(next.id) : null);
    });
  };

  const patchOrder = (patch: OrderPatch) => {
    if (!order) return;

    setOrder({ ...order, ...patch });
    void save("save that change", async () => {
      const updated = await updateOrderAction(order.id, patch);
      setOrder((current) =>
        current && current.id === updated.id ? { ...current, ...updated } : current,
      );
    });
  };

  const fillFromPars = async () => {
    if (!order) return;
    const orderId = order.id;

    setFilling(true);
    await save("fill the sheet", async () => {
      const added = await fillFromParsAction(orderId);
      setOrder((current) =>
        current && current.id === orderId
          ? { ...current, lines: [...current.lines, ...added] }
          : current,
      );
    });
    setFilling(false);
  };

  const clearOrder = () => {
    if (!order || !confirm("Take everything off this order?")) return;

    setOrder({ ...order, lines: [] });
    void save("clear the sheet", () => clearOrderAction(order.id));
  };

  const exportOrder = () => {
    if (!order) return;
    download(orderCsvFilename(order), toOrderCsv(order));
  };

  /* ----------------------------------------------------------------- items */

  /**
   * Add or edit an item. Errors are thrown rather than swallowed into the
   * banner: the form shows them against the field they are about, which is
   * where "that item code is taken" belongs.
   */
  const saveItem = async (draft: TruckItemDraft) => {
    const target = editing?.item;
    if (target) {
      const updated = await updateItemAction(target.id, draft);
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } else {
      const added = await addItemAction(draft);
      setItems((current) => [...current, added]);
    }
  };

  /**
   * Arranging is applied locally and saved in the background, like every other
   * edit here — a nudge that waited on a round trip would make putting a long
   * list in order unbearable.
   */
  const arrange = useCallback(
    (next: TruckItem[]) => {
      // `next` already carries its new positions — the move functions renumber
      // so that a run of nudges each builds on the last.
      setItems(next);
      void save("save that order", () => reorderItemsAction(reorderedIds(next)));
    },
    [save],
  );

  const moveOneItem = useCallback(
    (id: string, direction: MoveDirection) => arrange(moveItem(items, id, direction)),
    [arrange, items],
  );

  const moveOneCategory = useCallback(
    (category: string, direction: MoveDirection) =>
      arrange(moveCategory(items, category, direction)),
    [arrange, items],
  );

  const printSheet = async () => {
    setPrinting(true);
    try {
      const { exportTruckSheetPdf } = await import("@/lib/truck-sheet-pdf");
      await exportTruckSheetPdf({ items });
    } catch (cause) {
      console.error("[truck] Could not build the printable sheet:", cause);
      setError("The printable sheet didn't finish. Please try again.");
    } finally {
      setPrinting(false);
    }
  };

  const removeItem = (item: TruckItem) => {
    if (
      !confirm(
        `Take ${item.name} off the set list?\n\n` +
          "Orders that already have it keep it — it just won't be on the sheet any more.",
      )
    ) {
      return;
    }

    setEditing(null);
    setItems((current) => current.filter((existing) => existing.id !== item.id));
    // The line stays on the order (the database only clears its item id), so
    // re-read rather than guessing at what the sheet should now show.
    void save("remove that item", async () => {
      await removeItemAction(item.id);
      await reload(openId);
    });
  };

  /**
   * An invoice import writes items, orders and lines at once, so rather than
   * trying to fold all that into local state it re-reads everything. The
   * imported deliveries are the newest orders, so the page lands on one of them.
   */
  const importFile = async (csv: string, supplier: string) => {
    const result = await importFileAction(csv, supplier);
    await reload(result.kind === "invoice" && result.ordersAdded > 0 ? null : openId);
    return result;
  };

  /* ------------------------------------------------------------------- UI */

  const categories = [...new Set(items.map((item) => item.category))];

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>

          <div className="mr-auto">
            <h1 className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight">
              <Truck className="size-4 text-brand" />
              Truck order
            </h1>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {order ? (
                <>
                  {formatOrderDate(order.orderDate)}
                  <StatusPill status={order.status} />
                </>
              ) : (
                "Nothing started yet"
              )}
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={printSheet}
            disabled={printing || items.length === 0}
            title={`A blank sheet for the clipboard, with ${ORDER_COLUMNS} dated columns to fill in`}
          >
            {printing ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            ) : (
              <Printer data-icon="inline-start" />
            )}
            Print sheet
          </Button>

          <Button variant="outline" size="sm" onClick={() => setEditing({ item: null })}>
            <PackagePlus data-icon="inline-start" />
            Add item
          </Button>

          <Button size="sm" onClick={startOrder} disabled={starting}>
            {starting ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            ) : (
              <Plus data-icon="inline-start" />
            )}
            New order
          </Button>

          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </form>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive sm:px-6"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="flex-1">{error}</p>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Dismiss"
              onClick={() => setError(null)}
            >
              <X />
            </Button>
          </div>
        )}
      </header>

      <AdminDrawer open={menuOpen} view="truck" onOpenChange={setMenuOpen} />

      <div className="flex flex-1 flex-col gap-4 p-4 sm:px-6 lg:flex-row-reverse lg:items-start">
        <div className="flex w-full shrink-0 flex-col gap-4 lg:w-80 xl:w-96">
          {order ? (
            <OrderPanel
              order={order}
              onPatch={patchOrder}
              onFillFromPars={fillFromPars}
              onClear={clearOrder}
              onCopy={copyOrder}
              onExport={exportOrder}
              busy={{ filling, copying }}
            />
          ) : (
            <div className="rounded-xl border border-border bg-background p-6 text-center shadow-sm">
              <Truck className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">No order open</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Start one and the sheet below becomes editable.
              </p>
              <Button size="sm" className="mt-3" onClick={startOrder} disabled={starting}>
                <Plus data-icon="inline-start" />
                New order
              </Button>
            </div>
          )}

          <OrderHistory
            orders={summaries}
            currentId={order?.id ?? null}
            loadingId={openingId}
            onOpen={openOrder}
            onDelete={deleteOrder}
          />

          <ImportGuide onImport={importFile} />
        </div>

        <div className="min-w-0 flex-1">
          <OrderSheet
            items={items}
            lines={order?.lines ?? []}
            disabled={!order}
            onQuantity={setQuantity}
            onEditItem={(item) => setEditing({ item })}
            onMoveItem={moveOneItem}
            onMoveCategory={moveOneCategory}
          />
        </div>
      </div>

      {editing && (
        <ItemEditor
          item={editing.item}
          categories={categories}
          onSave={saveItem}
          onRemove={editing.item ? () => removeItem(editing.item!) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
