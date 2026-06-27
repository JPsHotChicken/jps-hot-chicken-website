import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock, MapPin, Navigation, Phone, Star, Store, Truck } from "lucide-react";

import { siteConfig } from "@/data/site";
import { formatPhone, telHref } from "@/lib/format";
import { formatDayHours, getTodayHours, getTodayKey, DAY_LABELS } from "@/lib/hours";
import { OrderButton } from "@/components/OrderButton";
import { Marquee } from "@/components/Marquee";
import { KentuckyIcon, TennesseeIcon } from "@/components/StateIcons";
import { entrees, sides, dippingSauces, drinks } from "@/data/food";

const STATE_ICONS = { KY: KentuckyIcon, TN: TennesseeIcon } as const;

export const metadata: Metadata = {
  title: {
    absolute: `${siteConfig.name} — ${siteConfig.tagline} in ${siteConfig.address.city}, ${siteConfig.address.state}`,
  },
  description: siteConfig.description,
  alternates: { canonical: "/" },
};

const ORDER_OPTIONS = [
  { href: "/order/pickup", label: "Order Pickup", Icon: Store, external: false },
  { href: "/order/delivery", label: "Order Delivery", Icon: Truck, external: false },
] as const;

const COMBO_INCLUDES = ["Entree", "2 Sides", "2 Dipping Sauces", "Drink"] as const;

// Build-your-combo marquee rows. `anim` must be a literal class string so
// Tailwind generates it; the `marquee` / `marquee-reverse` keyframes live in
// globals.css. Rows alternate scroll direction for visual interest.
const COMBO_ROWS = [
  {
    label: "Choose your entree",
    images: entrees,
    item: "h-56 w-56 sm:h-72 sm:w-72",
    anim: "animate-[marquee_45s_linear_infinite]",
    sizes: "(max-width: 640px) 176px, 240px",
  },
  {
    label: "Choose your first side",
    images: sides,
    item: "h-16 w-16 sm:h-20 sm:w-20",
    anim: "animate-[marquee_34s_linear_infinite]",
    sizes: "(max-width: 640px) 112px, 144px",
  },
  {
    label: "Choose your second side",
    images: sides,
    item: "h-16 w-16 sm:h-20 sm:w-20",
    anim: "animate-[marquee-reverse_34s_linear_infinite]",
    sizes: "(max-width: 640px) 112px, 144px",
  },
  {
    label: "Choose your first dipping sauce",
    images: dippingSauces,
    item: "h-14 w-14 sm:h-16 sm:w-16",
    anim: "animate-[marquee_30s_linear_infinite]",
    sizes: "(max-width: 640px) 96px, 128px",
  },
  {
    label: "Choose your second dipping sauce",
    images: dippingSauces,
    item: "h-14 w-14 sm:h-16 sm:w-16",
    anim: "animate-[marquee-reverse_30s_linear_infinite]",
    sizes: "(max-width: 640px) 96px, 128px",
  },
  {
    label: "Choose your drink",
    images: drinks,
    item: "h-16 w-16 sm:h-20 sm:w-20",
    anim: "animate-[marquee_26s_linear_infinite]",
    sizes: "(max-width: 640px) 112px, 144px",
  },
];

export default function HomePage() {
  const todayHours = getTodayHours();
  const todayLabel = DAY_LABELS[getTodayKey()];

  return (
    <>
      {/* Visually-hidden page title (the logo carries the brand visually). */}
      <h1 className="sr-only">
        {siteConfig.name} — {siteConfig.tagline}
      </h1>
      {/* Hero photo */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-3 sm:px-6 sm:pt-8">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-muted sm:aspect-[16/9]">
          <Image
            src="/../images/hero.png"
            alt="A spread of Nashville-style hot chicken from JP's Hot Chicken — sandwich, tenders, and loaded sides"
            fill
            priority
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
            className="mt-1 font-heading text-7xl font-extrabold uppercase leading-none tracking-tight sm:text-9xl lg:text-[10rem]"
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
              className={i === 1 ? "pt-1 sm:pt-2" : "pt-6 first:pt-0"}
            >
              <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-4 sm:gap-3 sm:px-6">
                <span className="inline-flex shrink-0 items-center rounded-full bg-brand px-2 py-0.5 font-heading text-[10px] font-bold uppercase tracking-wide text-brand-foreground shadow-sm sm:text-xs">
                  Step {i + 1}
                </span>
                <span className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground sm:text-sm">
                  {row.label}
                </span>
              </div>
              <div className={i === 0 ? "mt-1" : "mt-2.5"}>
                <Marquee
                  images={row.images}
                  itemClassName={row.item}
                  animationClassName={row.anim}
                  sizes={row.sizes}
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
        <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-8">
          <h2
            id="locations-title"
            className="text-center font-heading text-xl font-extrabold uppercase tracking-tight sm:text-2xl"
          >
            Our Locations
          </h2>
          <div className="mx-auto mt-4 grid max-w-4xl gap-3 sm:grid-cols-2 sm:gap-4">
            {siteConfig.locations.map((loc) => {
              const mapsQuery = encodeURIComponent(
                `${siteConfig.name}, ${loc.street}, ${loc.city}, ${loc.state}`,
              );
              const googleMapsHref = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
              const appleMapsHref = `https://maps.apple.com/?q=${mapsQuery}`;
              const StateShape = STATE_ICONS[loc.state];
              return (
                <div
                  key={loc.name}
                  className="flex flex-col gap-3 rounded-xl bg-white p-3 text-left text-foreground shadow-md sm:p-4"
                >
                  <div className="flex items-center gap-3">
                    <StateShape className="h-12 w-auto shrink-0 text-foreground sm:h-14" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
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
                  </div>
                  <div className="flex flex-col gap-2">
                    <Link
                      href={`/order/${loc.slug}`}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 font-heading text-sm font-bold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50"
                    >
                      Order Now
                      <ArrowRight className="size-4" aria-hidden="true" />
                      <span className="sr-only">
                        {" "}
                        — {loc.street}, {loc.city}
                      </span>
                    </Link>
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={googleMapsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border-2 border-neutral-700 bg-card px-2 font-heading text-xs font-bold uppercase tracking-wide text-neutral-700 transition-colors hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/50"
                      >
                        <MapPin className="size-4" aria-hidden="true" />
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
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border-2 border-neutral-700 bg-card px-2 font-heading text-xs font-bold uppercase tracking-wide text-neutral-700 transition-colors hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/50"
                      >
                        <Navigation className="size-4" aria-hidden="true" />
                        Apple Maps
                        <span className="sr-only">
                          {" "}
                          — open {loc.street} in Apple Maps (opens in a new tab)
                        </span>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Quick hits: hours / address / phone */}
      <section aria-label="Hours, location, and phone" className="border-b border-border bg-muted/40">
        <div className="mx-auto grid w-full max-w-6xl gap-px px-4 py-8 sm:px-6 md:grid-cols-3">
          <div className="flex items-start gap-3 px-2 py-3">
            <Clock className="mt-1 size-6 shrink-0 text-brand" />
            <div>
              <p className="font-heading text-sm font-semibold tracking-widest text-muted-foreground">
                Today · {todayLabel}
              </p>
              <p className="mt-1 text-lg font-semibold">
                {todayHours ? `Open ${formatDayHours(todayHours)}` : "Closed today"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 px-2 py-3">
            <MapPin className="mt-1 size-6 shrink-0 text-brand" />
            <div>
              <p className="font-heading text-sm font-semibold tracking-widest text-muted-foreground">
                Find Us
              </p>
              <p className="mt-1 text-lg font-semibold">
                {siteConfig.address.street}, {siteConfig.address.city}, {siteConfig.address.state}{" "}
                {siteConfig.address.zip}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 px-2 py-3">
            <Phone className="mt-1 size-6 shrink-0 text-brand" />
            <div>
              <p className="font-heading text-sm font-semibold tracking-widest text-muted-foreground">
                Call Ahead
              </p>
              <a
                href={telHref(siteConfig.phone)}
                className="mt-1 block text-lg font-semibold hover:text-brand"
              >
                {formatPhone(siteConfig.phone)}
              </a>
            </div>
          </div>
        </div>
      </section>

    </>
  );
}
