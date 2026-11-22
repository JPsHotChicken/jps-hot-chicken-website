import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { siteConfig } from "@/data/site";
import { LOCATION_PAGE_COPY } from "@/data/location-pages";
import { HEAT_LEVELS, MENU, type MenuItem } from "@/data/menu";
import { formatPrice } from "@/lib/format";
import { ONLINE_CLOSE, formatTime, summarizeWeek } from "@/lib/hours";
import { buildBreadcrumbJsonLd, buildFaqJsonLd, serializeJsonLd } from "@/lib/jsonld";

export const metadata: Metadata = {
  title: "FAQ: Heat Levels, Hours & Delivery",
  description:
    "Answers about JP's Hot Chicken: our four heat levels, a no-heat option, catfish, kids meals, hours, delivery in Clarksville and Oak Grove, and catering.",
  alternates: { canonical: "/faq" },
};

/**
 * Every answer is built from site.ts, location-pages.ts and menu.ts, so the
 * page, its FAQPage schema, the menu and the location pages can't disagree.
 * Only add a question whose answer the owner has confirmed.
 */
type Faq = {
  question: string;
  /** Plain text, used word for word in the visible answer AND the schema. */
  answer: string;
  /** Optional follow-up link shown under the answer (not part of the schema). */
  link?: { href: string; label: string };
};

const STORE_STREET = Object.fromEntries(siteConfig.locations.map((l) => [l.slug, l.street]));

function findItem(name: string): MenuItem {
  for (const section of MENU) {
    const item = section.items.find((i) => i.name === name);
    if (item) return item;
  }
  throw new Error(`FAQ refers to a menu item that no longer exists: ${name}`);
}

/** "$9.49" when every store charges the same, otherwise "$1.99 at Trenton Rd and $2.99 at Fort Campbell Blvd". */
function priceAt(item: MenuItem): string {
  const priced = Object.entries(item.at).filter((e): e is [string, number] => e[1] != null);
  if (priced.every(([, p]) => p === priced[0][1])) return formatPrice(priced[0][1]);
  return priced.map(([store, p]) => `${formatPrice(p)} at ${STORE_STREET[store]}`).join(" and ");
}

function sectionItems(id: string): readonly MenuItem[] {
  return MENU.find((s) => s.id === id)?.items ?? [];
}

function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function buildFaqGroups(): { title: string; faqs: Faq[] }[] {
  const locs = siteConfig.locations;
  const catfish = findItem("Fried Catfish (2 pc)");
  const catfishCombo = findItem("Fried Catfish Combo");
  const kids = sectionItems("kids");
  const combos = MENU.find((s) => s.id === "combos");
  const comboPrices = [...new Set(combos?.items.flatMap((i) => Object.values(i.at)).filter((p): p is number => p != null))].sort(
    (a, b) => a - b,
  );
  const catering = sectionItems("catering");
  const cateringStores = [...new Set(catering.flatMap((i) => Object.keys(i.at)))].map((s) => STORE_STREET[s]);

  // Hours: one answer when every store keeps the same hours, otherwise per store.
  const weekText = (loc: (typeof locs)[number]) =>
    summarizeWeek(loc.hours ?? siteConfig.hours)
      .map((row) => `${row.days}: ${row.hours}`)
      .join(". ");
  const hourTexts = locs.map(weekText);
  const sameHours = hourTexts.every((t) => t === hourTexts[0]);
  const hoursAnswer = sameHours
    ? `Both stores keep the same hours. ${hourTexts[0]}.`
    : locs.map((loc, i) => `${loc.street} in ${loc.city}. ${hourTexts[i]}.`).join(" ");

  const deliveryApps = (loc: (typeof locs)[number]) =>
    [loc.doordashUrl && "DoorDash", loc.uberEatsUrl && "Uber Eats"].filter(Boolean) as string[];
  const allApps = [...new Set(locs.flatMap(deliveryApps))];
  const deliveryArea = LOCATION_PAGE_COPY[locs[0].slug]?.deliveryArea;
  const parking = LOCATION_PAGE_COPY[locs[0].slug]?.parking;
  const orderableStores = locs.filter((l) => l.isOpen && l.orderingUrl);

  const food: Faq[] = [
    {
      question: "What is Nashville hot chicken?",
      answer:
        "Nashville hot chicken is fried chicken coated in a cayenne pepper spice, so the heat sits right on the crispy crust. At JP's Hot Chicken every piece is fried to order at the heat level you pick.",
    },
    {
      question: "How many heat levels do you have?",
      answer: `Four. ${HEAT_LEVELS.map((l) => `${l.name}: ${l.description}`).join(" ")}`,
      link: { href: "/menu#heat-levels", label: "Heat levels on the menu" },
    },
    {
      question: "Do you have anything that isn't spicy?",
      answer:
        "Yes. Pick Southern, which has no heat at all. It's our crispy, seasoned fried chicken without the spice, and it works for any sandwich, tender, wing or combo.",
    },
    {
      question: "Do you have catfish?",
      answer: `Yes. Fried Catfish (2 pc) is ${priceAt(catfish)}, or get the ${catfishCombo.name} for ${priceAt(catfishCombo)}.`,
      link: { href: "/menu#fish", label: "See the fish menu" },
    },
    ...(comboPrices.length > 0
      ? [
          {
            question: "What comes in a combo?",
            answer: `${combos?.intro ?? ""} Combos are ${
              comboPrices.length > 1
                ? `${formatPrice(comboPrices[0])} to ${formatPrice(comboPrices.at(-1)!)}`
                : formatPrice(comboPrices[0])
            }.`.trim(),
            link: { href: "/menu#combos", label: "See every combo" },
          },
        ]
      : []),
    ...(kids.length > 0
      ? [
          {
            question: "Do you have a kids menu?",
            answer: `Yes. ${listJoin(kids.map((k) => `${k.name} (${priceAt(k)})`))}. Order it Southern for no heat.`,
            link: { href: "/menu#kids", label: "See kids meals" },
          },
        ]
      : []),
    {
      question: "Do you have allergen information?",
      answer:
        "Tell us about any allergy before you order, and call the store if you have a question about an ingredient.",
    },
  ];

  const visit: Faq[] = [
    {
      question: "Where are your locations?",
      answer: locs
        .map(
          (loc) =>
            `${loc.streetNumber} ${loc.street}, ${loc.city}, ${loc.state} ${loc.zip}.${loc.landmark ? ` ${loc.landmark}` : ""}`,
        )
        .join(" "),
      link: { href: "/locations", label: "Directions to each store" },
    },
    { question: "What are your hours?", answer: hoursAnswer },
    {
      question: "When does online ordering close?",
      answer: `Online pickup orders and delivery stop at ${formatTime(ONLINE_CLOSE)}, 30 minutes before the store closes.`,
    },
    ...(parking ? [{ question: "Is there parking?", answer: `Yes. ${parking}` }] : []),
  ];

  const ordering: Faq[] = [
    ...(orderableStores.length > 0
      ? [
          {
            question: "Can I order online for pickup?",
            answer: `Yes. Order online from ${
              orderableStores.length > 1
                ? `either store, ${orderableStores.map((l) => l.street).join(" or ")},`
                : `our ${orderableStores[0].street} store`
            } and pick it up when it's ready. The order goes straight to our kitchen, with no delivery app in between.`,
            link: { href: "/order/pickup", label: "Order pickup" },
          },
        ]
      : []),
    ...(allApps.length > 0 && deliveryArea
      ? [
          {
            question: "Do you deliver?",
            answer: `Yes. We deliver to ${deliveryArea} through ${listJoin(allApps)}.`,
            link: { href: "/order/delivery", label: "Order delivery" },
          },
        ]
      : []),
    ...(catering.length > 0
      ? [
          {
            question: "Do you do catering?",
            answer: `Yes. Catering trays are ordered online from our ${listJoin(cateringStores)} store: ${listJoin(
              catering.map((i) => `${i.name} (${priceAt(i)})`),
            )}.`,
            link: { href: "/menu#catering", label: "See catering trays" },
          },
        ]
      : []),
  ];

  return [
    { title: "Food & heat levels", faqs: food },
    { title: "Locations & hours", faqs: visit },
    { title: "Ordering & delivery", faqs: ordering },
  ];
}

export default function FaqPage() {
  const groups = buildFaqGroups();
  const breadcrumbs = [
    { name: "Home", path: "/" },
    { name: "FAQ", path: "/faq" },
  ];
  const jsonLd = [
    buildFaqJsonLd(groups.flatMap((g) => g.faqs.map(({ question, answer }) => ({ question, answer })))),
    buildBreadcrumbJsonLd(breadcrumbs),
  ];

  return (
    <div className="bg-white">
      {jsonLd.map((data, i) => (
        <script
          key={i}
          type="application/ld+json"
          // Trusted, build-time data derived from the site's own data files.
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
        />
      ))}

      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
        <nav aria-label="Breadcrumb">
          <ol className="flex items-center gap-1 text-sm text-muted-foreground">
            <li className="flex items-center gap-1">
              <Link href="/" className="hover:text-brand hover:underline">
                Home
              </Link>
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </li>
            <li>
              <span aria-current="page" className="font-semibold text-foreground">
                FAQ
              </span>
            </li>
          </ol>
        </nav>

        <header className="mt-5">
          <h1 className="font-heading text-4xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-6xl">
            Frequently Asked Questions
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">{siteConfig.description}</p>
        </header>

        {groups.map((group) => (
          <section key={group.title} aria-label={group.title} className="mt-10">
            <h2 className="border-b-2 border-black pb-2 font-heading text-2xl font-bold uppercase tracking-tight">
              {group.title}
            </h2>
            <div className="divide-y divide-border">
              {group.faqs.map((faq) => (
                <div key={faq.question} className="py-5">
                  <h3 className="font-heading text-lg font-bold">{faq.question}</h3>
                  <div className="mt-1 text-muted-foreground">
                    <p>{faq.answer}</p>
                    {faq.link && (
                      <Link
                        href={faq.link.href}
                        className="mt-2 inline-block font-semibold text-brand underline-offset-2 hover:underline"
                      >
                        {faq.link.label}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        <p className="mt-12 text-muted-foreground">
          Didn&apos;t find your answer?{" "}
          <Link href="/contact" className="font-semibold text-brand hover:underline">
            Contact us
          </Link>{" "}
          or call the store.
        </p>
      </div>
    </div>
  );
}
