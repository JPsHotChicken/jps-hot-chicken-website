import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaffManagement } from "@/components/admin/StaffManagement";
import type { Employee } from "@/lib/schedule";

const employees: Employee[] = [
  { id: "e1", name: "Alex Morning", group: "morning", loginCode: "1234" },
  { id: "e2", name: "Zoe Nightshift", group: "night", loginCode: null },
];

/** The panel with every callback stubbed, plus the spies worth asserting on. */
function setup(over: Partial<Parameters<typeof StaffManagement>[0]> = {}) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  render(
    <StaffManagement
      employees={employees}
      onSaveCode={vi.fn(async () => {})}
      onRandomCode={vi.fn(async () => {})}
      onAdd={onAdd}
      onRemove={onRemove}
      {...over}
    />,
  );
  return { onAdd, onRemove };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StaffManagement hiring and removing", () => {
  it("adds someone with the shift group that was picked", () => {
    const { onAdd } = setup();

    fireEvent.change(screen.getByLabelText("Employee name"), {
      target: { value: "  Sam Newhire  " },
    });
    fireEvent.change(screen.getByLabelText("Shift group"), { target: { value: "night" } });
    fireEvent.click(screen.getByRole("button", { name: "Add employee" }));

    expect(onAdd).toHaveBeenCalledWith("Sam Newhire", "night");
    // The field clears, ready for the next person.
    expect(screen.getByLabelText("Employee name")).toHaveValue("");
  });

  it("won't add a blank name", () => {
    const { onAdd } = setup();

    fireEvent.change(screen.getByLabelText("Employee name"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Add employee" })).toBeDisabled();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("removes somebody once the warning is accepted", () => {
    const confirmed = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onRemove } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Remove Zoe Nightshift" }));

    expect(confirmed).toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalledWith("e2");
  });

  it("keeps somebody when the warning is dismissed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onRemove } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Remove Alex Morning" }));

    expect(onRemove).not.toHaveBeenCalled();
  });

  it("offers a remove button on every person, under their shift group", () => {
    setup();

    // By heading, not by text — "Night shift" is also an option in the add form.
    const night = screen.getByRole("heading", { name: "Night shift" }).closest("section")!;
    expect(within(night).getByRole("button", { name: "Remove Zoe Nightshift" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(employees.length);
  });
});
