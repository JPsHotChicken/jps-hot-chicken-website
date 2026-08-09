import type { Metadata } from "next";
import Image from "next/image";

import { siteConfig } from "@/data/site";
import { OrderButton } from "@/components/OrderButton";

export const metadata: Metadata = {
  title: "About",
  description:
    "The story behind JP's Hot Chicken — Nashville-style heat, hand-breaded and fried to order, brought to Clarksville, TN.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="max-w-2xl">
        <p className="font-heading text-sm font-semibold tracking-[0.3em] text-brand">
          Our Story
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Nashville Heat, Clarksville Home
        </h1>
      </header>

      <div className="mt-10 grid items-center gap-8 md:grid-cols-2">
        <div className="space-y-4 text-lg leading-relaxed text-foreground/90">
          <p>
            {siteConfig.name} started with a simple obsession: get Nashville-style hot
            chicken exactly right. Hand-breaded, fried to order, and brushed with a
            cayenne-forward spice blend that you control — from a no-heat{" "}
            <strong>Southern</strong> all the way up to <strong>Cluckin&apos; Hot</strong>.
          </p>
          <p>
            We&apos;re a small kitchen that cares about the details: fresh oil, jumbo
            tenders, brioche buns toasted on the flat-top, and slaw cut the same morning
            it&apos;s served. No shortcuts, no holding trays of chicken under a lamp.
          </p>
          <p>
            Everything is made when you order it, so it lands on your tray crispy, juicy,
            and exactly as spicy as you asked for.
          </p>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
          <Image
            src="/images/kitchen.webp"
            alt="Hot chicken coming out of the fryer at JP's Hot Chicken"
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {[
          {
            title: "Made to Order",
            body: "Nothing sits. Every tender and sandwich is fried fresh when you order.",
          },
          {
            title: "Your Heat, Your Call",
            body: "Five levels from Southern to Cluckin' Hot — you set the pace.",
          },
          {
            title: "Southern Sides",
            body: "Mac & cheese, slaw, fried pickles, and banana pudding made in-house.",
          },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-xl font-bold tracking-tight text-brand">
              {item.title}
            </h2>
            <p className="mt-2 text-base text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 grid items-center gap-8 md:grid-cols-2">
        <div className="relative order-2 aspect-[4/3] overflow-hidden rounded-2xl bg-muted md:order-1">
          <Image
            src="/images/interior.webp"
            alt="The counter and booths inside JP's Hot Chicken"
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
        <div className="order-1 md:order-2">
          <h2 className="text-3xl font-bold tracking-tight">Come Hang Out</h2>
          <p className="mt-3 text-lg leading-relaxed text-foreground/90">
            Pull up to the counter in {siteConfig.locations.map((loc) => loc.city).join(" or ")}. Whether it&apos;s a quick
            lunch or a full spread for the table, we&apos;ll get you sorted. Prefer to grab
            and go? Order online and we&apos;ll have it ready.
          </p>
          <div className="mt-6">
            <OrderButton size="lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
