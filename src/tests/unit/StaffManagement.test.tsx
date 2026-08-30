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
  render(
    <StaffManagement
      employees={employees}
      onSavePassword={onSavePassword}
      onRegenerateSetupCode={onRegenerateSetupCode}
      onAdd={onAdd}
      onRemove={onRemove}
      {...over}
    />,
  );
  return { onAdd, onRemove, onSavePassword, onRegenerateSetupCode };
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
