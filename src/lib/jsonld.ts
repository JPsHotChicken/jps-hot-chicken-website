import { siteConfig, type Location, type WeekHours } from "@/data/site";
import { DAY_KEYS, DAY_LABELS } from "@/lib/hours";
import { MENU, type StorePrices } from "@/data/menu";

/**
 * schema.org structured data, built from `siteConfig` so it can never drift from
 * the visible content. One brand-level `Organization` node is injected site-wide
 * (root layout); a full `Restaurant` node per store is injected on its
 * `/locations/[pageSlug]` page; the home page carries the whole graph. Shared `@id`s
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
const MENU_URL = `${siteConfig.url}/menu`;
const MENU_ID = `${MENU_URL}#menu`;

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
/** Google Maps search link for one store — the visible "Get directions" target. */
export function googleMapsUrl(loc: Location): string {
  const q = encodeURIComponent(
    `${siteConfig.name}, ${loc.streetNumber} ${loc.street}, ${loc.city}, ${loc.state} ${loc.zip}`,
  );
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function locationNode(loc: Location) {
  const pageUrl = `${siteConfig.url}/locations/${loc.pageSlug}`;
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
    hasMap: googleMapsUrl(loc),
    menu: MENU_URL,
    hasMenu: { "@id": MENU_ID },
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

/** One price for an item, or undefined when the stores charge differently. */
function singlePrice(at: StorePrices): number | undefined {
  const prices = Object.values(at);
  if (prices.length === 0 || prices.some((p) => p == null)) return undefined;
  return prices.every((p) => p === prices[0]) ? (prices[0] as number) : undefined;
}

/**
 * The /menu page as schema.org Menu, generated from the same data the page
 * renders, so the markup always matches what visitors see. Prices are only
 * given where both stores agree (or only one sells it).
 */
export function buildMenuJsonLd() {
  return {
    ...JSONLD_CONTEXT,
    "@type": "Menu",
    "@id": MENU_ID,
    name: `${siteConfig.name} Menu`,
    url: MENU_URL,
    inLanguage: "en-US",
    hasMenuSection: MENU.map((section) => ({
      "@type": "MenuSection",
      name: section.title,
      ...(section.intro && { description: section.intro }),
      hasMenuItem: section.items.map((item) => {
        const price = singlePrice(item.at);
        return {
          "@type": "MenuItem",
          name: item.name,
          ...(item.description && { description: item.description }),
          ...(item.image && { image: new URL(encodeURI(item.image.src), siteConfig.url).toString() }),
          ...(price !== undefined && {
            offers: { "@type": "Offer", price: price.toFixed(2), priceCurrency: "USD" },
          }),
        };
      }),
    })),
  };
}

/** Visible breadcrumb trail as BreadcrumbList. Paths are site-relative. */
export function buildBreadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    ...JSONLD_CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: new URL(item.path, siteConfig.url).toString(),
    })),
  };
}

/** FAQPage for questions answered in visible text on the same page. */
export function buildFaqJsonLd(faqs: { question: string; answer: string }[]) {
  return {
    ...JSONLD_CONTEXT,
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

/** Full Restaurant node for one store, injected on its /locations/[pageSlug] page. */
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
