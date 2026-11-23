import Link from "next/link";
import { MapPin, Store, Truck, UtensilsCrossed } from "lucide-react";

import { siteConfig } from "@/data/site";

const PRIMARY = [
  { href: "/order/pickup", label: "Order Pickup", Icon: Store },
  { href: "/order/delivery", label: "Order Delivery", Icon: Truck },
] as const;

/**
 * The 404 body, shared by app/not-found.tsx (unmatched URLs) and
 * (site)/not-found.tsx (notFound() inside a site page). Per the SEO checklist:
 * a real 404 status, with links to ordering and every location.
 */
export function NotFoundContent() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-14 text-center sm:px-6 sm:py-20">
      <p className="font-heading text-sm font-bold uppercase tracking-[0.25em] text-brand">404</p>
      <h1 className="mt-2 font-heading text-4xl font-extrabold uppercase tracking-tight sm:text-5xl">
        Page Not Found
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">
        That page doesn&apos;t exist, but the chicken does.
      </p>

      <div className="mx-auto mt-8 grid max-w-sm grid-cols-2 gap-3">
        {PRIMARY.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-1 rounded-xl border-2 border-brand bg-card p-3 font-heading font-bold tracking-tight shadow-sm transition-all hover:bg-brand/5 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50"
          >
            <Icon className="size-7" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </div>

      <section aria-labelledby="nf-locations" className="mt-10">
        <h2 id="nf-locations" className="font-heading text-xl font-bold uppercase tracking-tight">
          Our Locations
        </h2>
        <ul className="mt-3 space-y-2">
          {siteConfig.locations.map((loc) => (
            <li key={loc.slug}>
              <Link
                href={`/locations/${loc.pageSlug}`}
                className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline"
              >
                <MapPin className="size-4" aria-hidden="true" />
                Hot chicken in {loc.city}, {loc.state}
              </Link>
              <span className="text-muted-foreground">
                {" "}
                · {loc.streetNumber} {loc.street}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-semibold">
        <Link href="/menu" className="inline-flex items-center gap-1.5 hover:text-brand hover:underline">
          <UtensilsCrossed className="size-4" aria-hidden="true" />
          Menu
        </Link>
        <Link href="/faq" className="hover:text-brand hover:underline">
          FAQ
        </Link>
        <Link href="/" className="hover:text-brand hover:underline">
          Home
        </Link>
      </p>
    </div>
  );
}
