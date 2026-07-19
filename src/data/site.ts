// Single source of truth for site-wide info.
// Reference `siteConfig` everywhere — never hardcode name, phone, hours, etc. into JSX.
//
// ⚠️ MISSING BUSINESS DATA (owner to provide). These fields are *omitted* — never
// faked — so no placeholder can reach the live site, Google, or the structured data:
//   - Clarksville: phone, orderingUrl, doordashUrl, uberEatsUrl (ordering CTAs and
//     the phone line appear automatically once these are set)
//   - socials: real Instagram / Facebook page URLs (published as schema.org sameAs)
//   - googleBusinessUrl per location: Google Business Profile / Maps listing link
// ✏️ CONFIRM with the owner:
//   - Oak Grove phone number
//   - lat/lng (geocoded from each address — check they pin the right storefront;
//     Oak Grove matched at street level, Clarksville matched the exact address)

export type DayHours = { open: string; close: string } | null;

/** A full week of opening hours. 24h "HH:MM" strings; null = closed that day. */
export type WeekHours = {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
};

/** Social profile URLs. Leave a key unset until the profile is confirmed real. */
export type SocialLinks = {
  instagram?: string;
  facebook?: string;
};

export type RestaurantLocation = {
  slug: string;
  name: string;
  /** How the owner refers to the store in short labels ("Fort Campbell", "Trenton"). */
  shortLabel: string;
  streetNumber: string;
  street: string;
  city: string;
  state: "KY" | "TN";
  zip: string;
  /** Storefront coordinates — power schema.org GeoCoordinates and map embeds. */
  lat: number;
  lng: number;
  /** Store phone. Omit until the real number is known — never a placeholder. */
  phone?: string;
  /** Direct online-ordering link. Ordering CTAs hide while absent. */
  orderingUrl?: string;
  doordashUrl?: string;
  uberEatsUrl?: string;
  /** Google Business Profile / Maps listing link (schema.org sameAs). */
  googleBusinessUrl?: string;
  /** Per-location hours; falls back to `siteConfig.hours` when omitted. */
  hours?: WeekHours;
  /** Open for business — drives banners, "Now Open" badges, and ordering CTAs. */
  isOpen: boolean;
  /** Recently opened — shows the "New" badge. */
  isNew: boolean;
};

const locations: readonly RestaurantLocation[] = [
  {
    slug: "oak-grove",
    name: "Oak Grove",
    shortLabel: "Fort Campbell",
    streetNumber: "15224",
    street: "Fort Campbell Blvd",
    city: "Oak Grove",
    state: "KY",
    zip: "42262",
    lat: 36.67155,
    lng: -87.44487,
    phone: "270-697-5036",
    orderingUrl: "https://online.skytab.com/76c8815234573fee8849c9b74d24d10a",
    doordashUrl:
      "https://www.doordash.com/store/jp's-hot-chicken-oak-grove-654727/52036546/?cursor=eyJzdG9yZV9wcmltYXJ5X3ZlcnRpY2FsX2lkcyI6WzEsNCwxNzcsMTkzLDE5NV19&pickup=false",
    uberEatsUrl:
      "https://www.ubereats.com/store/jps-hot-chicken-oak-grove/VOMPrQmMSH-RHVYUoOLrYA?utm_campaign=place-action-link&utm_medium=organic&utm_source=google",
    isOpen: true,
    isNew: false,
  },
  {
    slug: "clarksville",
    name: "Clarksville",
    shortLabel: "Trenton",
    streetNumber: "2670",
    street: "Trenton Rd",
    city: "Clarksville",
    state: "TN",
    zip: "37040",
    lat: 36.57885,
    lng: -87.31505,
    // phone / orderingUrl / doordashUrl / uberEatsUrl: pending — see header note.
    isOpen: true,
    isNew: true,
  },
];

export const siteConfig = {
  name: "JP's Hot Chicken",
  tagline: "Nashville-style Hot Chicken",
  // 📣 ANNOUNCEMENT BANNER — the alert bar at the top of the home page.
  //   • enabled : flip to `true` to show it, `false` to hide it.
  //   • message : the text to display.
  //   • variant : "brand" (red), "warning" (amber), "info" (dark neutral), or "gray" (gray w/ black text).
  announcement: {
    enabled: true,
    message: "Opening soon on Trenton Rd in Clarksville, TN",
    variant: "gray",
  },
  description:
    "JP's Hot Chicken serves Nashville-style hot chicken in Clarksville, TN and Oak Grove, KY.",
  url: "https://www.jpshotchicken.com",
  email: "jpshotchicken@gmail.com",
  locations,
  // Cuisine + price range power the Restaurant JSON-LD for local search.
  cuisine: "Hot Chicken",
  priceRange: "$$",
  // Use 24h "HH:MM" strings; null = closed that day.
  hours: {
    monday: { open: "10:00", close: "21:00" },
    tuesday: { open: "10:00", close: "21:00" },
    wednesday: { open: "10:00", close: "21:00" },
    thursday: { open: "10:00", close: "21:00" },
    friday: { open: "10:00", close: "21:00" },
    saturday: { open: "10:00", close: "21:00" },
    sunday: null,
  } satisfies WeekHours,
  // ⚠️ Set to the real profile URLs to publish them in the structured data.
  socials: {} as SocialLinks,
} as const;

export type SiteConfig = typeof siteConfig;
export type Location = (typeof siteConfig)["locations"][number];
