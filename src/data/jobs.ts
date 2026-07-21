// Open roles, as structured data. Add or edit jobs here — the careers page and
// the application form read from this file, no code changes needed.
//
// Pay ranges are shown publicly (pay transparency). Keep them accurate.

export type Job = {
  /** URL-safe id used to deep-link the application form (?role=<id>). */
  id: string;
  title: string;
  /** Where the role is based. */
  location: string;
  employmentType: "Full-time" | "Part-time" | "Full-time / Part-time";
  /** Hourly pay range, in whole dollars. */
  payMin: number;
  payMax: number;
  /** Typical weekly hours / scheduling note. */
  hours: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  /** Card image for this role. Path under /public; alt describes the scene. */
  image?: { src: string; alt: string };
  /**
   * Whether we're actively hiring for this role. `false` shows the card grayed
   * out with the Apply button disabled — flip to `true` when the position opens.
   */
  available: boolean;
};

export const jobs: Job[] = [
  {
    id: "Kitchen Staff",
    title: "Kitchen Staff",
    location: "Clarksville, TN & Oak Grove, KY",
    employmentType: "Full-time / Part-time",
    payMin: 13,
    payMax: 16,
    hours: "15–40 hrs/week · flexible shifts",
    summary:
      "Job consists mainly of working the line — seasoning, sides, and building plates.",
    responsibilities: [
      "Prepare orders",
      "Build sandwiches, tenders, and combos accurately",
      "Keep your station clean and stocked",
      "Greet guests and help with orders at the counter",
    ],
    requirements: [
      "16 or older",
      "Reliable and on time",
      "Able to stand and move for a full shift",
      "Friendly, team first attitude",
    ],
    image: {
      src: "/images/kitchenStaff.png",
      alt: "JP's Hot Chicken kitchen staff working the line",
    },
    available: true,
  },
  {
    id: "Front Staff",
    title: "Front Counter Staff",
    location: "Clarksville, TN & Oak Grove, KY",
    employmentType: "Full-time / Part-time",
    payMin: 13,
    payMax: 15,
    hours: "12–30 hrs/week · flexible shifts",
    summary:
      "Represent JPs to the customers. Take orders, handle payments, and make sure every guest is taken care of.",
    responsibilities: [
      "Take orders and process payments accurately",
      "Keep the front counter and dining area clean",
      "Answer questions about the menu and heat levels",
      "Help package pickup and delivery orders",
    ],
    requirements: [
      "16 or older",
      "Comfortable with a POS / register",
      "Clear, friendly communication",
      "Dependable schedule",
    ],
    image: {
      src: "/images/frontStaff.png",
      alt: "JP's Hot Chicken front counter staff serving guests",
    },
    available: true,
  },
  // Not hiring yet — cards show grayed out. Flip `available` to true to open them.
  {
    id: "Fryer Station",
    title: "Fryer Station",
    location: "Clarksville, TN & Oak Grove, KY",
    employmentType: "Full-time / Part-time",
    payMin: 13,
    payMax: 16,
    hours: "15–40 hrs/week · flexible shifts",
    summary:
      "Operate the fryers. Bread, drop, and time the chicken perfectly.",
    responsibilities: [
      "Bread, drop, and time chicken to temperature",
      "Monitor oil quality and fryer temperatures",
      "Keep the fryer station clean, stocked, and safe",
      "Time orders with the line to keep orders moving",
    ],
    requirements: [
      "16 or older",
      "Comfortable working around hot oil and equipment",
      "Able to stand and move for a full shift",
      "Reliable and safety-minded",
    ],
    image: {
      src: "/images/fryerStation.png",
      alt: "JP's Hot Chicken fryer station",
    },
    available: false,
  },
  {
    id: "Kitchen Back Prep",
    title: "Kitchen Back Prep",
    location: "Clarksville, TN & Oak Grove, KY",
    employmentType: "Full-time / Part-time",
    payMin: 13,
    payMax: 15,
    hours: "15–40 hrs/week · flexible shifts",
    summary:
      "Keep the kitchen running. Prep sides, sauces, and ingredients so every station stays stocked and ready.",
    responsibilities: [
      "Prep sides, sauces, and toppings for service",
      "Portion and label ingredients",
      "Restock stations and rotate stock (first in, first out)",
      "Keep prep areas clean and sanitized",
    ],
    requirements: [
      "16 or older",
      "Attention to detail and consistency",
      "Able to stand and move for a full shift",
      "Dependable schedule",
    ],
    image: {
      src: "/images/backKitchenPrep.png",
      alt: "JP's Hot Chicken back-of-house kitchen prep",
    },
    available: false,
  },
  {
    id: "Cleaning",
    title: "Cleaning",
    location: "Clarksville, TN & Oak Grove, KY",
    employmentType: "Full-time / Part-time",
    payMin: 13,
    payMax: 15,
    hours: "12–30 hrs/week · flexible shifts",
    summary:
      "Keep JP's spotless. Dishes, floors, restrooms, and the dining area, so guests and the team always have a clean space.",
    responsibilities: [
      "Wash dishes and keep the dish pit moving",
      "Clean and sanitize the dining area and restrooms",
      "Sweep, mop, and take out trash",
      "Help close down and deep-clean stations",
    ],
    requirements: [
      "16 or older",
      "Reliable and on time",
      "Able to stand and move for a full shift",
      "Takes pride in a clean space",
    ],
    image: {
      src: "/images/cleaningStaff.png",
      alt: "JP's Hot Chicken cleaning staff keeping the space tidy",
    },
    available: false,
  },
];
