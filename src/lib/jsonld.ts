import { siteConfig } from "@/data/site";
import { DAY_KEYS, DAY_LABELS } from "@/lib/hours";

/**
 * Build the schema.org `Restaurant` structured data from `siteConfig` so it can
 * never drift from the visible content. Powers the Google hours/map card.
 */
export function buildRestaurantJsonLd() {
  const openingHoursSpecification = DAY_KEYS.flatMap((key) => {
    const day = siteConfig.hours[key];
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

  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    telephone: siteConfig.phone,
    email: siteConfig.email,
    servesCuisine: siteConfig.cuisine,
    priceRange: siteConfig.priceRange,
    image: `${siteConfig.url}/opengraph-image`,
    address: {
      "@type": "PostalAddress",
      streetAddress: siteConfig.address.street,
      addressLocality: siteConfig.address.city,
      addressRegion: siteConfig.address.state,
      postalCode: siteConfig.address.zip,
      addressCountry: "US",
    },
    openingHoursSpecification,
    sameAs: [siteConfig.socials.instagram, siteConfig.socials.facebook],
    acceptsReservations: false,
  };
}
