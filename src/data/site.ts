// Single source of truth for site-wide info.
// Reference `siteConfig` everywhere — never hardcode name, phone, hours, etc. into JSX.
//
// ⚠️ PLACEHOLDERS TO REPLACE BEFORE LAUNCH (flagged for the owner):
//   - url            → real production domain
//   - orderingUrl    → real third-party online-ordering link
//   - orderingUrlPickup / orderingUrlDelivery → real pickup & delivery links
//   - phone          → real phone number
//   - address        → real street address (currently the Clarksville, TN example)
//   - socials        → real Instagram / Facebook URLs
// The `email` is the owner's real address (jpshotchicken@gmail.com).

export type DayHours = { open: string; close: string } | null;

export const siteConfig = {
  name: "JP's Hot Chicken",
  tagline: "Nashville-style hot chicken, fried to order.",
  description:
    "JP's Hot Chicken serves Nashville-style hot chicken in Clarksville, TN — hand-breaded tenders and sandwiches, dialed from mild to cluckin' hot, with classic Southern sides.",
  url: "https://www.jpshotchicken.com", // ⚠️ PLACEHOLDER — set to the real production domain
  orderingUrl: "https://order.toasttab.com/online/jps-hot-chicken", // ⚠️ PLACEHOLDER — general "order" link (nav / CTAs)
  orderingUrlPickup: "https://order.toasttab.com/online/jps-hot-chicken?mode=pickup", // ⚠️ PLACEHOLDER — real pickup ordering link
  orderingUrlDelivery: "https://order.toasttab.com/online/jps-hot-chicken?mode=delivery", // ⚠️ PLACEHOLDER — real delivery ordering link
  phone: "+1-931-555-0142", // ⚠️ PLACEHOLDER — set to the real phone number
  email: "jpshotchicken@gmail.com",
  address: {
    street: "123 Main St", // ⚠️ PLACEHOLDER
    city: "Clarksville",
    state: "TN",
    zip: "37040",
  },
  // Physical locations, used by the pickup-order page.
  // ⚠️ Set each location's real ordering link.
  locations: [
    {
      slug: "oak-grove",
      name: "Oak Grove",
      streetNumber: "15224",
      street: "Fort Campbell Blvd",
      city: "Oak Grove",
      state: "KY",
      zip: "42262",
      orderingUrl: "https://order.toasttab.com/online/jps-hot-chicken-oak-grove", // ⚠️ PLACEHOLDER
      doordashUrl: "https://www.doordash.com/store/jps-hot-chicken-oak-grove", // ⚠️ PLACEHOLDER
      uberEatsUrl: "https://www.ubereats.com/store/jps-hot-chicken-oak-grove", // ⚠️ PLACEHOLDER
      isNew: false,
    },
    {
      slug: "clarksville",
      name: "Clarksville",
      streetNumber: "2670",
      street: "Trenton Rd",
      city: "Clarksville",
      state: "TN",
      zip: "37040",
      orderingUrl: "https://order.toasttab.com/online/jps-hot-chicken-clarksville", // ⚠️ PLACEHOLDER
      doordashUrl: "https://www.doordash.com/store/jps-hot-chicken-clarksville", // ⚠️ PLACEHOLDER
      uberEatsUrl: "https://www.ubereats.com/store/jps-hot-chicken-clarksville", // ⚠️ PLACEHOLDER
      isNew: true,
    },
  ],
  // Cuisine + price range power the Restaurant JSON-LD for local search.
  cuisine: "Hot Chicken",
  priceRange: "$$",
  // Use 24h "HH:MM" strings; null = closed that day.
  hours: {
    monday: { open: "11:00", close: "21:00" },
    tuesday: { open: "11:00", close: "21:00" },
    wednesday: { open: "11:00", close: "21:00" },
    thursday: { open: "11:00", close: "21:00" },
    friday: { open: "11:00", close: "22:00" },
    saturday: { open: "11:00", close: "22:00" },
    sunday: null,
  },
  socials: {
    instagram: "https://instagram.com/jpshotchicken", // ⚠️ PLACEHOLDER
    facebook: "https://facebook.com/jpshotchicken", // ⚠️ PLACEHOLDER
  },
} as const;

export type SiteConfig = typeof siteConfig;
export type Location = (typeof siteConfig)["locations"][number];
