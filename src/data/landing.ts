/**
 * Paid search landing pages.
 *
 * One entry per non-brand ad group in the Google Ads account. The rule these
 * exist to satisfy: the headline a visitor reads must match the words they
 * typed. Someone who searched "wings clarksville" and lands on a generic home
 * page bounces, and we paid for that click.
 *
 * `h1` is deliberately close to the ad group's core keyword. That is not
 * keyword stuffing — it is the message match that makes a paid click convert,
 * and it also feeds Google's landing page experience score, which lowers CPC.
 *
 * Keep these in sync with `googleAds/code/plan.py`; each ad group's final URL
 * should point at the matching `slug` below.
 */

import { entrees, sides, type FoodImage } from "@/data/food";

export type LandingPage = {
  /** URL segment, also the Google Ads final URL path. */
  slug: string;
  /** The ad group in the Google Ads account this page serves. */
  adGroup: string;
  /** Matches the searched keyword as closely as it can while reading naturally. */
  h1: string;
  /** Sits under the H1. One line, concrete, no marketing filler. */
  subhead: string;
  title: string;
  description: string;
  /** Section heading above the food grid. */
  foodHeading: string;
  /** Names from `data/food.ts` to feature, most relevant to this theme first. */
  featured: string[];
  /** Three short reasons to choose JP's, themed to the page. */
  points: { heading: string; body: string }[];
};

export const LANDING_PAGES: readonly LandingPage[] = [
  {
    slug: "hot-chicken-clarksville",
    adGroup: "Hot Chicken | Clarksville",
    h1: "Nashville Hot Chicken in Clarksville, TN",
    subhead:
      "Fried to order, six heat levels, from no-heat to genuinely blazing. Two minutes off Trenton Road.",
    title: "Hot Chicken in Clarksville, TN",
    description:
      "Nashville-style hot chicken in Clarksville, TN. Sandwiches, jumbo tenders, wings and chicken & waffles, fried fresh to order. Order online for pickup.",
    foodHeading: "What people order",
    featured: ["JP's Sandwich", "Jumbo Tenders", "Chicken & Waffles", "Whole Wings"],
    points: [
      {
        heading: "Heat you pick",
        body: "From plain through to our hottest. You choose the level, we don't guess it for you.",
      },
      {
        heading: "Fried when you order it",
        body: "Nothing sits under a heat lamp. It costs you a few minutes and it is worth them.",
      },
      {
        heading: "Nine dipping sauces",
        body: "JP's sauce, ranch, hot honey, buffalo, BBQ, honey mustard, tartar, hot sauce, syrup.",
      },
    ],
  },
  {
    slug: "fried-chicken-clarksville",
    adGroup: "Fried Chicken & Tenders | Clarksville",
    h1: "Fried Chicken & Jumbo Tenders in Clarksville",
    subhead:
      "Hand-breaded, fried to order, as mild or as hot as you want it. Chicken & waffles and fried catfish too.",
    title: "Fried Chicken in Clarksville, TN",
    description:
      "Fried chicken, jumbo tenders, chicken & waffles and fried catfish in Clarksville, TN. Hand-breaded and fried fresh to order. Order online for pickup.",
    foodHeading: "Off the fryer",
    featured: ["Jumbo Tenders", "Chicken & Waffles", "Catfish", "JP's Sandwich"],
    points: [
      {
        heading: "Jumbo tenders, not strips",
        body: "Whole tenderloins, hand-breaded. The size is the point.",
      },
      {
        heading: "Mild is a real option",
        body: "Hot chicken is what we're known for, but plenty of the menu comes with no heat at all.",
      },
      {
        heading: "Sides that hold up",
        body: "Mac and cheese, cajun fries, fried okra, fried pickles, slaw, baked beans.",
      },
    ],
  },
  {
    slug: "wings-clarksville",
    adGroup: "Wings & Sandwiches | Clarksville",
    h1: "Chicken Wings & Hot Chicken Sandwiches in Clarksville",
    subhead:
      "Whole wings and Nashville-style sandwiches, fried to order. Pick your heat, pick your sauce.",
    title: "Wings & Chicken Sandwiches in Clarksville, TN",
    description:
      "Chicken wings and Nashville hot chicken sandwiches in Clarksville, TN. Whole wings, breaded or naked, nine dipping sauces. Order online for pickup.",
    foodHeading: "Wings and sandwiches",
    featured: ["Whole Wings", "Wings", "JP's Sandwich", "Jumbo Tenders"],
    points: [
      {
        heading: "Whole wings",
        body: "Breaded or naked. Sauced to the heat level you ask for, not the one we default to.",
      },
      {
        heading: "Built for sharing",
        body: "Wings, fries and poppers travel well. Order ahead and collect on the way through.",
      },
      {
        heading: "Nine dipping sauces",
        body: "Ranch and JP's sauce are the two most ordered. Hot honey is the one people come back for.",
      },
    ],
  },
] as const;

export function getLandingPage(slug: string): LandingPage | undefined {
  return LANDING_PAGES.find((page) => page.slug === slug);
}

/**
 * Resolve featured item names to real images from `data/food.ts`.
 *
 * Silently drops a name with no matching image rather than rendering a broken
 * tile — a missing photo should never take a paid landing page down with it.
 */
export function featuredImages(page: LandingPage): FoodImage[] {
  const catalogue = [...entrees, ...sides];
  return page.featured.flatMap((name) => {
    const match = catalogue.find((item) => item.name === name);
    return match ? [match] : [];
  });
}
