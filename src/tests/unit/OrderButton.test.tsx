import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { OrderButton } from "@/components/OrderButton";

describe("OrderButton", () => {
  it("links to the internal /order location picker by default", () => {
    render(<OrderButton />);
    const link = screen.getByRole("link", { name: /order/i });
    expect(link).toHaveAttribute("href", "/order");
    expect(link).not.toHaveAttribute("target");
  });

  it("opens external ordering URLs in a new tab with safe rel attributes", () => {
    render(<OrderButton href="https://example.com/order" />);
    const link = screen.getByRole("link", { name: /order/i });
    expect(link).toHaveAttribute("href", "https://example.com/order");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("renders a custom label when provided", () => {
    render(<OrderButton>Order Pickup</OrderButton>);
    expect(screen.getByRole("link", { name: /order pickup/i })).toBeInTheDocument();
  });
});
