import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock, MapPin, Navigation, Phone, Star } from "lucide-react";

import { siteConfig } from "@/data/site";
import { formatPhone, telHref } from "@/lib/format";
import { getWeekRows } from "@/lib/hours";
import { buildLocationJsonLd, serializeJsonLd } from "@/lib/jsonld";
import { KentuckyIcon, TennesseeIcon } from "@/components/StateIcons";

const STATE_ICONS = { KY: KentuckyIcon, TN: TennesseeIcon } as const;

type Params = Promise<{ slug: string }>;

// Only the known location slugs are valid — anything else 404s.
export const dynamicParams = false;

export function generateStaticParams() {
  return siteConfig.locations.map((loc) => ({ slug: loc.slug }));
}

// Unique, discovery-intent copy per store. The /order/[slug] pages stay purely
// transactional — keep location storytelling here only, so the two pages never
// compete for the same searches.
const LOCATION_COPY: Record<string, { intro: string; body: string }> = {
  "oak-grove": {
    intro:
      "Our original spot on Fort Campbell Blvd brings real Nashville-style hot chicken to Oak Grove, Kentucky and the Fort Campbell community.",
    body:
      "Every order is hand-breaded and fried fresh when you order it, then finished with our signature hot chicken heat. Build the Big Combo — an entree, two sides, two dipping sauces, and a drink — or keep it simple with tenders or a sandwich. Dine in, grab pickup at the counter, or get it delivered through DoorDash and Uber Eats.",
  },
  clarksville: {
    intro:
      "Nashville-style hot chicken lands in Clarksville, Tennessee — our newest location is now open on Trenton Rd.",
    body:
      "It's the same kitchen playbook that made our Oak Grove store a favorite: chicken hand-breaded to order, fried fresh, and spiced the Nashville way. Come by for a sandwich, tenders, or the full Big Combo with sides, dipping sauces, and a drink. Swing through for a quick lunch or bring the whole table's order home.",
  },
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const loc = siteConfig.locations.find((l) => l.slug === slug);
  if (!loc) return {};
  return {
    title: `Hot Chicken in ${loc.city}, ${loc.state}`,
    description: `${siteConfig.name} at ${loc.streetNumber} ${loc.street}, ${loc.city}, ${loc.state} — Nashville-style hot chicken. See hours, get directions, and order online.`,
    alternates: { canonical: `/locations/${loc.slug}` },
  };
}

export default async function LocationPage({ params }: { params: Params }) {
  const { slug } = await params;
  const loc = siteConfig.locations.find((l) => l.slug === slug);
  if (!loc) notFound();

  const StateShape = STATE_ICONS[loc.state];
  const copy = LOCATION_COPY[loc.slug];
  const week = getWeekRows(loc.hours ?? siteConfig.hours);
  const fullAddress = `${loc.streetNumber} ${loc.street}, ${loc.city}, ${loc.state} ${loc.zip}`;
  const mapsQuery = encodeURIComponent(`${siteConfig.name}, ${fullAddress}`);
  const googleMapsHref = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
  const appleMapsHref = `https://maps.apple.com/?q=${mapsQuery}`;
  // Embed by address only — including the business name can snap the pin to
  // whichever store Google already knows about (e.g. Oak Grove's listing).
  const embedSrc = `https://maps.google.com/maps?q=${encodeURIComponent(fullAddress)}&z=15&output=embed`;
  const jsonLd = buildLocationJsonLd(loc);

  return (
    <div className="bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <div className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
        <Link
          href="/locations"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All locations
        </Link>

        {/* Identity + intro */}
        <header className="mt-6">
          {loc.isNew && loc.isOpen && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 font-heading text-[11px] font-bold uppercase tracking-wide text-brand-foreground shadow-sm">
              <Star className="size-3 fill-current" aria-hidden="true" />
              Now Open
            </span>
          )}
          <h1 className="mt-2 font-heading text-3xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-5xl">
            Nashville-Style Hot Chicken in {loc.city}, {loc.state}
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground/90">
            {copy.intro}
          </p>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {copy.body}
          </p>
        </header>

        {/* CTA row */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href={`/order/${loc.slug}`}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 font-heading text-base font-bold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50"
          >
            Order from {loc.name}
            <ArrowRight className="size-5" aria-hidden="true" />
          </Link>
          {loc.phone && (
            <a
              href={telHref(loc.phone)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border-2 border-black bg-card px-6 font-heading text-base font-bold uppercase tracking-wide text-foreground transition-all hover:bg-black hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <Phone className="size-5" aria-hidden="true" />
              {formatPhone(loc.phone)}
            </a>
          )}
        </div>

        {/* NAP + hours + map */}
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <div>
            {/* Address */}
            <div className="flex items-start gap-4">
              <StateShape className="h-16 w-auto shrink-0 text-brand sm:h-20" aria-hidden="true" />
              <div>
                <h2 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-widest text-muted-foreground">
                  <MapPin className="size-4 text-brand" aria-hidden="true" /> Address
                </h2>
                <p className="mt-2 text-lg font-semibold leading-snug">
                  {loc.streetNumber} {loc.street}
                  <br />
                  {loc.city}, {loc.state} {loc.zip}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={googleMapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center justify-center gap-1 rounded-md border-2 border-black bg-card px-3 text-xs font-bold tracking-wide text-foreground transition-all hover:bg-black hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    <MapPin className="size-3.5" aria-hidden="true" />
                    Google Maps
                    <span className="sr-only"> — open in Google Maps (opens in a new tab)</span>
                  </a>
                  <a
                    href={appleMapsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center justify-center gap-1 rounded-md border-2 border-black bg-card px-3 text-xs font-bold tracking-wide text-foreground transition-all hover:bg-black hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  >
                    <Navigation className="size-3.5" aria-hidden="true" />
                    Apple Maps
                    <span className="sr-only"> — open in Apple Maps (opens in a new tab)</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Hours */}
            <div className="mt-8">
              <h2 className="flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-widest text-muted-foreground">
                <Clock className="size-4 text-brand" aria-hidden="true" /> Store Hours
              </h2>
              <dl className="mt-3 max-w-xs space-y-1.5">
                {week.map((row) => (
                  <div
                    key={row.key}
                    className={`flex justify-between gap-4 text-sm ${
                      row.isToday ? "font-bold text-brand" : "text-foreground/80"
                    }`}
                  >
                    <dt>{row.label}</dt>
                    <dd className="whitespace-nowrap">{row.hours}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                Online ordering and delivery close 30 minutes before the store.
              </p>
            </div>
          </div>

          {/* Map embed */}
          <div className="overflow-hidden rounded-2xl border-2 border-border shadow-md">
            <iframe
              src={embedSrc}
              title={`Map to ${siteConfig.name}, ${fullAddress}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
              className="h-72 w-full md:h-full md:min-h-96"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
