import { siteConfig, type Location, type WeekHours } from "@/data/site";
import { DAY_KEYS, DAY_LABELS } from "@/lib/hours";

/**
 * schema.org structured data, built from `siteConfig` so it can never drift from
 * the visible content. One brand-level `Organization` node is injected site-wide
 * (root layout); a full `Restaurant` node per store is injected on its
 * `/locations/[slug]` page; the home page carries the whole graph. Shared `@id`s
 * let Google merge nodes seen on different pages.
 *
 * Fields without a confirmed real value (phone, ordering links, socials, GBP
 * links) are OMITTED — never emitted as placeholders.
 */

/** Escape `<` so the JSON is safe to inline in a `<script>` tag. */
export function serializeJsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const JSONLD_CONTEXT = { "@context": "https://schema.org" } as const;
const ORG_ID = `${siteConfig.url}/#organization`;

function buildOpeningHours(hours: WeekHours) {
  return DAY_KEYS.flatMap((key) => {
    const day = hours[key];
    if (!day) return [];
    return [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: DAY_LABELS[key],
        opens: day.open,
        closes: day.close,
      },
    ];
  });
}

/** The brand as a whole — no address, since the brand has two of them. */
function organizationNode() {
  const sameAs = [siteConfig.socials.instagram, siteConfig.socials.facebook].filter(
    (url): url is string => Boolean(url),
  );
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    email: siteConfig.email,
    logo: `${siteConfig.url}/opengraph-image`,
    ...(sameAs.length > 0 && { sameAs }),
  };
}

/** One physical store, with its real NAP (name/address/phone), geo, and hours. */
function locationNode(loc: Location) {
  const pageUrl = `${siteConfig.url}/locations/${loc.slug}`;
  return {
    "@type": "Restaurant",
    "@id": `${pageUrl}#restaurant`,
    // Same brand name at every store — must match the Google Business Profile
    // listing exactly for NAP consistency.
    name: siteConfig.name,
    url: pageUrl,
    ...(loc.phone && { telephone: loc.phone }),
    email: siteConfig.email,
    servesCuisine: siteConfig.cuisine,
    priceRange: siteConfig.priceRange,
    image: `${siteConfig.url}/opengraph-image`,
    address: {
      "@type": "PostalAddress",
      streetAddress: `${loc.streetNumber} ${loc.street}`,
      addressLocality: loc.city,
      addressRegion: loc.state,
      postalCode: loc.zip,
      addressCountry: "US",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: loc.lat,
      longitude: loc.lng,
    },
    openingHoursSpecification: buildOpeningHours(loc.hours ?? siteConfig.hours),
    ...(loc.googleBusinessUrl && { sameAs: [loc.googleBusinessUrl] }),
    parentOrganization: { "@id": ORG_ID },
    acceptsReservations: false,
    ...(loc.isOpen &&
      loc.orderingUrl && {
        potentialAction: {
          "@type": "OrderAction",
          target: loc.orderingUrl,
        },
      }),
  };
}

/** Site-wide Organization node, injected from the root layout. */
export function buildOrganizationJsonLd() {
  return { ...JSONLD_CONTEXT, ...organizationNode() };
}

/** Full Restaurant node for one store, injected on its /locations/[slug] page. */
export function buildLocationJsonLd(loc: Location) {
  return { ...JSONLD_CONTEXT, ...locationNode(loc) };
}

/** Every store as one graph, injected on the home page (the most-crawled URL). */
export function buildHomeJsonLd() {
  return {
    ...JSONLD_CONTEXT,
    "@graph": siteConfig.locations.map(locationNode),
  };
}
