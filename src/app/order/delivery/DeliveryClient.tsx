"use client";

import { useState } from "react";
import Link from "next/link";
import { LocateFixed, Search, Truck } from "lucide-react";

import { siteConfig } from "@/data/site";
import { KentuckyIcon, TennesseeIcon } from "@/components/StateIcons";

const STATE_ICONS = { KY: KentuckyIcon, TN: TennesseeIcon } as const;

type Status = "idle" | "locating" | "located" | "error";

export function DeliveryClient() {
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  function useCurrentLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("error");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setAddress(`Current location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
        setStatus("located");
      },
      () => setStatus("error"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // Keyless Google Maps embed showing both locations (and the roads between
  // them) as a route — they're ~10 miles apart, so the map fits both.
  const [a, b] = siteConfig.locations;
  const toQuery = (l: { street: string; city: string; state: string }) =>
    encodeURIComponent(`${l.street}, ${l.city}, ${l.state}`);
  const mapSrc = `https://maps.google.com/maps?saddr=${toQuery(a)}&daddr=${toQuery(b)}&output=embed`;

  return (
    <div className="bg-white">
      <div className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 sm:py-20">
        <header className="text-center">
          <h1 className="font-heading text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl">
            Start a Delivery Order
          </h1>
          {/* <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Enter your address, then choose your delivery app and location.
          </p> */}
        </header>

        {/* Address / current location */}
        {/* <div className="mx-auto mt-8 max-w-xl">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Delivery address</span>
              <Search
                className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Enter your delivery address"
                className="h-12 w-full rounded-full border-2 border-border bg-card pl-11 pr-4 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-brand focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/30"
              />
            </label>
            <button
              type="button"
              onClick={useCurrentLocation}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border-2 border-brand px-5 font-heading text-sm font-bold uppercase tracking-wide text-brand transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
            >
              <LocateFixed className="size-5" aria-hidden="true" />
              {status === "locating" ? "Locating…" : "Use current location"}
            </button>
          </div>
          <p
            aria-live="polite"
            className="mt-2 min-h-5 text-center text-sm text-muted-foreground"
          >
            {status === "located" && "📍 Using your current location."}
            {status === "error" &&
              "Couldn't get your location — type your address above."}
          </p>
        </div> */}

        {/* Map of both locations */}
        {/* <div className="mt-10">
          <div className="overflow-hidden rounded-3xl border-2 border-border shadow-sm">
            <iframe
              title="Map showing both JP's Hot Chicken locations near Clarksville, TN"
              src={mapSrc}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-[320px] w-full sm:h-[440px]"
            />
          </div>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Two locations, about 10 miles apart — {a.city}, {a.state} &amp; {b.city},{" "}
            {b.state}.
          </p>
        </div> */}

        {/* Locations with delivery-app buttons */}
        <div className="mt-8 grid gap-10 sm:grid-cols-2 sm:gap-10">
          {siteConfig.locations.map((loc) => {
            const StateShape = STATE_ICONS[loc.state];
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
                {/* Faint home-state silhouette, clipped to the card */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl"
                >
                  <StateShape className="absolute -bottom-8 -right-6 h-44 w-auto text-brand/10 sm:h-52" />
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
                    href={loc.doordashUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-12 items-center justify-center rounded-full bg-[#EB1700] px-4 text-base font-bold tracking-wide text-white shadow-sm sm:text-lg transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#EB1700]/40"
                  >
                    DoorDash
                    <span className="sr-only">
                      {" "}
                      — order from {loc.street} (opens in a new tab)
                    </span>
                  </a>
                  <a
                    href={loc.uberEatsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-12 items-center justify-center rounded-full bg-black px-4 text-base font-bold tracking-wide text-white shadow-sm sm:text-lg transition-all hover:brightness-125 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-foreground/30"
                  >
                    Uber&nbsp;<span className="text-[#06C167]">Eats</span>
                    <span className="sr-only">
                      {" "}
                      — order from {loc.street} (opens in a new tab)
                    </span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <Link href="/" className="text-base font-semibold text-brand hover:underline">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
