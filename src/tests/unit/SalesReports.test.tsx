import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SalesReports } from "@/components/admin/SalesReports";

// The page renders a sign-out form pointed at a Server Action, which has no
// meaning in jsdom.
vi.mock("@/app/admin/actions", () => ({ logout: vi.fn() }));

/**
 * The page, driven the way the owner drives it: pick the export off the disk,
 * look at one report, switch to the other. The real fortnight's export is used
 * rather than a stub, so what these assertions check are the figures that came
 * off an actual week of trade.
 */
const FIXTURE = "src/tests/fixtures/order-summary.xls";

/** The export, as the file input hands it over. */
function exportFile(name = "OrderSummary_2026-08-22_8-56-AM.xls"): File {
  const bytes = readFileSync(FIXTURE);
  const file = new File([bytes], name, { type: "application/vnd.ms-excel" });
  // jsdom's File has no `arrayBuffer`, which is how the page reads it.
  Object.defineProperty(file, "arrayBuffer", {
    value: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  });
  return file;
}

/** Drop a file on the upload control and wait for the figures to appear. */
async function upload(file: File = exportFile()) {
  fireEvent.change(screen.getByLabelText("Spreadsheet"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole("tablist")).toBeInTheDocument());
}

/** The figure printed under a label, as a number. */
function figure(label: string): number {
  const term = screen.getByText(label);
  const value = term.parentElement!.querySelector("dd")!;
  return Number(value.textContent!.replace(/[$,]/g, ""));
}

const labels = () =>
  screen
    .getAllByRole("definition")
    .map((value) => value.parentElement!.querySelector("dt")!.textContent);

describe("reading an export", () => {
  it("shows the owner's five figures, in order, as soon as the file is picked", async () => {
    render(<SalesReports />);
    await upload();

    expect(labels()).toEqual([
      "Gross Sales",
      "Tax",
      "Net Sales",
      "Total Cash (to bank)",
      "DoorDash Sales",
    ]);

    expect(figure("Gross Sales")).toBe(66135.54);
    expect(figure("Tax")).toBe(5696.3);
    expect(figure("Net Sales")).toBe(60014.84);
    expect(figure("Total Cash (to bank)")).toBe(3573.89);
    expect(figure("DoorDash Sales")).toBe(7923.34);
  });

  it("heads the report with the period it covers", async () => {
    render(<SalesReports />);
    await upload();

    expect(screen.getAllByText("August 10 – 21, 2026").length).toBeGreaterThan(0);
    expect(screen.getByText("Owner's Report")).toBeInTheDocument();
  });

  it("says which two lines were added together to make the DoorDash figure", async () => {
    render(<SalesReports />);
    await upload();

    expect(
      screen.getByText("DoorDash - Delivery and DoorDash - Takeout, combined."),
    ).toBeInTheDocument();
  });

  it("names the file it read", async () => {
    render(<SalesReports />);
    await upload();

    expect(screen.getByText(/Read from OrderSummary_2026-08-22/)).toBeInTheDocument();
  });
});

describe("switching between the two reports", () => {
  it("shows the accountant only gross sales and DoorDash", async () => {
    render(<SalesReports />);
    await upload();

    fireEvent.click(within(screen.getByRole("tablist")).getByText("Accountant report"));

    expect(labels()).toEqual(["Gross Sales", "DoorDash Sales"]);
    expect(figure("Gross Sales")).toBe(66135.54);
    expect(figure("DoorDash Sales")).toBe(7923.34);
    expect(screen.getByText("Accountant Report")).toBeInTheDocument();
  });

  it("offers the other report's PDF without leaving the one on screen", async () => {
    render(<SalesReports />);
    await upload();

    expect(screen.getByRole("button", { name: /Accountant PDF/ })).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("tablist")).getByText("Accountant report"));
    expect(screen.getByRole("button", { name: /Owner's PDF/ })).toBeInTheDocument();
  });

  it("goes back to the owner's report when a new export is read", async () => {
    render(<SalesReports />);
    await upload();

    fireEvent.click(within(screen.getByRole("tablist")).getByText("Accountant report"));
    expect(labels()).toHaveLength(2);

    await upload(exportFile("Another.xls"));
    expect(labels()).toHaveLength(5);
  });
});

describe("a file that isn't the right one", () => {
  it("says so, in words the owner can act on", async () => {
    render(<SalesReports />);

    const wrong = new File(["Employee,Hours\nAnn,32\n"], "hours.csv", { type: "text/csv" });
    Object.defineProperty(wrong, "arrayBuffer", {
      value: async () => new TextEncoder().encode("Employee,Hours\nAnn,32\n").buffer,
    });

    fireEvent.change(screen.getByLabelText("Spreadsheet"), { target: { files: [wrong] } });

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/isn't an Excel spreadsheet/),
    );
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("keeps the reports off screen rather than showing an empty one", async () => {
    render(<SalesReports />);
    await upload();
    expect(screen.getByRole("tablist")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Start over/ }));
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });
});
