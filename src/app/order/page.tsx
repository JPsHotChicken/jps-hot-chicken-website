import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
  title: "Start Your Order",
  description: `Order ${siteConfig.name} from one of our locations — ${siteConfig.locations
    .map((l) => `${l.city}, ${l.state}`)
    .join(" or ")}.`,
  alternates: { canonical: "/order" },
};

export default function OrderPage() {
  return (
    <div className="bg-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        {/* Header */}
        <header className="text-center">
          <h1 className="font-heading text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl">
            Select Location
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Place order, get directions, and see hours
          </p>
        </header>

        {/* Locations */}
        <div className="mt-12 grid gap-6 sm:grid-cols-2 sm:gap-8">
          {siteConfig.locations.map((loc) => {
            const image = LOCATION_IMAGES[loc.slug];

            return (
              <div
                key={loc.name}
                className="group relative flex overflow-hidden rounded-3xl border-2 border-black bg-white shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl"
              >
                {loc.isNew && (
                  <span className="absolute right-4 top-4 rounded-full bg-brand px-2.5 py-1 font-heading text-[11px] font-bold uppercase tracking-wide text-brand-foreground shadow-sm">
                    New
                  </span>
                )}
                {image && (
                  <div className="relative w-2/5 shrink-0 bg-white sm:w-2/5">
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
                <div className="flex flex-1 flex-col px-6 py-5 sm:px-8 sm:py-6">
                  <h2 className="font-heading text-xl font-bold uppercase tracking-tight sm:text-3xl">
                    {loc.street}
                  </h2>
                  <p className="mt-1 text-base text-muted-foreground">
                    {loc.city}, {loc.state}
                  </p>

                  <div className="mt-4 flex flex-col gap-3">
                    <Link
                      href={`/order/${loc.slug}`}
                      className="inline-flex min-h-5 items-center justify-center gap-2 rounded-full bg-brand px-6 py-2 text-center font-heading text-base font-bold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50"
                    >
                      Select
                      <ArrowRight className="size-5 shrink-0" aria-hidden="true" />
                      <span className="sr-only">
                        {" "}
                        — {loc.street}, {loc.city}
                      </span>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
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
