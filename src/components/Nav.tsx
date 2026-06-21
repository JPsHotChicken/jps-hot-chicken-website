"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { siteConfig } from "@/data/site";
import { OrderButton } from "@/components/OrderButton";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/menu", label: "Menu" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [brandFirst, ...brandRest] = siteConfig.name.split(" ");

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <nav
        aria-label="Primary"
        className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6"
      >
        <Link
          href="/"
          className="font-heading text-xl font-bold uppercase tracking-tight text-foreground sm:text-2xl"
        >
          <span className="text-brand">{brandFirst}</span> {brandRest.join(" ")}
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={cn(
                "inline-flex h-11 items-center rounded-md px-3 text-base font-medium transition-colors hover:text-brand",
                isActive(link.href) ? "text-brand" : "text-foreground/80",
              )}
            >
              {link.label}
            </Link>
          ))}
          <OrderButton className="ml-2" />
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          className="inline-flex size-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted md:hidden"
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div id="mobile-menu" className="border-t border-border bg-background md:hidden">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={cn(
                  "flex h-12 items-center rounded-md px-3 text-lg font-medium transition-colors hover:bg-muted",
                  isActive(link.href) ? "text-brand" : "text-foreground",
                )}
              >
                {link.label}
              </Link>
            ))}
            <OrderButton size="lg" className="mt-2 w-full" />
          </div>
        </div>
      )}
    </header>
  );
}
