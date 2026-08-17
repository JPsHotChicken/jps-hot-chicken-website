import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrderHistory } from "@/components/admin/OrderHistory";
import type { TruckOrderSummary } from "@/lib/truck";

function summary(overrides: Partial<TruckOrderSummary> = {}): TruckOrderSummary {
  return {
    id: "o1",
    orderDate: "2026-08-14",
    deliveryDate: null,
    status: "draft",
    note: "",
    submittedAt: null,
    receivedAt: null,
    invoiceNumber: "",
    invoiceTotal: null,
    itemCount: 3,
    totalUnits: 7,
    total: 250,
    ...overrides,
  };
}

const row = (label: string) => screen.getByText(label).closest("li")!;

describe("OrderHistory", () => {
  it("shows what an order came to and where it got to", () => {
    render(
      <OrderHistory
        orders={[summary()]}
        currentId={null}
        loadingId={null}
        onOpen={() => {}}
        onDelete={() => {}}
      />,
    );

    const entry = row("Aug 14, 2026");
    expect(within(entry).getByText("Building")).toBeInTheDocument();
    expect(within(entry).getByText(/3 items · 7 units · \$250/)).toBeInTheDocument();
  });

  it("prices an imported delivery at what the invoice charged, not at its lines", () => {
    // The lines only ever add up to the subtotal — tax and fees are on the
    // invoice alone, so showing the line sum would understate what was paid.
    render(
      <OrderHistory
        orders={[
          summary({
            status: "received",
            invoiceNumber: "6883267",
            invoiceTotal: 5095.85,
            total: 4757.76,
            itemCount: 39,
            totalUnits: 99,
          }),
        ]}
        currentId={null}
        loadingId={null}
        onOpen={() => {}}
        onDelete={() => {}}
      />,
    );

    const entry = row("Aug 14, 2026");
    expect(within(entry).getByText("Delivered")).toBeInTheDocument();
    expect(within(entry).getByText(/\$5,095\.85/)).toBeInTheDocument();
    expect(within(entry).getByText(/#6883267/)).toBeInTheDocument();
    expect(within(entry).queryByText(/4,757\.76/)).not.toBeInTheDocument();
  });

  it("opens an order, and asks before deleting one", () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    render(
      <OrderHistory
        orders={[summary()]}
        currentId={null}
        loadingId={null}
        onOpen={onOpen}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByText("Aug 14, 2026"));
    expect(onOpen).toHaveBeenCalledWith("o1");

    fireEvent.click(screen.getByLabelText(/^Delete the order/));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "o1" }));
  });

  it("says so when there is nothing on record", () => {
    render(
      <OrderHistory
        orders={[]}
        currentId={null}
        loadingId={null}
        onOpen={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(screen.getByText("Nothing ordered yet")).toBeInTheDocument();
  });
});
