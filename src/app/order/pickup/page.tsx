import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { siteConfig } from "@/data/site";
import { KentuckyIcon, TennesseeIcon } from "@/components/StateIcons";

const STATE_ICONS = { KY: KentuckyIcon, TN: TennesseeIcon } as const;

export const metadata: Metadata = {
  title: "Start a Pickup Order",
  description: `Choose a ${siteConfig.name} location for pickup — ${siteConfig.locations
    .map((l) => `${l.city}, ${l.state}`)
    .join(" or ")}.`,
  alternates: { canonical: "/order/pickup" },
};

export default function PickupOrderPage() {
  return (
    <div className="bg-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        {/* Header */}
        <header className="text-center">
          <h1 className="mt-3 font-heading text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl">
            Start a Pickup Order
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Pick the location nearest you and we&apos;ll have it hot and ready.
          </p>
        </header>

        {/* Locations */}
        <div className="mt-12 grid gap-6 sm:grid-cols-2 sm:gap-8">
          {siteConfig.locations.map((loc) => {
            const mapsQuery = encodeURIComponent(
              `${siteConfig.name}, ${loc.street}, ${loc.city}, ${loc.state}`,
            );
            const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`;
            const StateShape = STATE_ICONS[loc.state];
            // Trenton (Clarksville) pickup is temporarily turned off.
            const disabled = loc.slug === "clarksville";

            return (
              <div
                key={loc.name}
                className="group relative flex flex-col rounded-3xl border-2 border-black bg-muted p-6 shadow-xl transition-all hover:-translate-y-0.5 hover:shadow-2xl sm:p-8"
              >
                {loc.isNew && (
                  <span className="absolute right-4 top-4 rounded-full bg-brand px-2.5 py-1 font-heading text-[11px] font-bold uppercase tracking-wide text-brand-foreground shadow-sm">
                    New
                  </span>
                )}
                <div className="flex items-center gap-4">
                  <StateShape className="h-20 w-auto shrink-0 text-brand sm:h-24" />
                  <div>
                    <h2 className="font-heading text-2xl font-bold uppercase tracking-tight sm:text-3xl">
                      {loc.street}
                    </h2>
                    <p className="mt-1 text-base text-muted-foreground">
                      {loc.city}, {loc.state}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3">
                  <a
                    href={disabled ? undefined : loc.orderingUrl}
                    target={disabled ? undefined : "_blank"}
                    rel={disabled ? undefined : "noopener noreferrer"}
                    aria-disabled={disabled || undefined}
                    tabIndex={disabled ? -1 : undefined}
                    title={disabled ? "Temporarily unavailable" : undefined}
                    className={`inline-flex h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 font-heading text-base font-bold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50${
                      disabled ? " pointer-events-none opacity-50 grayscale" : ""
                    }`}
                  >
                    {disabled ? "Pickup Temporarily Unavailable" : "Start Pickup Order"}
                    {!disabled && <ArrowRight className="size-5" aria-hidden="true" />}
                    <span className="sr-only">
                      {disabled
                        ? " — temporarily unavailable"
                        : ` at ${loc.street}, ${loc.city} (opens in a new tab)`}
                    </span>
                  </a>
                  <a
                    href={directionsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-10 items-center justify-center rounded-full text-sm font-semibold text-foreground/70 transition-colors hover:text-brand"
                  >
                    Get directions
                  </a>
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
