import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Flame } from "lucide-react";

import { siteConfig } from "@/data/site";
import { DRIZZLES, HEAT_LEVELS, MENU, PRICES_CHECKED, type StorePrices, type StoreSlug } from "@/data/menu";
import { formatPrice } from "@/lib/format";
import { buildBreadcrumbJsonLd, buildMenuJsonLd, serializeJsonLd } from "@/lib/jsonld";
import { TrackedOrderButton } from "@/components/TrackedOrderButton";

export const metadata: Metadata = {
  title: "Hot Chicken Menu & Prices",
  description:
    "JP's Hot Chicken menu with prices: Nashville hot chicken sandwiches, jumbo tenders, wings, fried catfish, combos and sides, in four heat levels.",
  alternates: { canonical: "/menu" },
};

const STORE_LABEL: Record<StoreSlug, string> = Object.fromEntries(
  siteConfig.locations.map((loc) => [loc.slug, loc.street]),
) as Record<StoreSlug, string>;

const checkedDate = new Date(`${PRICES_CHECKED}T12:00:00`).toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

/** "$8.99", "$1.99 Trenton Rd · $2.99 Fort Campbell Blvd", or "" for no price. */
function priceText(at: StorePrices): string {
  const entries = Object.entries(at) as [StoreSlug, number | null][];
  const priced = entries.filter((e): e is [StoreSlug, number] => e[1] != null);
  if (priced.length === 0) return "";
  if (priced.every(([, p]) => p === priced[0][1])) return formatPrice(priced[0][1]);
  return priced.map(([store, p]) => `${formatPrice(p)} ${STORE_LABEL[store]}`).join(" · ");
}

/** "Trenton Rd only" when one store sells it; nothing when both do. */
function storeNote(at: StorePrices): string | null {
  const stores = Object.keys(at) as StoreSlug[];
  return stores.length === 1 ? `${STORE_LABEL[stores[0]]} only` : null;
}

function orderingPlatform(url: string): string {
  if (url.includes("toast")) return "toast";
  if (url.includes("skytab")) return "skytab";
  return "direct";
}

const orderableStores = siteConfig.locations.filter((loc) => loc.isOpen && loc.orderingUrl);

function OrderLinks({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "flex flex-wrap gap-2" : "grid gap-3 sm:grid-cols-2"}>
      {orderableStores.map((loc) => (
        <TrackedOrderButton
          key={loc.slug}
          href={loc.orderingUrl!}
          size={compact ? "default" : "lg"}
          variant={compact ? "outline" : "solid"}
          className={compact ? "h-9 px-4 text-sm" : "w-full"}
          eventParams={{ location: loc.slug, platform: orderingPlatform(loc.orderingUrl!) }}
        >
          {compact ? `Order · ${loc.street}` : `Order Pickup · ${loc.street}`}
        </TrackedOrderButton>
      ))}
    </div>
  );
}

export default function MenuPage() {
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "Menu", path: "/menu" },
  ];
  const jsonLd = [buildMenuJsonLd(), buildBreadcrumbJsonLd(breadcrumbs)];

  return (
    <div className="bg-white">
      {jsonLd.map((data, i) => (
        <script
          key={i}
          type="application/ld+json"
          // Trusted, build-time data derived from src/data/menu.ts.
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
        />
      ))}

      <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-14">
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1 text-sm text-muted-foreground">
            <li className="flex items-center gap-1">
              <Link href="/" className="hover:text-brand hover:underline">
                Home
              </Link>
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </li>
            <li>
              <span aria-current="page" className="font-semibold text-foreground">
                Menu
              </span>
            </li>
          </ol>
        </nav>

        <header className="mt-5">
          <h1 className="font-heading text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl">
            Hot Chicken Menu
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Nashville-style hot chicken sandwiches, jumbo tenders, wings, fried catfish, combos and
            sides at {siteConfig.name} in{" "}
            {siteConfig.locations.map((loc) => `${loc.city}, ${loc.state}`).join(" and ")}.
          </p>
        </header>

        <section aria-label="Order online" className="mt-6">
          <OrderLinks />
          <p className="mt-3 text-center text-sm text-muted-foreground">
            Prices checked {checkedDate}. The ordering page always has the current price.
          </p>
        </section>

        {/* Jump links: real anchors, so they work without JavaScript. */}
        <nav aria-label="Menu sections" className="mt-8 -mx-4 overflow-x-auto px-4">
          <ul className="flex gap-2 pb-2">
            {[{ id: "heat-levels", title: "Heat Levels" }, ...MENU].map((section) => (
              <li key={section.id} className="shrink-0">
                <a
                  href={`#${section.id}`}
                  className="inline-flex h-9 items-center rounded-full border border-border px-4 text-sm font-semibold hover:border-brand hover:text-brand"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <section id="heat-levels" aria-labelledby="heat-title" className="mt-8 scroll-mt-40 rounded-2xl bg-neutral-100 p-6">
          <h2
            id="heat-title"
            className="flex items-center gap-2 font-heading text-2xl font-bold uppercase tracking-tight"
          >
            <Flame className="size-5 text-brand" aria-hidden="true" />
            Heat Levels
          </h2>
          <p className="mt-2">
            We have four heat levels. Southern has no heat at all, so it&apos;s the pick for kids
            and anyone who doesn&apos;t want spice.
          </p>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {HEAT_LEVELS.map((level, i) => (
              <li key={level.name} className="rounded-xl bg-white p-4">
                <p className="font-heading text-lg font-bold uppercase">
                  {i + 1}. {level.name}
                </p>
                <p className="mt-1 text-muted-foreground">{level.description}</p>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">
            Add a drizzle on top for $1 at {STORE_LABEL.clarksville}: {DRIZZLES.join(", ")}.
          </p>
        </section>

        {MENU.map((section) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-title`}
            className="mt-12 scroll-mt-40"
          >
            <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-black pb-2">
              <h2
                id={`${section.id}-title`}
                className="font-heading text-2xl font-bold uppercase tracking-tight sm:text-3xl"
              >
                {section.title}
              </h2>
            </div>
            {section.intro && <p className="mt-3 text-muted-foreground">{section.intro}</p>}

            <ul className="mt-4 grid gap-x-8 sm:grid-cols-2">
              {section.items.map((item) => {
                const note = storeNote(item.at);
                const price = priceText(item.at);
                return (
                  <li key={item.name} className="flex gap-4 border-b border-border py-4">
                    {item.image && (
                      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100 sm:size-24">
                        <Image
                          src={item.image.src}
                          alt={item.image.alt}
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-heading text-lg font-bold leading-tight">{item.name}</h3>
                        {price && !price.includes("·") && (
                          <p className="shrink-0 font-semibold">{price}</p>
                        )}
                      </div>
                      {price.includes("·") && <p className="mt-0.5 text-sm font-semibold">{price}</p>}
                      {item.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                      )}
                      {note && (
                        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-brand">{note}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="mt-4">
              <OrderLinks compact />
            </div>
          </section>
        ))}

        <section aria-labelledby="allergy-title" className="mt-12 rounded-2xl border border-border p-6">
          <h2 id="allergy-title" className="font-heading text-xl font-bold uppercase tracking-tight">
            Food allergies
          </h2>
          <p className="mt-2 text-muted-foreground">
            Tell us about any allergy before you order, and call the store if you have a question
            about an ingredient.
          </p>
        </section>

        <section aria-labelledby="stores-title" className="mt-10">
          <h2 id="stores-title" className="font-heading text-xl font-bold uppercase tracking-tight">
            Where to find us
          </h2>
          <ul className="mt-3 space-y-2">
            {siteConfig.locations.map((loc) => (
              <li key={loc.slug}>
                <Link href={`/locations/${loc.pageSlug}`} className="font-semibold text-brand hover:underline">
                  Hot chicken in {loc.city}, {loc.state}
                </Link>{" "}
                <span className="text-muted-foreground">
                  · {loc.streetNumber} {loc.street}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
