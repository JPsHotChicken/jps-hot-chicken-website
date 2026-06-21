import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { OrderButton } from "@/components/OrderButton";
import { siteConfig } from "@/data/site";

describe("OrderButton", () => {
  it("links to the third-party ordering URL", () => {
    render(<OrderButton />);
    const link = screen.getByRole("link", { name: /order/i });
    expect(link).toHaveAttribute("href", siteConfig.orderingUrl);
  });

  it("opens in a new tab with safe rel attributes", () => {
    render(<OrderButton />);
    const link = screen.getByRole("link", { name: /order/i });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("renders a custom label when provided", () => {
    render(<OrderButton>Order Pickup</OrderButton>);
    expect(screen.getByRole("link", { name: /order pickup/i })).toBeInTheDocument();
  });
});
