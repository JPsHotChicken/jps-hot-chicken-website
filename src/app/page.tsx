import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock, Mail, MapPin, Navigation, Phone, Star, Store, Truck } from "lucide-react";

import { siteConfig } from "@/data/site";
import { formatPhone, telHref } from "@/lib/format";
import { getWeekRows, getOnlineWeekRows } from "@/lib/hours";
import { buildHomeJsonLd, serializeJsonLd } from "@/lib/jsonld";
import { OrderButton } from "@/components/OrderButton";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { Marquee } from "@/components/Marquee";
import { entrees, sides, dippingSauces, drinks } from "@/data/food";

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
  title: {
    absolute: `${siteConfig.name} — ${siteConfig.tagline} in ${siteConfig.locations
      .map((loc) => `${loc.city}, ${loc.state}`)
      .join(" & ")}`,
  },
  description: siteConfig.description,
  alternates: { canonical: "/" },
};

const ORDER_OPTIONS = [
  { href: "/order/pickup", label: "Order Pickup", Icon: Store, external: false },
  { href: "/order/delivery", label: "Order Delivery", Icon: Truck, external: false },
] as const;

const COMBO_INCLUDES = ["Entree", "2 Sides", "2 Dipping Sauces", "Drink"] as const;

// Build-your-combo marquee rows. Each row auto-scrolls (and is drag-scrollable);
// `direction` alternates for visual interest and `duration` sets the speed — the
// seconds for the strip to travel one full set of images.
// `pad` controls the horizontal gap between images; the smaller side/sauce/drink
// rows get extra breathing room. `scroll: false` renders a static, centered row.
const COMBO_ROWS = [
  {
    label: "Choose your entree",
    images: entrees,
    item: "w-56 sm:w-72",
    direction: "left",
    duration: 45,
    sizes: "(max-width: 640px) 176px, 240px",
    pad: "px-3 sm:px-4",
    scroll: true,
    aspect: "aspect-[3/2]",
  },
  {
    label: "Choose your first side",
    images: sides,
    item: "w-20 sm:w-24",
    direction: "left",
    duration: 34,
    sizes: "(max-width: 640px) 128px, 160px",
    pad: "px-2 sm:px-2.5",
    scroll: true,
    aspect: "aspect-[3/2]",
  },
  {
    label: "Choose your second side",
    images: sides,
    item: "w-20 sm:w-24",
    direction: "right",
    duration: 34,
    sizes: "(max-width: 640px) 128px, 160px",
    pad: "px-2 sm:px-2.5",
    scroll: true,
    aspect: "aspect-[3/2]",
  },
  {
    label: "Choose your first dipping sauce",
    images: dippingSauces,
    item: "w-14 sm:w-16",
    direction: "left",
    duration: 30,
    sizes: "(max-width: 640px) 96px, 128px",
    pad: "px-5 sm:px-6",
    scroll: true,
    aspect: "aspect-[3/2]",
  },
  {
    label: "Choose your second dipping sauce",
    images: dippingSauces,
    item: "w-14 sm:w-16",
    direction: "right",
    duration: 30,
    sizes: "(max-width: 640px) 96px, 128px",
    pad: "px-5 sm:px-6",
    scroll: true,
    aspect: "aspect-[3/2]",
  },
  {
    label: "Choose your drink",
    images: drinks,
    item: "w-16 sm:w-20",
    direction: "left",
    duration: 32,
    sizes: "(max-width: 640px) 112px, 144px",
    pad: "px-5 sm:px-6",
    scroll: true,
    aspect: "aspect-[3/2]",
  },
] as const;

export default function HomePage() {
  const storeHours = getWeekRows();
  const onlineHours = getOnlineWeekRows();
  // One phone line per location that has a confirmed number, labeled the way
  // the owner refers to each store.
  const phoneNumbers = siteConfig.locations
    .filter((loc) => loc.phone)
    .map((loc) => ({ label: loc.shortLabel, phone: loc.phone! }));

  return (
    <>
      {/* Restaurant structured data for both stores (the layout carries the
          brand-level Organization node). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildHomeJsonLd()) }}
      />
      {/* Announcement bar — toggled via siteConfig.announcement. */}
      <AnnouncementBanner />
      {/* Visually-hidden page title (the logo carries the brand visually). */}
      <h1 className="sr-only">
        {siteConfig.name} — {siteConfig.tagline}
      </h1>
      {/* Hero photo */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6 sm:pt-8">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-muted sm:aspect-[16/9]">
          <Image
            src="/images/hero4.jpg"
            alt="A spread of Nashville-style hot chicken from JP's Hot Chicken — sandwich, tenders, and loaded sides"
            fill
            preload
            sizes="(max-width: 1152px) 100vw, 1152px"
            className="object-cover"
          />
        </div>
      </section>

      {/* Order options */}
      <section
        aria-label="Order online"
        className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 sm:py-10"
      >
        <div className="mx-auto grid max-w-xs grid-cols-2 gap-3 sm:max-w-md sm:gap-4">
          {ORDER_OPTIONS.map(({ href, label, Icon, external }) => {
            const cardClass =
              "group flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-brand bg-card p-2.5 text-center shadow-sm transition-all hover:bg-brand/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50";
            const inner = (
              <>
                <Icon
                  className="size-7 text-foreground transition-colors group-hover:text-brand sm:size-7"
                  aria-hidden="true"
                />
                <span className="font-heading text-sm font-bold tracking-tight text-muted-foreground sm:text-base">
                  {label}
                </span>
              </>
            );
            return external ? (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={cardClass}
              >
                {inner}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <Link key={label} href={href} className={cardClass}>
                {inner}
              </Link>
            );
          })}
        </div>
      </section>

      {/* The Big Combo */}
      <section aria-labelledby="big-combo-title" className="bg-white">
        {/* Header: BIG COMBO on one line, what's included underneath */}
        <div className="mx-auto w-full max-w-6xl px-4 py-12 text-center sm:px-6 sm:py-16">
          <p className="font-heading text-sm font-bold uppercase tracking-[0.25em] text-muted-foreground sm:text-base">
            The
          </p>
          <h2
            id="big-combo-title"
            className="font-heading text-7xl font-extrabold uppercase leading-none tracking-tight sm:text-9xl lg:text-[10rem]"
          >
            <span className="text-brand">Big</span> Combo
          </h2>
          <p className="mx-auto mt-1 max-w-3xl font-heading text-sm font-semibold uppercase tracking-wider text-foreground sm:mt-2 sm:text-xl lg:text-2xl">
            {COMBO_INCLUDES.map((item, i) => (
              <span key={item}>
                {i > 0 && <span className="mx-2 text-brand sm:mx-3">+</span>}
                {item}
              </span>
            ))}
          </p>
        </div>

        {/* Build-your-combo: large entree marquee, then smaller option rows */}
        <div className="pb-12 sm:pb-16">
          {COMBO_ROWS.map((row, i) => (
            <div
              key={row.label}
              // Tighter gap between the tall entree row and the first side row.
              className={i === 1 ? "pt-10 sm:pt-2" : "pt-10 first:pt-0"}
            >
              <div className="mb-3 mx-auto flex max-w-6xl items-center gap-2.5 px-4 sm:gap-3 sm:px-6">
                <span className="inline-flex shrink-0 items-center rounded-full bg-brand px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide text-brand-foreground shadow-md sm:text-xs">
                  Step {i + 1}
                </span>
                <span className="font-heading text-xs font-extrabold uppercase tracking-[0.2em] text-black sm:text-sm">
                  {row.label}
                </span>
              </div>
              <div className={i === 0 ? "mt-1" : "mt-2.5"}>
                <Marquee
                  images={row.images}
                  itemClassName={row.item}
                  direction={row.direction}
                  durationSeconds={row.duration}
                  paddingClassName={row.pad}
                  scroll={row.scroll}
                  sizes={row.sizes}
                  aspectClassName={row.aspect}
                  labelMarginClassName={i === 0 ? "mt-0" : "mt-1"}
                  imageClassName={
                    i === 0 ? "object-contain" : "object-contain object-top"
                  }
                />
              </div>
            </div>
          ))}

          {/* Order CTA tying off the build-your-combo flow */}
          <div className="mt-10 flex justify-center px-4 sm:mt-12 sm:px-6">
            <OrderButton
              variant="outline"
              className="border-2 border-brand bg-white text-foreground hover:bg-brand/10"
            >
              Order Big Combo Now
            </OrderButton>
          </div>
        </div>
      </section>

      {/* Our locations */}
      <section aria-labelledby="locations-title" className="bg-neutral-100 text-foreground">
        <div className="mx-auto mt-5 w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-8">
          <h2
            id="locations-title"
            className="mt-8 mb-5 text-center font-heading text-3xl font-extrabold uppercase tracking-tight sm:text-2xl"
          >
            Our Locations
          </h2>
          <div className="mx-auto mt-4 mb-5 grid max-w-4xl gap-5 sm:grid-cols-2 sm:gap-6">
            {siteConfig.locations.map((loc) => {
              const mapsQuery = encodeURIComponent(
                `${siteConfig.name}, ${loc.street}, ${loc.city}, ${loc.state}`,
              );
              const googleMapsHref = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
              const appleMapsHref = `https://maps.apple.com/?q=${mapsQuery}`;
              const image = LOCATION_IMAGES[loc.slug];
              return (
                <div
                  key={loc.name}
                  className="relative flex overflow-hidden rounded-xl bg-white text-left text-foreground shadow-md"
                >
                  {image && (
                    <div className="relative w-2/5 shrink-0 bg-white sm:w-1/2">
                      <Image
                        src={image.src}
                        alt={image.alt}
                        fill
                        sizes="(max-width: 640px) 40vw, 260px"
                        className="object-cover"
                      />
                      <div
                        className="absolute inset-y-0 right-0 w-12 bg-linear-to-r from-white/0 to-white"
                        aria-hidden="true"
                      />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-3 py-5 pl-6 pr-3 sm:py-7 sm:pl-9 sm:pr-4">
                    <div className="min-w-0">
                      <h3 className="flex flex-wrap items-center gap-2 font-heading text-base font-bold uppercase tracking-tight sm:text-lg">
                        {loc.street}
                        {loc.isNew && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-brand-foreground">
                            <Star className="size-3 fill-current" aria-hidden="true" />
                            New
                          </span>
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {loc.city}, {loc.state}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Link
                        href={`/order/${loc.slug}`}
                        className="inline-flex h-7 items-center justify-center gap-1.5 self-start rounded-lg bg-brand px-3 font-heading text-xs font-bold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50"
                      >
                        Select Location
                        <ArrowRight className="size-3.5" aria-hidden="true" />
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
        </div>
      </section>

      {/* Hours + contact */}
      <section aria-label="Hours and contact" className="border-b border-border bg-white">
        <div className="mt-10 mb-12 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          {/* Two hours lists — store hours pinned to the left edge, online/delivery
              hours pinned to the right edge, at every screen size. */}
          <div className="flex items-start justify-between gap-3">
            {/* Store hours */}
            <div className="mt-3 text-left">
              <div className="flex items-center gap-2">
                <Clock className="size-5 shrink-0 text-brand" aria-hidden="true" />
                <p className="font-heading text-xs font-bold uppercase tracking-widest text-muted-foreground sm:text-sm">
                  Store Hours
                </p>
              </div>
              <dl className="mt-3 space-y-1">
                {storeHours.map((row) => (
                  <div
                    key={row.key}
                    className={`flex items-baseline gap-2 text-xs sm:text-sm ${row.isToday ? "font-bold text-brand" : ""
                      }`}
                  >
                    <dt className="w-8 shrink-0">{row.label.slice(0, 3)}</dt>
                    <dd className={`whitespace-nowrap ${row.isToday ? "" : "text-muted-foreground"}`}>
                      {row.hours}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Online ordering / delivery hours */}
            <div className="w-[150px] text-left sm:w-[280px]">
              <div className="flex items-start gap-3">
                <Truck className="mt-1 size-6 shrink-0 text-brand" aria-hidden="true" />

                <p className="max-w-[210px] font-heading text-xs font-bold uppercase tracking-widest text-muted-foreground sm:max-w-[240px] sm:text-sm">
                  Online Ordering / Delivery Hours
                </p>
              </div>

              <dl className="mt-3 ml-7 space-y-1">
                {onlineHours.map((row) => (
                  <div
                    key={row.key}
                    className={`flex items-baseline text-xs sm:text-sm ${row.isToday ? "font-bold text-brand" : ""
                      }`}
                  >
                    <dt className="w-10 shrink-0">{row.label.slice(0, 3)}</dt>

                    <dd
                      className={`whitespace-nowrap ${row.isToday ? "" : "text-muted-foreground"
                        }`}
                    >
                      {row.hours}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

    </>
  );
}
