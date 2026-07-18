import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin, Star } from "lucide-react";

import { siteConfig } from "@/data/site";

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

export const metadata: Metadata = {
  title: "Locations",
  description: `Find ${siteConfig.name} near you — ${siteConfig.locations
    .map((loc) => `${loc.city}, ${loc.state}`)
    .join(" and ")}. Addresses, hours, directions, and online ordering for every location.`,
  alternates: { canonical: "/locations" },
};

export default function LocationsPage() {
  return (
    <div className="bg-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        <header className="text-center">
          <h1 className="font-heading text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl">
            Our Locations
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            {siteConfig.tagline} in{" "}
            {siteConfig.locations.map((loc) => `${loc.city}, ${loc.state}`).join(" and ")}.
            Pick your store for hours, directions, and ordering.
          </p>
        </header>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 sm:gap-8">
          {siteConfig.locations.map((loc) => {
            const image = LOCATION_IMAGES[loc.slug];
            return (
              <div
                key={loc.slug}
                className="group relative flex overflow-hidden rounded-3xl border-2 border-black bg-white shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl"
              >
                {loc.isNew && (
                  <span className="absolute left-4 top-4 z-10 inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 font-heading text-[11px] font-bold uppercase tracking-wide text-brand-foreground shadow-sm">
                    <Star className="size-3 fill-current" aria-hidden="true" />
                    New
                  </span>
                )}
                {image && (
                  <div className="relative w-1/3 shrink-0 bg-white sm:w-2/5">
                    <Image
                      src={image.src}
                      alt={image.alt}
                      fill
                      sizes="(max-width: 640px) 33vw, 240px"
                      className="object-cover"
                    />
                    <div
                      className="absolute inset-y-0 right-0 w-16 bg-linear-to-r from-white/0 to-white"
                      aria-hidden="true"
                    />
                  </div>
                )}
                <div className="flex flex-1 flex-col px-6 py-6 sm:px-8">
                  <h2 className="font-heading text-2xl font-bold uppercase tracking-tight sm:text-3xl">
                    {loc.city}, {loc.state}
                  </h2>
                  <p className="mt-1 flex items-start gap-1.5 text-base text-muted-foreground">
                    <MapPin className="mt-1 size-4 shrink-0 text-brand" aria-hidden="true" />
                    <span>
                      {loc.streetNumber} {loc.street}
                      <br />
                      {loc.city}, {loc.state} {loc.zip}
                    </span>
                  </p>

                  <div className="mt-6 flex flex-col gap-3">
                  <Link
                    href={`/locations/${loc.slug}`}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 font-heading text-base font-bold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50"
                  >
                    Hours, info &amp; directions
                    <ArrowRight className="size-5" aria-hidden="true" />
                    <span className="sr-only">
                      {" "}
                      — {loc.city}, {loc.state}
                    </span>
                  </Link>
                  <Link
                    href={`/order/${loc.slug}`}
                    className="inline-flex h-10 items-center justify-center rounded-full text-sm font-semibold text-foreground/70 transition-colors hover:text-brand"
                  >
                    Order from this location →
                  </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
