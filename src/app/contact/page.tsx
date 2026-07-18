import type { Metadata } from "next";
import { Clock, MapPin, Phone, Truck } from "lucide-react";

import { siteConfig } from "@/data/site";
import { formatPhone, telHref } from "@/lib/format";
import { getWeekRows, getOnlineWeekRows } from "@/lib/hours";
import { KentuckyIcon, TennesseeIcon } from "@/components/StateIcons";

const STATE_ICONS = { KY: KentuckyIcon, TN: TennesseeIcon } as const;


export const metadata: Metadata = {
  title: "Contact & Hours",
  description: `Hours, locations, and contact info for ${siteConfig.name} in Clarksville, TN and Oak Grove, KY. Find directions, call ahead, or order online.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const storeHours = getWeekRows();
  const { locations } = siteConfig;
  const onlineHours = getOnlineWeekRows();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="max-w-2xl">
        <p className="font-heading text-sm font-semibold tracking-[0.3em] text-brand">
          Visit Us
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Contact and Hours
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Two locations serving Nashville-style hot chicken. Come by, call ahead,
          or order online for pickup.
        </p>
      </header>

      {/* Locations */}
      <section className="mt-10">
        <div className="grid gap-6 sm:grid-cols-2">
          {locations.map((loc) => {
            const fullAddress = `${loc.streetNumber} ${loc.street}, ${loc.city}, ${loc.state} ${loc.zip}`;
            const mapQuery = encodeURIComponent(`${siteConfig.name}, ${fullAddress}`);
            const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`;
            const StateShape = STATE_ICONS[loc.state];

            return (
              <div
                key={loc.slug}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <div className="flex items-center gap-3">
                  <StateShape
                    className="h-14 w-auto shrink-0 fill-white stroke-brand [stroke-linejoin:round] [stroke-width:2] sm:h-16"
                    aria-hidden="true"
                  />
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold tracking-tight">{loc.name}</h3>
                    {loc.isNew && (
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                        New
                      </span>
                    )}
                  </div>
                </div>
                <ul className="mt-4 space-y-3 text-lg">
                  <li className="flex items-start gap-3">
                    <MapPin className="mt-1 size-6 shrink-0 text-muted-foreground" />
                    <div>
                      <a
                        href={directionsHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold hover:text-brand"
                      >
                        {loc.streetNumber} {loc.street}
                        <br />
                        {loc.city}, {loc.state} {loc.zip}
                      </a>

                    </div>
                  </li>
                  <li className="flex items-center gap-3">
                    <Phone className="size-6 shrink-0 text-muted-foreground" />
                    {loc.phone ? (
                      <a
                        href={telHref(loc.phone)}
                        className="font-semibold hover:text-brand"
                      >
                        {formatPhone(loc.phone)}
                      </a>
                    ) : (
                      <span className="font-semibold text-muted-foreground">
                        Phone coming soon
                      </span>
                    )}
                  </li>
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* Hours + contact */}
      <section aria-label="Hours and contact" className="border-b border-border bg-white">
        <div className="mt-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
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


    </div>
  );
}
