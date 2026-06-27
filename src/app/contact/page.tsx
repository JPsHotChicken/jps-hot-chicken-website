import type { Metadata } from "next";
import { Mail, MapPin, Phone } from "lucide-react";

import { siteConfig } from "@/data/site";
import { formatPhone, telHref } from "@/lib/format";
import { getWeekRows } from "@/lib/hours";
import { OrderButton } from "@/components/OrderButton";

export const metadata: Metadata = {
  title: "Contact & Hours",
  description: `Hours, location, and contact info for ${siteConfig.name} in ${siteConfig.address.city}, ${siteConfig.address.state}. Find directions, call ahead, or order online.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const { address } = siteConfig;
  const fullAddress = `${address.street}, ${address.city}, ${address.state} ${address.zip}`;
  const mapQuery = encodeURIComponent(`${siteConfig.name}, ${fullAddress}`);
  const mapEmbedSrc = `https://www.google.com/maps?q=${mapQuery}&output=embed`;
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${mapQuery}`;
  const week = getWeekRows();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="max-w-2xl">
        <p className="font-heading text-sm font-semibold tracking-[0.3em] text-brand">
          Visit Us
        </p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">
          Contact &amp; Hours
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Come by, call ahead, or order online for pickup.
        </p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        {/* Left: details */}
        <div className="space-y-8">
          <section>
            <h2 className="text-2xl font-bold tracking-tight">Get in Touch</h2>
            <ul className="mt-4 space-y-4 text-lg">
              <li className="flex items-start gap-3">
                <MapPin className="mt-1 size-6 shrink-0 text-brand" />
                <div>
                  <a
                    href={directionsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold hover:text-brand"
                  >
                    {address.street}
                    <br />
                    {address.city}, {address.state} {address.zip}
                  </a>
                  <a
                    href={directionsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block text-base font-semibold text-brand hover:underline"
                  >
                    Get directions →
                  </a>
                </div>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="size-6 shrink-0 text-brand" />
                <a href={telHref(siteConfig.phone)} className="font-semibold hover:text-brand">
                  {formatPhone(siteConfig.phone)}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Mail className="size-6 shrink-0 text-brand" />
                <a href={`mailto:${siteConfig.email}`} className="font-semibold hover:text-brand">
                  {siteConfig.email}
                </a>
              </li>
            </ul>
            <div className="mt-6">
              <OrderButton size="lg" />
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-bold tracking-tight">Hours</h2>
            <table className="mt-4 w-full max-w-md text-lg">
              <tbody>
                {week.map((row) => (
                  <tr
                    key={row.key}
                    className={
                      row.isToday
                        ? "font-semibold text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    <th scope="row" className="py-1.5 text-left font-semibold">
                      {row.label}
                      {row.isToday && (
                        <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                          Today
                        </span>
                      )}
                    </th>
                    <td className="py-1.5 text-right tabular-nums">{row.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        {/* Right: map */}
        <section aria-label="Map">
          <div className="overflow-hidden rounded-2xl border border-border bg-muted">
            <iframe
              title={`Map showing the location of ${siteConfig.name}`}
              src={mapEmbedSrc}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-[360px] w-full lg:h-[520px]"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
