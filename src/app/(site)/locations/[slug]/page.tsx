import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Clock, MapPin, Navigation, Phone, Truck } from "lucide-react";

import { siteConfig, type Location } from "@/data/site";
import { LOCATION_PAGE_COPY } from "@/data/location-pages";
import { entrees } from "@/data/food";
import { formatPhone, telHref } from "@/lib/format";
import { ONLINE_CLOSE, formatTime, getOnlineDayHours, summarizeWeek } from "@/lib/hours";
import {
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildLocationJsonLd,
  googleMapsUrl,
  serializeJsonLd,
} from "@/lib/jsonld";
import { TrackedOrderButton } from "@/components/TrackedOrderButton";
import { TrackedLink } from "@/components/TrackedLink";
import { InteriorSlideshow } from "@/components/InteriorSlideshow";

type Params = Promise<{ slug: string }>;

// Only real stores get a page — no thin pages for towns we don't serve.
export const dynamicParams = false;

export function generateStaticParams() {
  return siteConfig.locations.map((loc) => ({ slug: loc.pageSlug }));
}

function findLocation(pageSlug: string): Location | undefined {
  return siteConfig.locations.find((loc) => loc.pageSlug === pageSlug);
}

/** "toast", "skytab"… for GA4, read from the ordering link itself. */
function orderingPlatform(url: string): string {
  if (url.includes("toast")) return "toast";
  if (url.includes("skytab")) return "skytab";
  return "direct";
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const loc = findLocation(slug);
  if (!loc) return {};
  const path = `/locations/${loc.pageSlug}`;
  const title = `Hot Chicken in ${loc.city}, ${loc.state}`;
  const description = `Nashville-style hot chicken at ${loc.streetNumber} ${loc.street}, ${loc.city}, ${loc.state}. Hours, directions, and online ordering for pickup or delivery.`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: `${title} | ${siteConfig.name}`, description, url: path },
  };
}

const PRIMARY_BUTTON =
  "inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-brand px-6 font-heading text-lg font-bold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50";
const SECONDARY_BUTTON =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-foreground/25 bg-background px-4 font-heading text-sm font-bold uppercase tracking-wide text-foreground transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-foreground/30";

export default async function LocationPage({ params }: { params: Params }) {
  const { slug } = await params;
  const loc = findLocation(slug);
  if (!loc) notFound();

  const copy = LOCATION_PAGE_COPY[loc.slug];
  const hours = loc.hours ?? siteConfig.hours;
  const storeHours = summarizeWeek(hours);
  const onlineHours = summarizeWeek(hours, (key) => getOnlineDayHours(key, hours));
  const onlineClose = formatTime(ONLINE_CLOSE);
  const address = `${loc.streetNumber} ${loc.street}, ${loc.city}, ${loc.state} ${loc.zip}`;
  const directionsHref = googleMapsUrl(loc);
  const mapEmbedSrc = `https://maps.google.com/maps?q=${encodeURIComponent(
    `${siteConfig.name}, ${address}`,
  )}&z=15&output=embed`;
  const otherLocations = siteConfig.locations.filter((l) => l.slug !== loc.slug);

  const deliveryApps = [
    loc.doordashUrl && { name: "DoorDash", platform: "doordash", href: loc.doordashUrl },
    loc.uberEatsUrl && { name: "Uber Eats", platform: "ubereats", href: loc.uberEatsUrl },
  ].filter((app): app is { name: string; platform: string; href: string } => Boolean(app));

  // Every answer below is built from confirmed data, so the page, the FAQ
  // schema and the Google profile can't drift apart.
  const faqs = [
    {
      question: `Where is JP's Hot Chicken in ${loc.city}?`,
      answer: `${address}.${loc.landmark ? ` ${loc.landmark}` : ""}`,
    },
    ...(copy?.parking
      ? [{ question: "Is there parking?", answer: `Yes. ${copy.parking}` }]
      : []),
    {
      question: `What are the ${loc.street} store's hours?`,
      answer: `${storeHours.map((row) => `${row.days}: ${row.hours}`).join(". ")}.`,
    },
    {
      question: "When does online ordering close?",
      answer: `Online pickup orders and delivery stop at ${onlineClose}, 30 minutes before the store closes.`,
    },
    ...(deliveryApps.length > 0
      ? [
          {
            question: `Do you deliver in ${loc.city}?`,
            answer: `Yes. We deliver to ${copy?.deliveryArea ?? loc.city} through ${deliveryApps
              .map((app) => app.name)
              .join(" and ")}.`,
          },
        ]
      : []),
    ...(loc.orderingUrl
      ? [
          {
            question: "Can I order ahead for pickup?",
            answer: `Yes. Tap Order Pickup on this page to order online from the ${loc.street} store, then pick it up when it's ready.`,
          },
        ]
      : []),
    {
      question: "Do you have a no-heat option?",
      answer:
        "Yes. Southern has no heat at all. From there the heat goes up through Mild and Hot to Extra Hot.",
    },
  ];

  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Locations", path: "/locations" },
    { name: `${loc.city}, ${loc.state}`, path: `/locations/${loc.pageSlug}` },
  ];

  const jsonLd = [buildLocationJsonLd(loc), buildBreadcrumbJsonLd(breadcrumbs), buildFaqJsonLd(faqs)];

  return (
    <div className="bg-white">
      {jsonLd.map((data, i) => (
        <script
          key={i}
          type="application/ld+json"
          // Trusted, build-time data derived from siteConfig.
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
        />
      ))}

      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <li key={crumb.path} className="flex items-center gap-1">
                  {isLast ? (
                    <span aria-current="page" className="font-semibold text-foreground">
                      {crumb.name}
                    </span>
                  ) : (
                    <>
                      <Link href={crumb.path} className="hover:text-brand hover:underline">
                        {crumb.name}
                      </Link>
                      <ChevronRight className="size-3.5" aria-hidden="true" />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Above the fold on a phone: H1, address, and the order buttons. */}
        <header className="mt-5">
          <h1 className="font-heading text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl">
            Hot Chicken in {loc.city}, {loc.state}
          </h1>
          <p className="mt-3 flex items-start gap-1.5 text-base text-muted-foreground sm:text-lg">
            <MapPin className="mt-1 size-4 shrink-0 text-brand" aria-hidden="true" />
            <span>
              {siteConfig.name} · {loc.streetNumber} {loc.street}, {loc.city}, {loc.state}{" "}
              {loc.zip}
            </span>
          </p>
        </header>

        <section aria-label={`Order from ${loc.street}`} className="mt-6 space-y-3">
          {loc.orderingUrl && (
            <TrackedOrderButton
              href={loc.orderingUrl}
              className={PRIMARY_BUTTON}
              eventParams={{ location: loc.slug, platform: orderingPlatform(loc.orderingUrl) }}
            >
              Order Pickup
            </TrackedOrderButton>
          )}
          {loc.orderingUrl && (
            <p className="text-center text-sm text-muted-foreground">
              Order direct from us. It goes straight to our kitchen, with no delivery app in
              between.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {loc.phone && (
              <TrackedLink
                href={telHref(loc.phone)}
                event="call_click"
                eventParams={{ location: loc.slug }}
                conversion="call"
                className={SECONDARY_BUTTON}
              >
                <Phone className="size-4" aria-hidden="true" />
                Call
              </TrackedLink>
            )}
            <TrackedLink
              href={directionsHref}
              event="directions_click"
              eventParams={{ location: loc.slug, platform: "google_maps" }}
              className={SECONDARY_BUTTON}
            >
              <Navigation className="size-4" aria-hidden="true" />
              Directions
            </TrackedLink>
          </div>
          {deliveryApps.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1 text-sm">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Truck className="size-4" aria-hidden="true" />
                Order Delivery:
              </span>
              {deliveryApps.map((app) => (
                <TrackedLink
                  key={app.platform}
                  href={app.href}
                  event="order_delivery_click"
                  eventParams={{ location: loc.slug, platform: app.platform }}
                  className="font-semibold text-brand underline-offset-2 hover:underline"
                >
                  {app.name}
                </TrackedLink>
              ))}
            </div>
          )}
        </section>

        <p className="mt-8 text-lg leading-relaxed">{copy?.intro}</p>

        {/* Hours: the store and online ordering close at different times, so
            they're listed separately (and match the Google profile). */}
        <section aria-labelledby="hours-title" className="mt-10">
          <h2
            id="hours-title"
            className="flex items-center gap-2 font-heading text-2xl font-bold uppercase tracking-tight"
          >
            <Clock className="size-5 text-brand" aria-hidden="true" />
            Hours
          </h2>
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">
                {copy?.dineIn ? "Dining room & walk-in" : "Store hours"}
              </h3>
              <dl className="mt-2 space-y-1">
                {storeHours.map((row) => (
                  <div key={row.days} className="flex justify-between gap-4 border-b border-border py-1">
                    <dt>{row.days}</dt>
                    <dd className="font-semibold">{row.hours}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h3 className="font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Online pickup & delivery
              </h3>
              <dl className="mt-2 space-y-1">
                {onlineHours.map((row) => (
                  <div key={row.days} className="flex justify-between gap-4 border-b border-border py-1">
                    <dt>{row.days}</dt>
                    <dd className="font-semibold">{row.hours}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section aria-labelledby="find-us-title" className="mt-10">
          <h2
            id="find-us-title"
            className="flex items-center gap-2 font-heading text-2xl font-bold uppercase tracking-tight"
          >
            <MapPin className="size-5 text-brand" aria-hidden="true" />
            Finding us
          </h2>
          <address className="mt-3 not-italic">
            {siteConfig.name}
            <br />
            {loc.streetNumber} {loc.street}
            <br />
            {loc.city}, {loc.state} {loc.zip}
            {loc.phone && (
              <>
                <br />
                <a href={telHref(loc.phone)} className="font-semibold text-brand hover:underline">
                  {formatPhone(loc.phone)}
                </a>
              </>
            )}
          </address>
          {loc.landmark && <p className="mt-3">{loc.landmark}</p>}
          {copy?.parking && <p className="mt-1">{copy.parking}</p>}
          {loc.googleBusinessUrl && (
            <p className="mt-3">
              <a
                href={loc.googleBusinessUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-brand hover:underline"
              >
                See our reviews &amp; photos on Google
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          )}
          <div className="mt-4 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border sm:aspect-[16/9]">
            <iframe
              src={mapEmbedSrc}
              title={`Map of ${siteConfig.name}, ${address}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="size-full border-0"
            />
          </div>
        </section>

        {copy?.photos && copy.photos.length > 0 && (
          <section aria-labelledby="photos-title" className="mt-10">
            <h2
              id="photos-title"
              className="font-heading text-2xl font-bold uppercase tracking-tight"
            >
              Inside the {loc.street} store
            </h2>
            <InteriorSlideshow images={copy.photos} className="mt-4" />
          </section>
        )}

        <section aria-labelledby="menu-title" className="mt-10">
          <h2 id="menu-title" className="font-heading text-2xl font-bold uppercase tracking-tight">
            On the menu
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {entrees.map((item) => (
              <li key={item.src}>
                <div className="relative aspect-square overflow-hidden rounded-xl bg-neutral-100">
                  <Image
                    src={item.src}
                    alt={item.alt}
                    fill
                    sizes="(max-width: 640px) 45vw, 240px"
                    className="object-cover"
                  />
                </div>
                <p className="mt-2 font-heading font-bold uppercase tracking-tight">{item.name}</p>
              </li>
            ))}
          </ul>
          {loc.orderingUrl && (
            <div className="mt-6">
              <TrackedOrderButton
                href={loc.orderingUrl}
                className={PRIMARY_BUTTON}
                eventParams={{ location: loc.slug, platform: orderingPlatform(loc.orderingUrl) }}
              >
                See the full menu &amp; order
              </TrackedOrderButton>
            </div>
          )}
        </section>

        <section aria-labelledby="faq-title" className="mt-12">
          <h2 id="faq-title" className="font-heading text-2xl font-bold uppercase tracking-tight">
            {loc.city} questions
          </h2>
          <dl className="mt-4 divide-y divide-border">
            {faqs.map((faq) => (
              <div key={faq.question} className="py-4">
                <dt className="font-heading text-lg font-bold">{faq.question}</dt>
                <dd className="mt-1 text-muted-foreground">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        {otherLocations.length > 0 && (
          <section aria-labelledby="other-title" className="mt-10 rounded-2xl bg-neutral-100 p-6">
            <h2 id="other-title" className="font-heading text-xl font-bold uppercase tracking-tight">
              Our other {otherLocations.length === 1 ? "location" : "locations"}
            </h2>
            <ul className="mt-3 space-y-2">
              {otherLocations.map((other) => (
                <li key={other.slug}>
                  <Link
                    href={`/locations/${other.pageSlug}`}
                    className="font-semibold text-brand hover:underline"
                  >
                    Hot chicken in {other.city}, {other.state}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    · {other.streetNumber} {other.street}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
