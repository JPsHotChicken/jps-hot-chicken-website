import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrderSheet } from "@/components/admin/OrderSheet";
import type { TruckItem, TruckOrderLine } from "@/lib/truck";

function item(overrides: Partial<TruckItem> = {}): TruckItem {
  return {
    id: "i1",
    name: "Chicken tenders",
    category: "Chicken",
    unit: "case",
    packSize: "4/5 LB",
    brand: "",
    supplier: "Performance Food Group",
    supplierItemCode: "",
    unitPrice: null,
    parQuantity: 0,
    sortOrder: 0,
    ...overrides,
  };
}

const items = [
  item({ id: "i1", name: "Chicken tenders", unitPrice: 42.5, supplierItemCode: "123456" }),
  item({ id: "i2", name: "Brioche buns", category: "Bread & Buns", unitPrice: 18 }),
  item({ id: "i3", name: "Pickles", category: "Produce" }),
];

const line = (overrides: Partial<TruckOrderLine>): TruckOrderLine => ({
  id: "l1",
  itemId: "i1",
  name: "Chicken tenders",
  category: "Chicken",
  unit: "case",
  packSize: "4/5 LB",
  supplierItemCode: "123456",
  unitPrice: 42.5,
  quantity: 2,
  sortOrder: 0,
  ...overrides,
});

const row = (name: string) => screen.getByText(name).closest("li")!;

/** Render the sheet, filling in whatever the test doesn't care about. */
function sheet(props: Partial<React.ComponentProps<typeof OrderSheet>> = {}) {
  return render(
    <OrderSheet
      items={items}
      lines={[]}
      onQuantity={() => {}}
      onEditItem={() => {}}
      onMoveItem={() => {}}
      onMoveCategory={() => {}}
      {...props}
    />,
  );
}

/** Put the sheet into arrange mode, where the up/down controls appear. */
const startArranging = () => fireEvent.click(screen.getByRole("button", { name: "Arrange" }));

describe("OrderSheet", () => {
  it("lists every set item, ordered or not, grouped into sections", () => {
    sheet({ items: items, lines: [], onQuantity: () => {}, onEditItem: () => {} });

    for (const name of ["Chicken tenders", "Brioche buns", "Pickles"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // Sections follow DEFAULT_CATEGORIES — the order the walk-in is laid out
    // in — rather than the alphabet or the order the items were added.
    const sections = screen.getAllByRole("heading", { level: 3 }).map((el) => el.textContent);
    expect(sections.map((text) => text?.replace(/\d+\/\d+$/, ""))).toEqual([
      "Chicken",
      "Produce",
      "Bread & Buns",
    ]);
  });

  it("shows the quantity on the order and what that line comes to", () => {
    sheet({ items: items, lines: [line({ quantity: 2 })], onQuantity: () => {}, onEditItem: () => {} });

    const tenders = row("Chicken tenders");
    expect(within(tenders).getByLabelText("How many Chicken tenders")).toHaveValue("2");
    expect(within(tenders).getByText("$85")).toBeInTheDocument();
    // An item with no price says so rather than reading as free.
    expect(within(row("Pickles")).getByText("—")).toBeInTheDocument();
  });

  it("steps a quantity up and down by one", () => {
    const onQuantity = vi.fn();
    sheet({ items: items, lines: [line({ quantity: 2 })], onQuantity: onQuantity, onEditItem: () => {} });

    fireEvent.click(screen.getByLabelText("One more Chicken tenders"));
    expect(onQuantity).toHaveBeenLastCalledWith(expect.objectContaining({ key: "i1" }), 3);

    fireEvent.click(screen.getByLabelText("One less Chicken tenders"));
    expect(onQuantity).toHaveBeenLastCalledWith(expect.objectContaining({ key: "i1" }), 1);
  });

  it("saves a typed quantity once, on the way out of the field", () => {
    const onQuantity = vi.fn();
    sheet({ items: items, lines: [], onQuantity: onQuantity, onEditItem: () => {} });

    const field = screen.getByLabelText("How many Pickles");
    fireEvent.change(field, { target: { value: "1" } });
    fireEvent.change(field, { target: { value: "12" } });
    // Still nothing — a half-typed "1" must not be saved as an order for one.
    expect(onQuantity).not.toHaveBeenCalled();

    fireEvent.blur(field);
    expect(onQuantity).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ key: "i3" }), 12);
  });

  it("clearing the field takes the item off the order", () => {
    const onQuantity = vi.fn();
    sheet({ items: items, lines: [line({ quantity: 2 })], onQuantity: onQuantity, onEditItem: () => {} });

    const field = screen.getByLabelText("How many Chicken tenders");
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.blur(field);
    expect(onQuantity).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ key: "i1" }), 0);
  });

  it("keeps a line whose item has been deleted, and says why it looks odd", () => {
    sheet({ items: items, lines: [line({ id: "l9", itemId: null, name: "Discontinued slaw", quantity: 4 })], onQuantity: () => {}, onEditItem: () => {} });

    const orphan = row("Discontinued slaw");
    expect(within(orphan).getByText("no longer carried")).toBeInTheDocument();
    expect(within(orphan).getByLabelText("How many Discontinued slaw")).toHaveValue("4");
    // There is no item left to edit, so no pencil.
    expect(within(orphan).queryByLabelText(/^Edit /)).not.toBeInTheDocument();
  });

  it("narrows to what is on the truck", () => {
    sheet({ items: items, lines: [line({ quantity: 2 })], onQuantity: () => {}, onEditItem: () => {} });

    fireEvent.click(screen.getByRole("button", { name: /On the truck/ }));
    expect(screen.getByText("Chicken tenders")).toBeInTheDocument();
    expect(screen.queryByText("Pickles")).not.toBeInTheDocument();
  });

  it("finds an item by its distributor code", () => {
    sheet({ items: items, lines: [], onQuantity: () => {}, onEditItem: () => {} });

    fireEvent.change(screen.getByLabelText("Find an item"), { target: { value: "123456" } });
    expect(screen.getByText("Chicken tenders")).toBeInTheDocument();
    expect(screen.queryByText("Brioche buns")).not.toBeInTheDocument();
  });

  it("does not let a quantity be typed with no order open", () => {
    sheet({ disabled: true });
    expect(screen.getByLabelText("How many Pickles")).toBeDisabled();
  });
});

describe("arranging the sheet", () => {
  it("swaps quantity fields for move controls", () => {
    sheet();
    expect(screen.queryByLabelText("Move Chicken tenders up")).not.toBeInTheDocument();

    startArranging();
    expect(screen.getByLabelText("Move Chicken tenders down")).toBeInTheDocument();
    // Counting and rearranging are different jobs; only one is on at a time.
    expect(screen.queryByLabelText("How many Chicken tenders")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Find an item")).not.toBeInTheDocument();
  });

  it("moves an item, and a whole section", () => {
    const onMoveItem = vi.fn();
    const onMoveCategory = vi.fn();
    sheet({
      items: [...items, item({ id: "i4", name: "Chicken wings", sortOrder: 1 })],
      onMoveItem,
      onMoveCategory,
    });

    startArranging();
    fireEvent.click(screen.getByLabelText("Move Chicken wings up"));
    expect(onMoveItem).toHaveBeenCalledWith("i4", -1);

    fireEvent.click(screen.getByLabelText("Move the Produce section up"));
    expect(onMoveCategory).toHaveBeenCalledWith("Produce", -1);
  });

  it("will not move an item past the end of its own section", () => {
    // Chicken tenders is the only item in Chicken, so it has nowhere to go.
    sheet();
    startArranging();
    expect(screen.getByLabelText("Move Chicken tenders up")).toBeDisabled();
    expect(screen.getByLabelText("Move Chicken tenders down")).toBeDisabled();
  });

  it("will not move the first section up or the last one down", () => {
    sheet();
    startArranging();
    expect(screen.getByLabelText("Move the Chicken section up")).toBeDisabled();
    expect(screen.getByLabelText("Move the Bread & Buns section down")).toBeDisabled();
    expect(screen.getByLabelText("Move the Produce section up")).toBeEnabled();
  });

  it("offers nothing to move on a line whose item is gone", () => {
    sheet({
      lines: [line({ id: "l9", itemId: null, name: "Discontinued slaw", quantity: 4 })],
    });
    startArranging();
    expect(screen.queryByLabelText("Move Discontinued slaw up")).not.toBeInTheDocument();
  });
});
