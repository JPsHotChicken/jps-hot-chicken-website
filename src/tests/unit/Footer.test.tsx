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
      ["Locations", "/locations"],
      ["Careers", "/careers"],
      ["Contact", "/contact"],
    ] as const) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
  });

  it("renders a phone number for each location that has one plus the email from siteConfig", () => {
    render(<Footer />);
    const locationsWithPhone = siteConfig.locations.filter((loc) => loc.phone);
    expect(locationsWithPhone.length).toBeGreaterThan(0);
    for (const loc of locationsWithPhone) {
      expect(screen.getByText(formatPhone(loc.phone!))).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: siteConfig.email })).toHaveAttribute(
      "href",
      `mailto:${siteConfig.email}`,
    );
  });

  it("shows the weekly hours including a closed day", () => {
    render(<Footer />);
    expect(screen.getByText("Monday")).toBeInTheDocument();
    expect(screen.getByText("Sunday")).toBeInTheDocument();
    expect(screen.getAllByText("Closed").length).toBeGreaterThan(0);
  });
});
