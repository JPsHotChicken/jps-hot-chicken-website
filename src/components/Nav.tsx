"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { siteConfig } from "@/data/site";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <nav
        aria-label="Primary"
        className="mx-auto grid h-16 w-full max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6"
      >
        {/* Left: hamburger (mobile) / inline links (desktop) */}
        <div className="flex items-center justify-self-start">
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

          <div className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center rounded-md px-3 text-base font-semibold transition-colors hover:text-brand",
                  isActive(link.href) ? "text-brand" : "text-foreground/80",
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Center: logo */}
        <Link href="/" className="justify-self-center">
          <Image
            src="/images/logo-nav.png"
            alt={siteConfig.name}
            width={1022}
            height={574}
            priority
            className="h-12 w-auto sm:h-14"
          />
        </Link>

        {/* Right: ordering CTA */}
        <div className="flex items-center justify-self-end">
          <Link
            href="/order"
            className="inline-flex h-6 items-center justify-center rounded-full border-2 border-brand px-3 font-heading text-xs font-semibold tracking-wide text-black transition-colors hover:bg-brand/5"
          >
            Order Now
          </Link>
        </div>
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
                  "flex h-12 items-center rounded-md px-3 text-lg font-semibold transition-colors hover:bg-muted",
                  isActive(link.href) ? "text-brand" : "text-foreground",
                )}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/order"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-full bg-brand px-6 font-heading text-base font-semibold tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110"
            >
              Order Now
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
