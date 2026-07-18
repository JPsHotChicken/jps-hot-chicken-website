import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, MapPin, Navigation, Store } from "lucide-react";

import { siteConfig } from "@/data/site";
import { getWeekRows } from "@/lib/hours";

const LOCATION_IMAGES: Record<string, { src: string; alt: string }> = {
  "oak-grove": {
    src: "/images/oakGroveHorseAndFortCampbellBase-1.jpg",
    alt: "Illustration of a horse and Fort Campbell near Oak Grove, KY",
  },
  clarksville: {
    src: "/images/clarksvilleBridge-1.jpg",
    alt: "Illustration of the bridge in Clarksville, TN",
  },
};

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

  const image = LOCATION_IMAGES[loc.slug];
  const week = getWeekRows();
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

        {/* Identity: left-aligned name, hero image, then details beneath */}
        <header className="mt-6">
          <h1 className="mt-1 font-heading text-3xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-5xl">
            {loc.street}
          </h1>
          <p className="mt-1.5 font-heading text-base font-bold uppercase tracking-wide text-foreground sm:text-xl">
            {loc.name}
          </p>
        </header>

        {/* Hero image */}
        {image && (
          <div className="relative mt-6 aspect-[3/2] w-full overflow-hidden rounded-3xl">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              priority
              sizes="(max-width: 640px) 100vw, 576px"
              className="object-cover"
            />
          </div>
        )}

        {/* Details: address + maps on the left, hours inline on the right */}
        <div className="mt-8 flex items-start justify-between gap-4 sm:gap-8">
          <div className="flex flex-col items-start">
            <p className="text-sm leading-snug text-muted-foreground">
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

          <div className="flex flex-col items-start">
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
            <p className="mt-3 flex w-[132px] items-start gap-1.5 rounded-2xl bg-yellow-100 px-3 py-1.5 text-[10px] font-semibold leading-snug text-yellow-900 ring-1 ring-yellow-400 sm:w-[142px] sm:text-[11px]">
              <AlertTriangle className="mt-px size-2.5 shrink-0 text-yellow-600" aria-hidden="true" />
              <span>
                Online ordering/delivery close 30 mins early. Real store hours are 10&nbsp;AM–9&nbsp;PM.
              </span>
            </p>
          </div>
        </div>

        {/* Order: pickup on top, delivery apps smaller below. Each button only
            renders once its real link exists — never a placeholder URL. */}
        <div className="mt-8 flex flex-col gap-3">
          {loc.orderingUrl ? (
            <a
              href={loc.orderingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 font-heading text-lg font-bold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50"
            >
              <Store className="size-6" aria-hidden="true" />
              Place Pickup order
              <span className="sr-only"> from {loc.street} (opens in a new tab)</span>
            </a>
          ) : (
            <p className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted px-6 py-3 text-center font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <Store className="size-5 shrink-0" aria-hidden="true" />
              Online ordering coming soon — come by the store to order
            </p>
          )}
          {(loc.doordashUrl || loc.uberEatsUrl) && (
            <div className="grid grid-cols-2 gap-3">
              {loc.doordashUrl && (
                <a
                  href={loc.doordashUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[#EB1700] px-4 text-sm font-bold tracking-wide text-white shadow-sm transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#EB1700]/40"
                >
                  DoorDash
                  <span className="sr-only"> — order from {loc.street} (opens in a new tab)</span>
                </a>
              )}
              {loc.uberEatsUrl && (
                <a
                  href={loc.uberEatsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center justify-center rounded-full bg-black px-4 text-sm font-bold tracking-wide text-white shadow-sm transition-all hover:brightness-125 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-foreground/30"
                >
                  Uber&nbsp;<span className="text-[#06C167]">Eats</span>
                  <span className="sr-only"> — order from {loc.street} (opens in a new tab)</span>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
