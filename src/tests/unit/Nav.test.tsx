import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// Next's router hooks/components need app context that doesn't exist in jsdom,
// so we stub them to plain values/anchors and test the link data wiring.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import { Nav } from "@/components/Nav";

describe("Nav", () => {
  // The mobile menu re-renders the same links as a sibling of <nav>, so scope
  // assertions to the primary <nav> to avoid duplicate-match errors.
  it("renders the primary navigation links", () => {
    render(<Nav />);
    const nav = within(screen.getByRole("navigation", { name: "Primary" }));
    expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(nav.getByRole("link", { name: "Locations" })).toHaveAttribute(
      "href",
      "/order",
    );
    expect(nav.getByRole("link", { name: "Careers" })).toHaveAttribute(
      "href",
      "/careers",
    );
    expect(nav.getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "/contact",
    );
  });

  it("includes the ordering CTA pointing at the order page", () => {
    render(<Nav />);
    const nav = within(screen.getByRole("navigation", { name: "Primary" }));
    expect(nav.getByRole("link", { name: /order now/i })).toHaveAttribute(
      "href",
      "/order",
    );
  });

  it("has a mobile menu toggle", () => {
    render(<Nav />);
    expect(screen.getByRole("button", { name: /open menu/i })).toBeInTheDocument();
  });
});
