import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { MenuSection } from "@/components/MenuSection";
import { formatPrice } from "@/lib/format";
import type { MenuSection as MenuSectionType } from "@/data/menu";

const section: MenuSectionType = {
  title: "Test Section",
  description: "A test section",
  items: [
    {
      name: "Nashville Tender",
      description: "Crispy and hot",
      price: 12,
      tags: ["spicy", "gluten-free"],
    },
    {
      name: "Garden Side",
      description: "Fresh and crunchy",
      price: 4.5,
      tags: ["vegetarian"],
    },
  ],
};

describe("MenuSection", () => {
  it("renders the section title and description", () => {
    render(<MenuSection section={section} />);
    expect(screen.getByRole("heading", { name: "Test Section" })).toBeInTheDocument();
    expect(screen.getByText("A test section")).toBeInTheDocument();
  });

  it("renders each item with its name and description", () => {
    render(<MenuSection section={section} />);
    expect(screen.getByText("Nashville Tender")).toBeInTheDocument();
    expect(screen.getByText("Crispy and hot")).toBeInTheDocument();
    expect(screen.getByText("Garden Side")).toBeInTheDocument();
  });

  it("formats prices as currency", () => {
    render(<MenuSection section={section} />);
    expect(screen.getByText(formatPrice(12))).toBeInTheDocument(); // $12
    expect(screen.getByText(formatPrice(4.5))).toBeInTheDocument(); // $4.50
  });

  it("renders dietary tags for an item", () => {
    render(<MenuSection section={section} />);
    const items = screen.getAllByRole("listitem");
    const spicyItem = items.find((el) => within(el).queryByText("Nashville Tender"));
    expect(spicyItem).toBeTruthy();
    expect(within(spicyItem as HTMLElement).getByText(/spicy/i)).toBeInTheDocument();
    expect(within(spicyItem as HTMLElement).getByText(/gluten-free/i)).toBeInTheDocument();
  });
});
