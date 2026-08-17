"use client";

import { History, LoaderCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import {
  TRUCK_ORDER_STATUS_LABELS,
  formatOrderDate,
  type TruckOrderStatus,
  type TruckOrderSummary,
} from "@/lib/truck";

const STATUS_STYLE: Record<TruckOrderStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-amber-400/15 text-amber-700 dark:text-amber-400",
  received: "bg-emerald-400/15 text-emerald-700 dark:text-emerald-400",
};

type Props = {
  orders: TruckOrderSummary[];
  currentId: string | null;
  /** Which order is being fetched, so the row that was clicked can say so. */
  loadingId: string | null;
  onOpen: (id: string) => void;
  onDelete: (order: TruckOrderSummary) => void;
};

export function StatusPill({ status }: { status: TruckOrderStatus }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[0.65rem] font-bold tracking-wide uppercase ${STATUS_STYLE[status]}`}
    >
      {TRUCK_ORDER_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Every order that has been placed, most recent first.
 *
 * This is the record the page exists to keep: what went on the truck, when, and
 * what it came to. Opening one loads it into the sheet exactly as it was.
 */
export function OrderHistory({ orders, currentId, loadingId, onOpen, onDelete }: Props) {
  return (
    <div className="rounded-xl border border-border bg-background shadow-sm">
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <History className="size-4 text-brand" />
          Previous orders
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {orders.length === 0
            ? "Nothing ordered yet"
            : `${orders.length} order${orders.length === 1 ? "" : "s"} on record`}
        </p>
      </header>

      {orders.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Start an order and it will show up here.
        </p>
      ) : (
        <ul className="max-h-[32rem] divide-y divide-border overflow-y-auto">
          {orders.map((order) => {
            const current = order.id === currentId;
            return (
              <li key={order.id} className={`flex items-center gap-2 ${current ? "bg-brand/5" : ""}`}>
                <button
                  type="button"
                  onClick={() => onOpen(order.id)}
                  aria-current={current ? "true" : undefined}
                  className="min-w-0 flex-1 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {formatOrderDate(order.orderDate)}
                    </span>
                    {loadingId === order.id && (
                      <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                    )}
                    <StatusPill status={order.status} />
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">
                    {order.itemCount} item{order.itemCount === 1 ? "" : "s"} ·{" "}
                    {order.totalUnits.toLocaleString()} unit
                    {order.totalUnits === 1 ? "" : "s"}
                    {/* An imported delivery is worth showing at what it was
                        actually charged, not at what its lines add up to. */}
                    {order.invoiceTotal !== null
                      ? ` · ${formatPrice(order.invoiceTotal)}`
                      : order.total > 0 && ` · ${formatPrice(order.total)}`}
                    {order.invoiceNumber && ` · #${order.invoiceNumber}`}
                    {!order.invoiceNumber &&
                      order.deliveryDate &&
                      ` · in ${formatOrderDate(order.deliveryDate)}`}
                  </span>
                </button>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="mr-2"
                  aria-label={`Delete the order from ${formatOrderDate(order.orderDate)}`}
                  onClick={() => onDelete(order)}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
