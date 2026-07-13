import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin, Star } from "lucide-react";

import { siteConfig } from "@/data/site";
import { KentuckyIcon, TennesseeIcon } from "@/components/StateIcons";

const STATE_ICONS = { KY: KentuckyIcon, TN: TennesseeIcon } as const;

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
            const StateShape = STATE_ICONS[loc.state];
            return (
              <div
                key={loc.slug}
                className="group relative flex flex-col rounded-3xl border-2 border-black bg-muted p-6 shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl sm:p-8"
              >
                {loc.isNew && (
                  <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 font-heading text-[11px] font-bold uppercase tracking-wide text-brand-foreground shadow-sm">
                    <Star className="size-3 fill-current" aria-hidden="true" />
                    New
                  </span>
                )}
                <div className="flex items-center gap-4">
                  <StateShape className="h-20 w-auto shrink-0 text-brand sm:h-24" aria-hidden="true" />
                  <div>
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
                  </div>
                </div>

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
            );
          })}
        </div>
      </div>
    </div>
  );
}
