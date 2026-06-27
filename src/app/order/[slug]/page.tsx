import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Navigation, Store } from "lucide-react";

import { siteConfig } from "@/data/site";
import { getWeekRows } from "@/lib/hours";
import { KentuckyIcon, TennesseeIcon } from "@/components/StateIcons";

const STATE_ICONS = { KY: KentuckyIcon, TN: TennesseeIcon } as const;

type Params = Promise<{ slug: string }>;

// Only the known location slugs are valid — anything else 404s.
export const dynamicParams = false;

export function generateStaticParams() {
  return siteConfig.locations.map((loc) => ({ slug: loc.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const loc = siteConfig.locations.find((l) => l.slug === slug);
  if (!loc) return {};
  return {
    title: `Order in ${loc.city}, ${loc.state}`,
    description: `Order ${siteConfig.name} from our ${loc.street} location in ${loc.city}, ${loc.state} — pickup, DoorDash, or Uber Eats.`,
    alternates: { canonical: `/order/${loc.slug}` },
  };
}

export default async function LocationOrderPage({ params }: { params: Params }) {
  const { slug } = await params;
  const loc = siteConfig.locations.find((l) => l.slug === slug);
  if (!loc) notFound();

  const StateShape = STATE_ICONS[loc.state];
  const week = getWeekRows();
  // The state silhouettes sit in the upper part of their viewBox with empty
  // space below (TN is wide and short, so it has the most). Pull the address +
  // maps buttons up into that dead space so they sit just under the shape.
  const iconPull = loc.state === "TN" ? "-mb-14 sm:-mb-20" : "-mb-10 sm:-mb-16";
  const fullAddress = `${loc.streetNumber} ${loc.street}, ${loc.city} ${loc.state} ${loc.zip}`;
  const mapsQuery = encodeURIComponent(`${siteConfig.name}, ${fullAddress}`);
  const googleMapsHref = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
  const appleMapsHref = `https://maps.apple.com/?q=${mapsQuery}`;

  return (
    <div className="bg-white">
      <div className="mx-auto w-full max-w-xl px-4 py-14 sm:px-6 sm:py-20">
        <Link
          href="/order"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All locations
        </Link>

        {/* Identity: left column = state icon, address, maps; right = name + hours */}
        <header className="mt-6 flex items-start gap-4 sm:gap-7">
          {/* Left: large state icon with address + maps beneath it */}
          <div className="flex shrink-0 flex-col items-start">
            <StateShape
              className={`h-28 w-auto text-brand sm:h-44 ${iconPull}`}
              aria-hidden="true"
            />
            <p className="mt-10 text-sm leading-snug text-muted-foreground">
              {loc.streetNumber} {loc.street}
              <br />
              {loc.city}, {loc.state} {loc.zip}
            </p>
            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
              <a
                href={googleMapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center justify-center gap-1 rounded-md border-2 border-black bg-card px-2.5 text-[11px] font-bold tracking-wide text-foreground transition-all hover:bg-black hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <MapPin className="size-3" aria-hidden="true" />
                Google Maps
                <span className="sr-only">
                  {" "}
                  — open {loc.street} in Google Maps (opens in a new tab)
                </span>
              </a>
              <a
                href={appleMapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center justify-center gap-1 rounded-md border-2 border-black bg-card px-2.5 text-[11px] font-bold tracking-wide text-foreground transition-all hover:bg-black hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <Navigation className="size-3" aria-hidden="true" />
                Apple Maps
                <span className="sr-only">
                  {" "}
                  — open {loc.street} in Apple Maps (opens in a new tab)
                </span>
              </a>
            </div>
          </div>

          {/* Right: name + hours */}
          <div className="min-w-0 flex-1 mt-5">
            {/* Clarksville is established — no "Now Open" badge on its page. */}
            {loc.isNew && loc.slug !== "clarksville" && (
              <span className="inline-block rounded-full bg-brand px-3 py-1 font-heading text-[11px] font-bold uppercase tracking-wide text-brand-foreground shadow-sm">
                Now Open
              </span>
            )}
            <h1 className="mt-1 font-heading text-2xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-5xl">
              {loc.street}
            </h1>
            <p className="mt-1.5 font-heading text-base font-bold uppercase tracking-wide text-foreground sm:text-xl">
              {loc.name}
            </p>
            <p className="mt-10 font-heading text-xs font-bold uppercase tracking-wide text-foreground sm:text-sm">
              Online Ordering / Delivery Hours
            </p>
            <ul className="mt-2 space-y-px pl-20 text-[11px] sm:pl-8 sm:text-xs">
              {week.map((row) => (
                <li
                  key={row.key}
                  className={`flex gap-2 ${row.isToday ? "font-bold text-foreground" : "text-muted-foreground"
                    }`}
                >
                  <span className="w-16 shrink-0">{row.label}</span>
                  <span>{row.hours}</span>
                </li>
              ))}
            </ul>
          </div>
        </header>

        {/* Order: pickup on top, delivery apps smaller below */}
        <div className="mt-8 flex flex-col gap-3">
          <a
            href={loc.orderingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-10 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-brand px-6 font-heading text-lg font-bold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50"
          >
            <Store className="size-6" aria-hidden="true" />
            Place Pickup order
            <span className="sr-only"> from {loc.street} (opens in a new tab)</span>
          </a>
          <div className="grid grid-cols-2 gap-3">
            <a
              href={loc.doordashUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-full bg-[#EB1700] px-4 text-sm font-bold tracking-wide text-white shadow-sm transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#EB1700]/40"
            >
              DoorDash
              <span className="sr-only"> — order from {loc.street} (opens in a new tab)</span>
            </a>
            <a
              href={loc.uberEatsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-full bg-black px-4 text-sm font-bold tracking-wide text-white shadow-sm transition-all hover:brightness-125 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-foreground/30"
            >
              Uber&nbsp;<span className="text-[#06C167]">Eats</span>
              <span className="sr-only"> — order from {loc.street} (opens in a new tab)</span>
            </a>
          </div>
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/"
            className="text-base font-semibold text-brand hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
