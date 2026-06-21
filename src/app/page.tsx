import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Clock, MapPin, Phone } from "lucide-react";

import { siteConfig } from "@/data/site";
import { formatPhone, telHref } from "@/lib/format";
import { formatDayHours, getTodayHours, getTodayKey, DAY_LABELS } from "@/lib/hours";
import { OrderButton } from "@/components/OrderButton";

export const metadata: Metadata = {
  title: {
    absolute: `${siteConfig.name} — ${siteConfig.tagline} in ${siteConfig.address.city}, ${siteConfig.address.state}`,
  },
  description: siteConfig.description,
  alternates: { canonical: "/" },
};

const GALLERY = [
  { src: "/images/sandwich.webp", alt: "JP's Classic hot chicken sandwich with pickles and slaw" },
  { src: "/images/tenders.webp", alt: "Hand-breaded hot chicken tenders with Texas toast" },
  { src: "/images/plate.webp", alt: "Quarter bird hot chicken plate with a side" },
];

export default function HomePage() {
  const todayHours = getTodayHours();
  const todayLabel = DAY_LABELS[getTodayKey()];
  const [brandFirst, ...brandRest] = siteConfig.name.split(" ");

  return (
    <>
      {/* Hero */}
      <section className="relative isolate">
        <div className="relative h-[78vh] min-h-[520px] w-full">
          <Image
            src="/images/hero.webp"
            alt="A spread of Nashville-style hot chicken from JP's Hot Chicken"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/30" />
          <div className="absolute inset-0 flex items-center">
            <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
              <div className="max-w-2xl text-white">
                <p className="font-heading text-sm font-semibold uppercase tracking-[0.3em] text-brand-foreground/90">
                  {siteConfig.address.city}, {siteConfig.address.state}
                </p>
                <h1 className="mt-3 font-heading text-5xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl md:text-7xl">
                  <span className="text-brand">{brandFirst}</span> {brandRest.join(" ")}
                </h1>
                <p className="mt-5 max-w-xl text-lg text-white/90 sm:text-xl">
                  {siteConfig.tagline} Hand-breaded, dialed from mild to cluckin&apos; hot,
                  and served with classic Southern sides.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <OrderButton size="lg" />
                  <Link
                    href="/menu"
                    className="inline-flex h-14 items-center justify-center rounded-full border border-white/40 bg-white/5 px-8 text-lg font-semibold text-white backdrop-blur transition-colors hover:bg-white/15"
                  >
                    See the Menu
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick hits: hours / address / phone */}
      <section aria-label="Hours, location, and phone" className="border-b border-border bg-muted/40">
        <div className="mx-auto grid w-full max-w-6xl gap-px px-4 py-8 sm:px-6 md:grid-cols-3">
          <div className="flex items-start gap-3 px-2 py-3">
            <Clock className="mt-1 size-6 shrink-0 text-brand" />
            <div>
              <p className="font-heading text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Today · {todayLabel}
              </p>
              <p className="mt-1 text-lg font-medium">
                {todayHours ? `Open ${formatDayHours(todayHours)}` : "Closed today"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 px-2 py-3">
            <MapPin className="mt-1 size-6 shrink-0 text-brand" />
            <div>
              <p className="font-heading text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Find Us
              </p>
              <p className="mt-1 text-lg font-medium">
                {siteConfig.address.street}, {siteConfig.address.city}, {siteConfig.address.state}{" "}
                {siteConfig.address.zip}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 px-2 py-3">
            <Phone className="mt-1 size-6 shrink-0 text-brand" />
            <div>
              <p className="font-heading text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Call Ahead
              </p>
              <a
                href={telHref(siteConfig.phone)}
                className="mt-1 block text-lg font-medium hover:text-brand"
              >
                {formatPhone(siteConfig.phone)}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-3xl font-bold uppercase tracking-tight sm:text-4xl">
              The Good Stuff
            </h2>
            <p className="mt-2 max-w-xl text-lg text-muted-foreground">
              Crispy, juicy, and seriously crave-able. Here&apos;s a taste of what&apos;s coming
              out of the fryer.
            </p>
          </div>
          <Link href="/menu" className="text-base font-semibold text-brand hover:underline">
            View full menu →
          </Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {GALLERY.map((photo) => (
            <div
              key={photo.src}
              className="relative aspect-square overflow-hidden rounded-xl bg-muted"
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes="(max-width: 640px) 100vw, 33vw"
                className="object-cover transition-transform duration-300 hover:scale-105"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Order CTA band */}
      <section className="bg-foreground text-background">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6">
          <h2 className="max-w-2xl text-3xl font-bold uppercase tracking-tight sm:text-4xl">
            Hungry? Skip the line and order online.
          </h2>
          <p className="max-w-xl text-lg text-background/70">
            Pickup is handled by our ordering partner — tap below and we&apos;ll have it hot
            and ready.
          </p>
          <OrderButton size="lg" />
        </div>
      </section>

      {/* Explore links */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { href: "/menu", title: "Menu", body: "Tenders, sandwiches, plates, and the sides that go with them." },
            { href: "/about", title: "Our Story", body: "How JP's brought Nashville heat to Clarksville." },
            { href: "/contact", title: "Visit Us", body: "Hours, directions, and how to reach us." },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-brand"
            >
              <h3 className="text-xl font-bold uppercase tracking-tight group-hover:text-brand">
                {card.title}
              </h3>
              <p className="mt-2 text-base text-muted-foreground">{card.body}</p>
              <span className="mt-4 inline-block font-semibold text-brand">Explore →</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
