import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import { Footer } from "@/components/Footer";
import { siteConfig } from "@/data/site";
import { formatPhone } from "@/lib/format";

describe("Footer", () => {
  it("renders the navigation links from config", () => {
    render(<Footer />);
    for (const [label, href] of [
      ["Home", "/"],
      ["About", "/about"],
      ["Contact", "/contact"],
    ] as const) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
  });

  it("renders phone and email from siteConfig", () => {
    render(<Footer />);
    expect(screen.getByText(formatPhone(siteConfig.phone))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: siteConfig.email })).toHaveAttribute(
      "href",
      `mailto:${siteConfig.email}`,
    );
  });

  it("links out to the social profiles from siteConfig", () => {
    render(<Footer />);
    const instagram = screen.getByRole("link", { name: /instagram/i });
    const facebook = screen.getByRole("link", { name: /facebook/i });
    expect(instagram).toHaveAttribute("href", siteConfig.socials.instagram);
    expect(facebook).toHaveAttribute("href", siteConfig.socials.facebook);
  });

  it("shows the weekly hours including a closed day", () => {
    render(<Footer />);
    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("Sunday")).toBeInTheDocument();
    expect(screen.getAllByText("Closed").length).toBeGreaterThan(0);
  });
});
