import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ItemEditor } from "@/components/admin/ItemEditor";
import type { TruckItem } from "@/lib/truck";

const item: TruckItem = {
  id: "i1",
  name: "Fries",
  category: "Other",
  unit: "case",
  packSize: "",
  brand: "",
  supplier: "Performance Food Group",
  supplierItemCode: "",
  unitPrice: null,
  parQuantity: 0,
  sortOrder: 0,
};

describe("ItemEditor category", () => {
  it("offers every section, not just the one the item is in", () => {
    render(<ItemEditor item={item} categories={["Other", "Wings"]} onSave={vi.fn()} onClose={vi.fn()} />);
    const select = screen.getByLabelText("Category") as HTMLSelectElement;
    const options = [...select.options].map((option) => option.textContent);

    expect(options).toEqual(expect.arrayContaining(["Frozen", "Refrigerated", "Chicken", "Wings"]));
    expect(options.at(-2)).toBe("Other");
    expect(options.at(-1)).toBe("New category…");
  });

  it("saves a picked section", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ItemEditor item={item} categories={[]} onSave={onSave} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Frozen" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].category).toBe("Frozen");
  });

  it("saves a newly typed section", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ItemEditor item={item} categories={[]} onSave={onSave} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "__new_category__" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Sides" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].category).toBe("Sides");
  });
});
