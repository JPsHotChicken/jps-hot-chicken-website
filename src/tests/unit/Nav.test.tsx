import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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
import { siteConfig } from "@/data/site";

describe("Nav", () => {
  it("renders the primary navigation links", () => {
    render(<Nav />);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Menu" })).toHaveAttribute("href", "/menu");
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "/contact",
    );
  });

  it("includes the ordering CTA pointing at the third-party URL", () => {
    render(<Nav />);
    expect(screen.getByRole("link", { name: /order/i })).toHaveAttribute(
      "href",
      siteConfig.orderingUrl,
    );
  });

  it("has a mobile menu toggle", () => {
    render(<Nav />);
    expect(screen.getByRole("button", { name: /open menu/i })).toBeInTheDocument();
  });
});
