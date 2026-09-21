import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StaffManagement } from "@/components/admin/StaffManagement";
import type { Employee } from "@/lib/schedule";

const employees: Employee[] = [
  { id: "e1", name: "Alex Morning", group: "morning", setupCode: "12345", password: "hotsauce" },
  { id: "e2", name: "Zoe Nightshift", group: "night", setupCode: "54321", password: null },
];

/** The panel with every callback stubbed, plus the spies worth asserting on. */
function setup(over: Partial<Parameters<typeof StaffManagement>[0]> = {}) {
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  const onSavePassword = vi.fn(async () => {});
  const onRegenerateSetupCode = vi.fn(async () => {});
  const onRename = vi.fn(async () => {});
  render(
    <StaffManagement
      employees={employees}
      onSavePassword={onSavePassword}
      onRegenerateSetupCode={onRegenerateSetupCode}
      onRename={onRename}
      onAdd={onAdd}
      onRemove={onRemove}
      {...over}
    />,
  );
  return { onAdd, onRemove, onSavePassword, onRegenerateSetupCode, onRename };
}

/** The password box on one person's row. */
function passwordBox(name: string) {
  return screen.getByLabelText(`Password for ${name}`);
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

describe("StaffManagement renaming", () => {
  it("saves a new name, trimmed, and closes the box", async () => {
    const { onRename } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Edit Alex Morning's name" }));
    fireEvent.change(screen.getByLabelText("New name for Alex Morning"), {
      target: { value: "  Alex Mornington  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    await waitFor(() => expect(onRename).toHaveBeenCalledWith("e1", "Alex Mornington"));
    await waitFor(() =>
      expect(screen.queryByLabelText("New name for Alex Morning")).not.toBeInTheDocument(),
    );
  });

  it("saves on Enter and backs out on Escape", async () => {
    const { onRename } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Edit Zoe Nightshift's name" }));
    const box = screen.getByLabelText("New name for Zoe Nightshift");
    fireEvent.change(box, { target: { value: "Zoey Nightshift" } });
    fireEvent.keyDown(box, { key: "Escape" });

    expect(screen.queryByLabelText("New name for Zoe Nightshift")).not.toBeInTheDocument();
    expect(onRename).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit Zoe Nightshift's name" }));
    // Reopening starts from the real name, not the abandoned edit.
    expect(screen.getByLabelText("New name for Zoe Nightshift")).toHaveValue("Zoe Nightshift");
    fireEvent.change(screen.getByLabelText("New name for Zoe Nightshift"), {
      target: { value: "Zoey Nightshift" },
    });
    fireEvent.keyDown(screen.getByLabelText("New name for Zoe Nightshift"), { key: "Enter" });

    await waitFor(() => expect(onRename).toHaveBeenCalledWith("e2", "Zoey Nightshift"));
  });

  it("won't save a blank name, and doesn't write an unchanged one", () => {
    const { onRename } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Edit Alex Morning's name" }));
    const box = screen.getByLabelText("New name for Alex Morning");
    fireEvent.change(box, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save name" })).toBeDisabled();

    fireEvent.change(box, { target: { value: "Alex Morning" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("New name for Alex Morning")).not.toBeInTheDocument();
  });

  it("keeps the box open with the error when the save fails", async () => {
    const onRename = vi.fn(async () => {
      throw new Error("Couldn't save that name. Please try again.");
    });
    setup({ onRename });

    fireEvent.click(screen.getByRole("button", { name: "Edit Alex Morning's name" }));
    fireEvent.change(screen.getByLabelText("New name for Alex Morning"), {
      target: { value: "Alexandra Morning" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save that name");
    expect(screen.getByLabelText("New name for Alex Morning")).toHaveValue("Alexandra Morning");
  });
});

describe("StaffManagement rules sign-off", () => {
  it("says who has signed the rules, who is part way, and who hasn't started", () => {
    render(
      <StaffManagement
        employees={[
          ...employees,
          { id: "e3", name: "Sam Partway", group: "other", setupCode: null, password: "halfway" },
        ]}
        rulesProgress={{
          e1: { signed: 4, completedAt: "2026-09-20T15:00:00Z" },
          e3: { signed: 2, completedAt: null },
        }}
        onSavePassword={vi.fn(async () => {})}
        onRegenerateSetupCode={vi.fn(async () => {})}
        onRename={vi.fn(async () => {})}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText("Signed the rules · Sep 20, 2026")).toBeInTheDocument();
    expect(screen.getByText(/Signed 2 of \d+ rules pages/)).toBeInTheDocument();
    expect(screen.getByText("Hasn't signed the rules yet")).toBeInTheDocument();
  });
});

describe("StaffManagement setup codes", () => {
  it("shows each person's five digit code so it can be read out", () => {
    setup();

    expect(screen.getByLabelText("Setup code for Alex Morning")).toHaveTextContent("12345");
    expect(screen.getByLabelText("Setup code for Zoe Nightshift")).toHaveTextContent("54321");
  });

  it("shows a code as used once its owner has a password", () => {
    // What the database looks like after setup: password set, code spent.
    render(
      <StaffManagement
        employees={[
          { id: "e3", name: "Sam Setup", group: "other", setupCode: null, password: "allsorted" },
        ]}
        onSavePassword={vi.fn(async () => {})}
        onRegenerateSetupCode={vi.fn(async () => {})}
        onRename={vi.fn(async () => {})}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Setup code for Sam Setup")).toHaveTextContent("Used");
    // The dice is still there — a new code is how somebody picks a new password.
    expect(
      screen.getByRole("button", { name: "Pick a new setup code for Sam Setup" }),
    ).toBeEnabled();
  });

  it("issues a new code without touching the password", async () => {
    const { onRegenerateSetupCode, onSavePassword } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Pick a new setup code for Alex Morning" }));

    await waitFor(() => expect(onRegenerateSetupCode).toHaveBeenCalledWith("e1"));
    expect(onSavePassword).not.toHaveBeenCalled();
  });
});

describe("StaffManagement passwords", () => {
  it("keeps passwords covered until they are asked for", () => {
    setup();

    const box = passwordBox("Alex Morning");
    // The value is there to be revealed, but the field renders it as dots and
    // refuses edits until View password is pressed.
    expect(box).toHaveAttribute("type", "password");
    expect(box).toHaveAttribute("readonly");
    expect(box).toHaveValue("hotsauce");
  });

  it("reveals one password without revealing the rest", () => {
    setup();

    const rows = screen.getAllByRole("button", { name: "View password" });
    fireEvent.click(rows[0]);

    expect(passwordBox("Alex Morning")).toHaveAttribute("type", "text");
    expect(passwordBox("Zoe Nightshift")).toHaveAttribute("type", "password");
  });

  it("saves an edited password", async () => {
    const { onSavePassword } = setup();

    fireEvent.click(screen.getAllByRole("button", { name: "View password" })[0]);
    fireEvent.change(passwordBox("Alex Morning"), { target: { value: "newpass" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSavePassword).toHaveBeenCalledWith("e1", "newpass"));
  });

  it("won't save a password under five characters", () => {
    const { onSavePassword } = setup();

    fireEvent.click(screen.getAllByRole("button", { name: "View password" })[0]);
    fireEvent.change(passwordBox("Alex Morning"), { target: { value: "four" } });

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(onSavePassword).not.toHaveBeenCalled();
  });

  it("shows a refusal against the row it belongs to", async () => {
    const onSavePassword = vi.fn(async () => {
      throw new Error("That password is already in use. Please choose a different one.");
    });
    setup({ onSavePassword });

    fireEvent.click(screen.getAllByRole("button", { name: "View password" })[0]);
    fireEvent.change(passwordBox("Alex Morning"), { target: { value: "takenpw" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("already in use");
  });

  it("says who still has to go through setup", () => {
    setup();

    expect(screen.getByText(/Hasn't set a password yet/)).toBeInTheDocument();
  });
});
