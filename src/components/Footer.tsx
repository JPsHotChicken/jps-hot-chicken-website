import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";

import { siteConfig } from "@/data/site";
import { formatPhone, telHref } from "@/lib/format";
import { getWeekRows } from "@/lib/hours";
import { FacebookIcon, InstagramIcon } from "@/components/icons";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/careers", label: "Careers" },
  { href: "/contact", label: "Contact" },
];

export function Footer() {
  const { address } = siteConfig;
  const [brandFirst, ...brandRest] = siteConfig.name.split(" ");
  const mapsQuery = encodeURIComponent(
    `${siteConfig.name}, ${address.street}, ${address.city}, ${address.state} ${address.zip}`,
  );
  const week = getWeekRows();

  return (
    <footer className="mt-auto border-t border-border bg-foreground text-background">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        {/* Brand + socials */}
        <div className="md:col-span-1">
          <p className="font-heading text-xl font-bold tracking-tight">
            <span className="text-brand-light">{brandFirst}</span> {brandRest.join(" ")}
          </p>
          <p className="mt-2 text-sm text-background/70">{siteConfig.tagline}</p>
          <div className="mt-4 flex gap-3">
            <a
              href={siteConfig.socials.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="JP's Hot Chicken on Instagram (opens in a new tab)"
              className="inline-flex size-11 items-center justify-center rounded-full bg-background/10 transition-colors hover:bg-background/20"
            >
              <InstagramIcon className="size-5" />
            </a>
            <a
              href={siteConfig.socials.facebook}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="JP's Hot Chicken on Facebook (opens in a new tab)"
              className="inline-flex size-11 items-center justify-center rounded-full bg-background/10 transition-colors hover:bg-background/20"
            >
              <FacebookIcon className="size-5" />
            </a>
          </div>
        </div>

        {/* Contact */}
        <div>
          <h2 className="font-heading text-sm font-semibold tracking-widest text-background/60">
            Visit & Contact
          </h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-5 shrink-0 text-brand-light" />
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {address.street}
                <br />
                {address.city}, {address.state} {address.zip}
              </a>
            </li>
            <li className="flex items-center gap-3">
              <Phone className="size-5 shrink-0 text-brand-light" />
              <a href={telHref(siteConfig.phone)} className="hover:underline">
                {formatPhone(siteConfig.phone)}
              </a>
            </li>
            <li className="flex items-center gap-3">
              <Mail className="size-5 shrink-0 text-brand-light" />
              <a href={`mailto:${siteConfig.email}`} className="hover:underline">
                {siteConfig.email}
              </a>
            </li>
          </ul>
        </div>

        {/* Hours */}
        <div>
          <h2 className="flex items-center gap-2 font-heading text-sm font-semibold tracking-widest text-background/60">
            <Clock className="size-4 text-brand-light" /> Hours
          </h2>
          <ul className="mt-4 space-y-1.5 text-sm">
            {week.map((row) => (
              <li
                key={row.key}
                className={`flex justify-between gap-4 ${
                  row.isToday ? "font-semibold text-background" : "text-background/70"
                }`}
              >
                <span>{row.label}</span>
                <span>{row.hours}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Explore */}
        <div>
          <h2 className="font-heading text-sm font-semibold tracking-widest text-background/60">
            Explore
          </h2>
          <ul className="mt-4 space-y-1 text-sm">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex h-9 items-center text-background/80 transition-colors hover:text-brand-light"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-background/10">
        <p className="mx-auto w-full max-w-6xl px-4 py-6 text-center text-xs text-background/50 sm:px-6">
          © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
