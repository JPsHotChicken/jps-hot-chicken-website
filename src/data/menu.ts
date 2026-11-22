/**
 * The public menu — the one source of truth for /menu and its structured data.
 *
 * Copied by hand from the two live ordering menus on PRICES_CHECKED:
 *   • Trenton Rd (Clarksville)      — Toast:  jpshotchicken.toast.site
 *   • Fort Campbell Blvd (Oak Grove) — SkyTab: online.skytab.com
 * Item descriptions are the owner's own SkyTab/Toast copy, with typos fixed.
 * Nothing is invented: no piece count, price or ingredient appears here unless
 * one of those menus shows it.
 *
 * ⚠️ Prices change on Toast/SkyTab, not here. When the owner changes a price,
 * update it below and bump PRICES_CHECKED in the same commit — the page shows
 * that date next to the prices.
 *
 * Allergens are deliberately absent: the SEO checklist says publish them only
 * when they're accurate and maintained, and nobody maintains a public list yet.
 */

/** `siteConfig.locations[].slug` values. */
export type StoreSlug = "clarksville" | "oak-grove";

/** Price at each store that sells the item. `null` = sold there, no separate price. */
export type StorePrices = Partial<Record<StoreSlug, number | null>>;

export type MenuItem = {
  name: string;
  description?: string;
  at: StorePrices;
  image?: { src: string; alt: string };
};

export type MenuSection = {
  id: string;
  title: string;
  /** One plain line under the heading. */
  intro?: string;
  items: MenuItem[];
};

export const PRICES_CHECKED = "2026-11-22";

/** Both stores, same price. */
const both = (price: number | null): StorePrices => ({ clarksville: price, "oak-grove": price });
const trentonOnly = (price: number | null): StorePrices => ({ clarksville: price });
const fortCampbellOnly = (price: number | null): StorePrices => ({ "oak-grove": price });

export const HEAT_LEVELS = [
  { name: "Southern", description: "No heat at all. Just our crispy, seasoned fried chicken." },
  { name: "Mild", description: "A little warmth. A good place to start if you're new to hot chicken." },
  { name: "Hot", description: "Real Nashville-style heat that builds as you eat." },
  { name: "Extra Hot", description: "Our hottest level, for people who want serious heat." },
] as const;

/** Optional sauce brushed over the top, +$1 on Toast (Trenton Rd). */
export const DRIZZLES = ["Carolina Gold", "Hot Honey", "Buffalo", "BBQ", "Lemon Pepper"] as const;

export const MENU: readonly MenuSection[] = [
  {
    id: "combos",
    title: "Big Combos",
    intro: "Every combo comes with two sides and a drink.",
    items: [
      {
        name: "JP's Hot Chicken Sandwich Combo",
        description:
          "Crispy, golden fried chicken breast on a bun with pickles, JP's sauce and coleslaw, at the heat level you pick.",
        at: both(15.99),
        image: { src: "/images/food/combos/cropped/chickenSandwichCombo.png", alt: "Nashville hot chicken sandwich combo with fries and a drink" },
      },
      {
        name: "Jumbo Tenders Combo",
        description: "Three jumbo, hand-breaded chicken tenders fried at your heat level, with pickles on the side.",
        at: both(15.99),
        image: { src: "/images/food/combos/cropped/jumboTendersCombo.png", alt: "Three jumbo hot chicken tenders with two sides and a drink" },
      },
      {
        name: "Wings Combo",
        description: "Six wings, breaded or not, with your choice of heat level and sauce.",
        at: both(16.99),
        image: { src: "/images/food/combos/cropped/partyWingsCombo.png", alt: "Six hot chicken wings combo" },
      },
      {
        name: "Whole Wings Combo",
        description: "Three whole wings fried and seasoned to your heat level.",
        at: both(16.99),
        image: { src: "/images/food/combos/cropped/wholeWingsCombo.png", alt: "Three whole hot chicken wings combo" },
      },
      {
        name: "Chicken Bites Combo",
        description: "Eight bite-size pieces of fried chicken at any heat level, with your choice of sauce.",
        at: both(15.99),
        image: { src: "/images/food/combos/cropped/chickenBitesCombo.png", alt: "Hot chicken bites combo" },
      },
      {
        name: "Fried Catfish Combo",
        description: "Two catfish fillets fried and seasoned to your heat level, with pickles and onion on the side.",
        at: both(16.99),
        image: { src: "/images/food/combos/cropped/catfishCombo.png", alt: "Fried catfish combo with two sides" },
      },
      {
        name: "Chicken & Waffles Combo",
        description: "A Belgian waffle topped with two fried tenders and powdered sugar, with syrup on the side.",
        at: both(15.99),
        image: { src: "/images/food/combos/cropped/chickenWafflesCombo.png", alt: "Hot chicken and waffles combo" },
      },
      {
        name: "JP's Chicken Burrito Combo",
        description: "Flour tortilla stuffed with fried chicken bites, coleslaw, cheese, jalapeños and JP's sauce.",
        at: both(15.99),
        image: { src: "/images/food/combos/cropped/burritoCombo.png", alt: "Hot chicken burrito combo" },
      },
      {
        name: "Leg Quarter Combo",
        description: "Chicken thigh and leg, fried and seasoned to your heat level.",
        at: both(15.99),
        image: { src: "/images/food/combos/cropped/legQuarterCombo.png", alt: "Fried chicken leg quarter combo" },
      },
      {
        name: "Breast Quarter Combo",
        description: "Chicken breast quarter, fried and seasoned to your heat level.",
        at: fortCampbellOnly(16.99),
        image: { src: "/images/food/combos/cropped/breastQuarterCombo.png", alt: "Fried chicken breast quarter combo" },
      },
    ],
  },
  {
    id: "chicken",
    title: "Hot Chicken",
    intro: "Pick your heat: Southern, Mild, Hot or Extra Hot.",
    items: [
      {
        name: "Jumbo Tenders (3 pc)",
        at: both(8.99),
        image: { src: "/images/food/entree/jumboTenders.png", alt: "Three jumbo Nashville hot chicken tenders" },
      },
      {
        name: "Wings (6 pc)",
        at: both(9.49),
        image: { src: "/images/food/entree/Wings NonBreaded.jpg", alt: "Six hot chicken wings" },
      },
      {
        name: "Whole Wings (3 pc)",
        at: both(9.49),
        image: { src: "/images/food/entree/wholeWings.jpg", alt: "Three whole Nashville hot wings" },
      },
      { name: "Chicken Bites", at: both(8.99) },
      {
        name: "Chick Mac",
        description: "Chicken, Cajun fries, mac and cheese and JP's sauce.",
        at: both(10.99),
      },
      { name: "Leg Quarter", at: both(8.99) },
      { name: "Breast Quarter", at: fortCampbellOnly(8.99) },
    ],
  },
  {
    id: "sandwiches",
    title: "Sandwiches, Burritos & Waffles",
    items: [
      {
        name: "JP's Hot Chicken Sandwich",
        description: "Fried chicken breast on a bun with pickles, JP's sauce and coleslaw.",
        at: both(8.99),
        image: { src: "/images/food/entree/jpsSandwich.jpg", alt: "JP's Nashville hot chicken sandwich" },
      },
      {
        name: "JP's Chicken Burrito",
        description: "Fried chicken bites, coleslaw, cheese, jalapeños and JP's sauce in a flour tortilla.",
        at: both(8.99),
        image: { src: "/images/food/entree/chickenBurrito.jpg", alt: "Hot chicken burrito" },
      },
      {
        name: "Chicken & Waffles",
        description: "Two fried tenders on a Belgian waffle with powdered sugar and syrup.",
        at: both(8.99),
        image: { src: "/images/food/entree/chickenAndWaffles.jpg", alt: "Nashville hot chicken and waffles" },
      },
      { name: "Hot Chicken Slider", description: "A small-size chicken sandwich.", at: trentonOnly(4.99) },
      { name: "Chicken Biscuit", at: trentonOnly(4.99) },
    ],
  },
  {
    id: "fish",
    title: "Fish",
    items: [
      {
        name: "Fried Catfish (2 pc)",
        description: "Two catfish fillets fried and seasoned to your heat level.",
        at: both(9.49),
        image: { src: "/images/food/entree/catfish.jpg", alt: "Southern fried catfish" },
      },
      {
        name: "Country Catch Fish Sandwich",
        description: "Fried fish sandwich with coleslaw, pickles and JP's sauce.",
        at: trentonOnly(4.99),
      },
    ],
  },
  {
    id: "plates",
    title: "Plates",
    intro: "A main item with one side and a drink.",
    items: [
      { name: "2 Jumbo Tenders Plate", at: trentonOnly(8.99) },
      { name: "Slider Plate", at: trentonOnly(8.99) },
      { name: "Chicken Biscuit Plate", at: trentonOnly(8.99) },
      { name: "Country Catch Fish Sandwich Plate", at: trentonOnly(8.99) },
    ],
  },
  {
    id: "kids",
    title: "Kids Meals",
    items: [
      { name: "Tender Kids Meal", at: both(6.99) },
      { name: "Chicken Bites Kids Meal", at: both(6.99) },
    ],
  },
  {
    id: "sides",
    title: "Sides",
    items: [
      { name: "Fries", at: both(3.99), image: { src: "/images/food/sides/fries.jpg", alt: "Seasoned french fries" } },
      { name: "Cajun Fries", at: both(4.99), image: { src: "/images/food/sides/cajunFries.jpg", alt: "Cajun-seasoned fries" } },
      { name: "Mac and Cheese", at: both(3.99), image: { src: "/images/food/sides/macAndCheese.jpg", alt: "Creamy mac and cheese" } },
      { name: "Coleslaw", at: both(3.99), image: { src: "/images/food/sides/coleslaw.jpg", alt: "Southern coleslaw" } },
      { name: "Baked Beans", at: both(3.99), image: { src: "/images/food/sides/bakedBeans.jpg", alt: "Baked beans" } },
      { name: "Fried Pickles", at: both(3.99), image: { src: "/images/food/sides/friedPickles.jpg", alt: "Fried dill pickles" } },
      { name: "Fried Okra", at: both(3.99), image: { src: "/images/food/sides/friedOkra.jpg", alt: "Southern fried okra" } },
      { name: "Jalapeño Poppers", at: both(3.99), image: { src: "/images/food/sides/JalapenoPoppersNew.jpg", alt: "Jalapeño poppers" } },
      {
        name: "Buttermilk Biscuit",
        at: { clarksville: 1.99, "oak-grove": 2.99 },
        image: { src: "/images/food/sides/biscuit.jpg", alt: "Buttermilk biscuit" },
      },
      { name: "Waffle", at: both(2.99) },
    ],
  },
  {
    id: "sauces",
    title: "Dipping Sauces",
    intro: "Extra dipping sauces are 50¢ at Fort Campbell Blvd.",
    items: [
      { name: "JP's Sauce", at: both(null) },
      { name: "House-made Ranch", at: both(null) },
      { name: "Hot Honey", at: both(null) },
      { name: "Honey Mustard", at: both(null) },
      { name: "Buffalo Sauce", at: both(null) },
      { name: "BBQ Sauce", at: both(null) },
      { name: "Hot Sauce", at: both(null) },
      { name: "Carolina Gold", at: both(null) },
      { name: "Tartar Sauce", at: both(null) },
      { name: "Syrup", at: both(null) },
      { name: "Honey", at: trentonOnly(null) },
      { name: "Lemon Pepper", at: trentonOnly(null) },
      { name: "Ketchup", at: trentonOnly(null) },
      { name: "JP's Sauce, 12 oz bottle", at: fortCampbellOnly(3.99) },
    ],
  },
  {
    id: "drinks",
    title: "Drinks",
    items: [
      { name: "Sweet Tea", at: both(2.99) },
      { name: "Coke", at: both(2.99) },
      { name: "Diet Coke", at: both(2.99) },
      { name: "Sprite", at: both(2.99) },
      { name: "Coke Zero", at: trentonOnly(2.99) },
      { name: "Lemonade", at: trentonOnly(2.99) },
      { name: "Fanta", at: trentonOnly(2.99) },
      { name: "Powerade", at: trentonOnly(2.99) },
      { name: "Mr. Pibb", at: trentonOnly(2.99) },
      { name: "Dr Pepper", at: fortCampbellOnly(2.99) },
    ],
  },
  {
    id: "desserts",
    title: "Desserts",
    items: [
      { name: "Banana Pudding", at: both(4.49) },
      { name: "Chocolate Pie", at: trentonOnly(4.49) },
      { name: "Turtle Pie", at: trentonOnly(4.49) },
      { name: "Cookies and Cream Pie", at: trentonOnly(4.49) },
      { name: "Cheesecake", at: trentonOnly(4.49) },
      { name: "Pie", at: fortCampbellOnly(4.49) },
      { name: "Brownies", at: fortCampbellOnly(3.99) },
    ],
  },
  {
    id: "buckets",
    title: "Buckets",
    intro: "For sharing.",
    items: [
      { name: "12 Jumbo Tender Bucket", at: both(35.99) },
      { name: "12 Wings Bucket", at: both(18.99) },
      { name: "12 Whole Wings Bucket", at: both(37.89) },
      { name: "24 Wings Bucket", at: fortCampbellOnly(36.49) },
    ],
  },
  {
    id: "catering",
    title: "Catering Trays",
    intro: "Order catering trays online from our Fort Campbell Blvd store.",
    items: [
      {
        name: "25 Tenders Tray",
        description: "25 tenders seasoned how you like them. Feeds 10–12. Twelve dipping sauces to choose from.",
        at: fortCampbellOnly(64.99),
      },
      {
        name: "50 Wings Tray",
        description: "50 wings seasoned and sauced how you like them. Feeds 10–12. Twelve dipping sauces to choose from.",
        at: fortCampbellOnly(75.99),
      },
      { name: "Fries Tray", description: "Feeds 8–10.", at: fortCampbellOnly(27.99) },
      { name: "Cajun Fries Tray", description: "Feeds 8–10.", at: fortCampbellOnly(29.99) },
      { name: "Mac and Cheese Tray", description: "Feeds 8–10.", at: fortCampbellOnly(27.99) },
      { name: "Baked Beans Tray", description: "Feeds 8–10.", at: fortCampbellOnly(27.99) },
    ],
  },
];
