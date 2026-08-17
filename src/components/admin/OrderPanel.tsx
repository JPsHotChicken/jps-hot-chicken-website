"use client";

import { useState } from "react";
import { CopyPlus, Download, Eraser, ListPlus, LoaderCircle, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import { FIELD_CLASS, LABEL_CLASS } from "./field";
import {
  TRUCK_ORDER_STATUSES,
  TRUCK_ORDER_STATUS_LABELS,
  hasEveryPrice,
  orderItemCount,
  orderTotal,
  orderUnitCount,
  type OrderPatch,
  type TruckOrderDetail,
  type TruckOrderStatus,
} from "@/lib/truck";

type Props = {
  order: TruckOrderDetail;
  onPatch: (patch: OrderPatch) => void;
  onFillFromPars: () => void;
  onClear: () => void;
  onCopy: () => void;
  onExport: () => void;
  busy: { filling: boolean; copying: boolean };
};

/**
 * The open order itself: its dates, where it has got to, and what it comes to.
 *
 * The status is three buttons rather than a dropdown because it is the thing
 * most often changed on a phone in a walk-in, and it only ever moves forward.
 */
export function OrderPanel({
  order,
  onPatch,
  onFillFromPars,
  onClear,
  onCopy,
  onExport,
  busy,
}: Props) {
  // The note is held locally while it is being typed and saved on the way out,
  // so the order isn't written to on every keystroke.
  const [note, setNote] = useState(order.note);

  const itemCount = orderItemCount(order.lines);
  const total = orderTotal(order.lines);
  const complete = hasEveryPrice(order.lines);

  return (
    <div className="rounded-xl border border-border bg-background shadow-sm">
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <Truck className="size-4 text-brand" />
          This order
        </h2>
      </header>

      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS} htmlFor="order-date">
              Ordered
            </label>
            <input
              id="order-date"
              type="date"
              value={order.orderDate}
              onChange={(event) => {
                if (event.target.value) onPatch({ orderDate: event.target.value });
              }}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="delivery-date">
              Truck arrives
            </label>
            <input
              id="delivery-date"
              type="date"
              value={order.deliveryDate ?? ""}
              onChange={(event) => onPatch({ deliveryDate: event.target.value || null })}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </div>
        </div>

        <div>
          <span className={LABEL_CLASS}>Where it&apos;s at</span>
          <div role="group" aria-label="Order status" className="mt-1 flex gap-1">
            {TRUCK_ORDER_STATUSES.map((status: TruckOrderStatus) => (
              <Button
                key={status}
                variant={order.status === status ? "default" : "outline"}
                size="sm"
                aria-pressed={order.status === status}
                className="flex-1"
                onClick={() => onPatch({ status })}
              >
                {TRUCK_ORDER_STATUS_LABELS[status]}
              </Button>
            ))}
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-2 rounded-lg bg-muted px-3 py-2 text-center">
          <div>
            <dt className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
              Items
            </dt>
            <dd className="text-lg font-bold tabular-nums">{itemCount}</dd>
          </div>
          <div>
            <dt className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
              Units
            </dt>
            <dd className="text-lg font-bold tabular-nums">{orderUnitCount(order.lines)}</dd>
          </div>
          <div>
            <dt className="text-[0.65rem] font-semibold tracking-wide text-muted-foreground uppercase">
              {complete ? "Total" : "So far"}
            </dt>
            <dd className="text-lg font-bold tabular-nums">{formatPrice(total)}</dd>
          </div>
        </dl>

        {!complete && itemCount > 0 && (
          <p className="text-xs text-muted-foreground">
            Some items have no price yet, so the total is only what&apos;s priced.
          </p>
        )}

        {/* An imported delivery adds up to the invoice's subtotal — tax and the
            fuel charge are on the invoice but not on any line. */}
        {order.invoiceNumber && (
          <p className="text-xs text-muted-foreground">
            From invoice <span className="font-mono">#{order.invoiceNumber}</span>
            {order.invoiceTotal !== null && (
              <>
                {" "}
                — <span className="font-semibold">{formatPrice(order.invoiceTotal)}</span> charged,
                with tax and fees
              </>
            )}
            .
          </p>
        )}

        <div>
          <label className={LABEL_CLASS} htmlFor="order-note">
            Note
          </label>
          <textarea
            id="order-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => {
              if (note !== order.note) onPatch({ note });
            }}
            rows={2}
            maxLength={1000}
            placeholder="Anything to tell the rep"
            className={`mt-1 resize-y ${FIELD_CLASS}`}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onFillFromPars}
            disabled={busy.filling}
            title="Put every item's usual quantity on the sheet, without touching what's already typed in"
          >
            {busy.filling ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            ) : (
              <ListPlus data-icon="inline-start" />
            )}
            Fill from usual
          </Button>

          <Button variant="outline" size="sm" onClick={onExport} disabled={itemCount === 0}>
            <Download data-icon="inline-start" />
            Export CSV
          </Button>

          <Button variant="outline" size="sm" onClick={onCopy} disabled={busy.copying}>
            {busy.copying ? (
              <LoaderCircle data-icon="inline-start" className="animate-spin" />
            ) : (
              <CopyPlus data-icon="inline-start" />
            )}
            Order this again
          </Button>

          <Button variant="destructive" size="sm" onClick={onClear} disabled={itemCount === 0}>
            <Eraser data-icon="inline-start" />
            Clear sheet
          </Button>
        </div>
      </div>
    </div>
  );
}
