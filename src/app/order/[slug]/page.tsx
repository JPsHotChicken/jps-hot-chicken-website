import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, MapPin, Navigation, Store } from "lucide-react";

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
  // Trenton (Clarksville) ordering is temporarily turned off — pickup + delivery apps.
  const disabled = loc.slug === "clarksville";
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
            {/* Heading, hours, and the heads-up pill share one container so their
                left edges align. The block itself sits on the right (ml-auto). */}
            <div className="mt-10 ml-auto flex w-fit flex-col items-start">
              <p className="font-heading text-xs font-bold uppercase tracking-wide text-foreground sm:text-sm">
                Online Ordering and
                <br />
                Delivery Hours
              </p>
              <ul className="mt-2 space-y-px text-[11px] sm:text-xs">
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
              {/* Heads-up: online ordering + delivery stop before the store closes. */}
              <p className="mt-3 flex w-[132px] items-start gap-1.5 rounded-2xl bg-yellow-100 px-3 py-1.5 text-[5px] font-semibold leading-snug text-yellow-900 ring-1 ring-yellow-400 sm:w-[142px] sm:text-[11px]">
                <AlertTriangle className="mt-px size-2.5 shrink-0 text-yellow-600" aria-hidden="true" />
                <span>
                  Online ordering/delivery close 30 mins early. Real store hours are 10&nbsp;AM–9&nbsp;PM.
                </span>
              </p>
            </div>
          </div>
        </header>

        {/* Order: pickup on top, delivery apps smaller below */}
        <div className="mt-8 flex flex-col gap-3">
          <a
            href={disabled ? undefined : loc.orderingUrl}
            target={disabled ? undefined : "_blank"}
            rel={disabled ? undefined : "noopener noreferrer"}
            aria-disabled={disabled || undefined}
            tabIndex={disabled ? -1 : undefined}
            title={disabled ? "Temporarily unavailable" : undefined}
            className={`mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 font-heading text-lg font-bold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50${
              disabled ? " pointer-events-none opacity-50 grayscale" : ""
            }`}
          >
            <Store className="size-6" aria-hidden="true" />
            {disabled ? "Pickup Temporarily Unavailable" : "Place Pickup order"}
            <span className="sr-only">
              {disabled ? " — temporarily unavailable" : ` from ${loc.street} (opens in a new tab)`}
            </span>
          </a>
          <div className="grid grid-cols-2 gap-3">
            <a
              href={disabled ? undefined : loc.doordashUrl}
              target={disabled ? undefined : "_blank"}
              rel={disabled ? undefined : "noopener noreferrer"}
              aria-disabled={disabled || undefined}
              tabIndex={disabled ? -1 : undefined}
              title={disabled ? "Temporarily unavailable" : undefined}
              className={`inline-flex h-11 items-center justify-center rounded-full bg-[#EB1700] px-4 text-sm font-bold tracking-wide text-white shadow-sm transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#EB1700]/40${
                disabled ? " pointer-events-none opacity-50 grayscale" : ""
              }`}
            >
              DoorDash
              <span className="sr-only">
                {disabled ? " — temporarily unavailable" : ` — order from ${loc.street} (opens in a new tab)`}
              </span>
            </a>
            <a
              href={disabled ? undefined : loc.uberEatsUrl}
              target={disabled ? undefined : "_blank"}
              rel={disabled ? undefined : "noopener noreferrer"}
              aria-disabled={disabled || undefined}
              tabIndex={disabled ? -1 : undefined}
              title={disabled ? "Temporarily unavailable" : undefined}
              className={`inline-flex h-11 items-center justify-center rounded-full bg-black px-4 text-sm font-bold tracking-wide text-white shadow-sm transition-all hover:brightness-125 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-foreground/30${
                disabled ? " pointer-events-none opacity-50 grayscale" : ""
              }`}
            >
              Uber&nbsp;<span className="text-[#06C167]">Eats</span>
              <span className="sr-only">
                {disabled ? " — temporarily unavailable" : ` — order from ${loc.street} (opens in a new tab)`}
              </span>
            </a>
          </div>
        </div>

        {/* <div className="mt-12 text-center">
          <Link
            href="/"
            className="text-base font-semibold text-brand hover:underline"
          >
            ← Back to home
          </Link>
        </div> */}
      </div>
    </div>
  );
}
