"use client";

import Link from "next/link";
import { ArrowLeft, Truck } from "lucide-react";

import { siteConfig } from "@/data/site";
import { KentuckyIcon, TennesseeIcon } from "@/components/StateIcons";

const STATE_ICONS = { KY: KentuckyIcon, TN: TennesseeIcon } as const;

export function DeliveryClient() {
  return (
    <div className="bg-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to home
        </Link>

        <header className="mt-6 text-center">
          <h1 className="mb-20 font-heading text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl">
            Start a Delivery Order
          </h1>
        </header>

        {/* Locations with delivery-app buttons */}
        <div className="mt-8 grid gap-10 sm:grid-cols-2 sm:gap-10">
          {siteConfig.locations.map((loc) => {
            const StateShape = STATE_ICONS[loc.state];
            // Each delivery app needs an open store with a real store link.
            const doordashDisabled = !loc.isOpen || !loc.doordashUrl;
            const uberEatsDisabled = !loc.isOpen || !loc.uberEatsUrl;
            return (
              <div
                key={loc.name}
                className="relative isolate flex flex-col rounded-3xl border-2 border-black bg-muted px-6 pb-6 pt-12 text-center shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl sm:px-8 sm:pb-8 sm:pt-14"
              >
                {loc.isNew && (
                  <span className="absolute right-4 top-4 z-10 rounded-full bg-brand px-2.5 py-1 font-heading text-[11px] font-bold uppercase tracking-wide text-brand-foreground shadow-sm">
                    New
                  </span>
                )}
                {/* Faint home-state silhouette, clipped to the card. Kentucky's
                    shape is raised a bit so it isn't hidden behind the delivery
                    buttons. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl"
                >
                  <StateShape
                    className={`absolute -right-6 h-44 w-auto text-brand/10 sm:h-52 ${loc.state === "KY" ? "bottom-8" : "bottom-2"
                      }`}
                  />
                </div>
                {/* Delivery truck parked in the top border */}
                <span className="absolute left-1/2 top-0 inline-flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-brand">
                  <Truck className="size-8" aria-hidden="true" />
                </span>
                <h2 className="font-heading text-2xl font-bold uppercase tracking-tight sm:text-3xl">
                  {loc.street}
                </h2>
                <p className="mt-1 text-base text-muted-foreground">
                  {loc.city}, {loc.state}
                </p>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <a
                    href={doordashDisabled ? undefined : loc.doordashUrl}
                    target={doordashDisabled ? undefined : "_blank"}
                    rel={doordashDisabled ? undefined : "noopener noreferrer"}
                    aria-disabled={doordashDisabled || undefined}
                    tabIndex={doordashDisabled ? -1 : undefined}
                    title={doordashDisabled ? "Coming soon" : undefined}
                    className={`inline-flex h-12 items-center justify-center rounded-full bg-[#EB1700] px-4 text-base font-bold tracking-wide text-white shadow-sm sm:text-lg transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#EB1700]/40${
                      doordashDisabled ? " pointer-events-none opacity-50 grayscale" : ""
                    }`}
                  >
                    DoorDash
                    <span className="sr-only">
                      {doordashDisabled
                        ? " — coming soon"
                        : ` — order from ${loc.street} (opens in a new tab)`}
                    </span>
                  </a>
                  <a
                    href={uberEatsDisabled ? undefined : loc.uberEatsUrl}
                    target={uberEatsDisabled ? undefined : "_blank"}
                    rel={uberEatsDisabled ? undefined : "noopener noreferrer"}
                    aria-disabled={uberEatsDisabled || undefined}
                    tabIndex={uberEatsDisabled ? -1 : undefined}
                    title={uberEatsDisabled ? "Coming soon" : undefined}
                    className={`inline-flex h-12 items-center justify-center rounded-full bg-black px-4 text-base font-bold tracking-wide text-white shadow-sm sm:text-lg transition-all hover:brightness-125 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-foreground/30${
                      uberEatsDisabled ? " pointer-events-none opacity-50 grayscale" : ""
                    }`}
                  >
                    Uber&nbsp;<span className="text-[#06C167]">Eats</span>
                    <span className="sr-only">
                      {uberEatsDisabled
                        ? " — coming soon"
                        : ` — order from ${loc.street} (opens in a new tab)`}
                    </span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
