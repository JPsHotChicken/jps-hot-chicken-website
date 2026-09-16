import Image from "next/image";
import Link from "next/link";
import { Clock, MapPin, Navigation } from "lucide-react";

import { siteConfig } from "@/data/site";
import { featuredImages, type LandingPage } from "@/data/landing";
import { getOnlineWeekRows, getWeekRows } from "@/lib/hours";
import { formatPhone } from "@/lib/format";
import { CateringForm } from "@/components/CateringForm";
import { TrackedCallButton } from "@/components/TrackedCallButton";
import { TrackedOrderButton } from "@/components/TrackedOrderButton";

/**
 * Shared layout for every paid search landing page.
 *
 * The structure is deliberately ordered for someone who arrived from an ad and
 * is deciding in about four seconds whether to stay: the headline that matches
 * what they searched, then the two things they might actually do (order, call),
 * then proof it is real food at a real address, and only then the catering form.
 *
 * The page is a server component and fully static. The only client code is the
 * tracked CTAs and the form, which is what keeps these pages fast — and on paid
 * traffic, load time is conversion rate.
 */
export function LandingPageView({ page }: { page: LandingPage }) {
  // These pages are bought against Clarksville searches, so Clarksville is the
  // store they point at. Falls back to whatever is configured if that slug ever
  // changes, rather than rendering a page with no ordering link at all.
  const location =
    siteConfig.locations.find((l) => l.slug === "clarksville") ?? siteConfig.locations[0];

  const images = featuredImages(page);
  const storeHours = getWeekRows();
  const onlineHours = getOnlineWeekRows();
  const fullAddress = `${location.streetNumber} ${location.street}, ${location.city}, ${location.state} ${location.zip}`;
  const mapQuery = encodeURIComponent(`${siteConfig.name}, ${fullAddress}`);
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`;
  const orderHref = location.orderingUrl ?? `/order/${location.slug}`;

  return (
    <div className="bg-white">
      {/* Hero — headline matches the searched keyword, CTAs above the fold. */}
      <section className="mx-auto w-full max-w-5xl px-4 pt-10 pb-12 sm:px-6 sm:pt-16 sm:pb-16">
        <p className="font-heading text-sm font-semibold uppercase tracking-[0.3em] text-brand">
          {location.city}, {location.state}
        </p>
        <h1 className="mt-3 font-heading text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl">
          {page.h1}
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted-foreground sm:text-xl">
          {page.subhead}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <TrackedOrderButton href={orderHref}>Order Online</TrackedOrderButton>
          {location.phone && <TrackedCallButton phone={location.phone} />}
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          Online orders close at {formatOnlineClose(onlineHours)} · Closed Sundays
        </p>
      </section>

      {/* Food */}
      {images.length > 0 && (
        <section aria-labelledby="landing-food" className="border-t border-border bg-neutral-50">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
            <h2
              id="landing-food"
              className="font-heading text-2xl font-bold uppercase tracking-tight sm:text-3xl"
            >
              {page.foodHeading}
            </h2>
            <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
              {images.map((item) => (
                <li key={item.src} className="text-center">
                  <div className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-white">
                    <Image
                      src={item.src}
                      alt={item.alt}
                      fill
                      sizes="(max-width: 640px) 45vw, 220px"
                      className="object-cover"
                    />
                  </div>
                  <p className="mt-3 font-heading text-sm font-bold uppercase tracking-wide">
                    {item.name}
                  </p>
                </li>
              ))}
            </ul>
            <div className="mt-10">
              <TrackedOrderButton href={orderHref} size="default">
                See the full menu
              </TrackedOrderButton>
            </div>
          </div>
        </section>
      )}

      {/* Why here */}
      <section aria-labelledby="landing-points" className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
          <h2 id="landing-points" className="sr-only">
            Why JP&apos;s
          </h2>
          <div className="grid gap-8 sm:grid-cols-3">
            {page.points.map((point) => (
              <div key={point.heading}>
                <h3 className="font-heading text-lg font-bold uppercase tracking-tight">
                  {point.heading}
                </h3>
                <p className="mt-2 text-muted-foreground">{point.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Find us */}
      <section aria-labelledby="landing-visit" className="border-t border-border bg-neutral-50">
        <div className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 sm:py-16">
          <div>
            <h2
              id="landing-visit"
              className="font-heading text-2xl font-bold uppercase tracking-tight"
            >
              Find us
            </h2>
            <ul className="mt-6 space-y-4">
              <li className="flex items-start gap-3">
                <MapPin className="mt-1 size-5 shrink-0 text-brand" aria-hidden="true" />
                <div>
                  <p className="font-semibold">
                    {location.streetNumber} {location.street}
                  </p>
                  <p className="text-muted-foreground">
                    {location.city}, {location.state} {location.zip}
                  </p>
                  <a
                    href={directionsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
                  >
                    <Navigation className="size-4" aria-hidden="true" />
                    Get directions
                  </a>
                </div>
              </li>
              {location.phone && (
                <li className="flex items-start gap-3">
                  <Clock className="mt-1 size-5 shrink-0 text-brand" aria-hidden="true" />
                  <div>
                    <p className="font-semibold">Call the store</p>
                    <p className="text-muted-foreground">{formatPhone(location.phone)}</p>
                  </div>
                </li>
              )}
            </ul>

            <dl className="mt-8 space-y-1">
              {storeHours.map((row) => (
                <div key={row.key} className="flex justify-between gap-6 text-sm sm:max-w-xs">
                  <dt className={row.isToday ? "font-bold" : "text-muted-foreground"}>
                    {row.label}
                  </dt>
                  <dd className={row.isToday ? "font-bold" : "text-muted-foreground"}>
                    {row.hours}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div id="catering">
            <CateringForm source={page.slug} />
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-5xl px-4 py-12 text-center sm:px-6 sm:py-16">
          <h2 className="font-heading text-2xl font-extrabold uppercase tracking-tight sm:text-3xl">
            Hungry now?
          </h2>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <TrackedOrderButton href={orderHref}>Order Online</TrackedOrderButton>
            {location.phone && <TrackedCallButton phone={location.phone} />}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            <Link href="/locations" className="font-semibold text-brand hover:underline">
              Both locations and hours
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}

/** The online cut-off, read from the hours data rather than hardcoded. */
function formatOnlineClose(rows: ReturnType<typeof getOnlineWeekRows>): string {
  const open = rows.find((row) => row.hours !== "Closed");
  if (!open) return "8:30 PM";
  const parts = open.hours.split("–");
  return parts[parts.length - 1]?.trim() || "8:30 PM";
}
