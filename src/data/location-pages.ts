/**
 * Copy for each /locations/[pageSlug] page — the part that is NOT already in
 * `siteConfig` (address, phone, hours, links live there).
 *
 * The SEO rule: every location page has its own copy, not a template with the
 * city swapped. Only facts the owner has confirmed go here. Still owed by the
 * owner (add when supplied, never guess): busy times, real storefront + team photos (Oak Grove has none yet), Google
 * Business Profile links, and customer reviews they have permission to quote.
 */

export type LocationPageCopy = {
  /** Opening paragraph under the H1. Plain, specific, no "best" claims. */
  intro: string;
  /** Real photos taken at this store. Omit until real ones exist. */
  photos?: { src: string; alt: string }[];
  /** Whether the store has a dining room customers can eat in (confirmed). */
  dineIn?: boolean;
  /** Parking, in the owner's words. */
  parking?: string;
  /** Where delivery reaches, in the owner's words. */
  deliveryArea?: string;
};

// Owner, 2026-11-22: "standard parking lot"; delivery covers all of
// Clarksville and Oak Grove.
const PARKING = "There's a parking lot right at the store.";
const DELIVERY_AREA = "all of Clarksville and Oak Grove";

export const LOCATION_PAGE_COPY: Record<string, LocationPageCopy> = {
  "oak-grove": {
    intro:
      "JP's Hot Chicken on Fort Campbell Blvd serves Nashville-style hot chicken in Oak Grove, KY, near Gate 6 of Fort Campbell. Sandwiches, jumbo tenders, wings, chicken & waffles and fried catfish are hand-breaded and fried to order, at the heat level you pick.",
    parking: PARKING,
    deliveryArea: DELIVERY_AREA,
  },
  clarksville: {
    intro:
      "Our Trenton Rd store is the newest JP's Hot Chicken, in the new white building across from the Honda dealership in Clarksville, TN. Eat in the dining room or order ahead for pickup. Every sandwich, tender and wing is hand-breaded and fried when you order it, from no-heat Southern up to Extra Hot.",
    dineIn: true,
    parking: PARKING,
    deliveryArea: DELIVERY_AREA,
    photos: Array.from({ length: 9 }, (_, i) => ({
      src: `/images/interior/JPs_Trenton_Interior${i + 1}.jpeg`,
      alt: `Inside the JP's Hot Chicken dining room on Trenton Rd, Clarksville (photo ${i + 1} of 9)`,
    })),
  },
};
