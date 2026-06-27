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
};

export const jobs: Job[] = [
  {
    id: "team-member",
    title: "Hot Chicken Team Member",
    location: "Clarksville, TN & Oak Grove, KY",
    employmentType: "Full-time / Part-time",
    payMin: 13,
    payMax: 16,
    hours: "15–40 hrs/week · flexible day, evening & weekend shifts",
    summary:
      "The heart of the line — breading, frying, building plates, and keeping guests happy. No experience needed; we'll train you on everything.",
    responsibilities: [
      "Prep, bread, and fry chicken to order",
      "Build sandwiches, tenders, and combos accurately",
      "Keep your station clean and stocked",
      "Greet guests and help with orders at the counter",
    ],
    requirements: [
      "16 or older",
      "Reliable and on time",
      "Able to stand and move for a full shift",
      "Friendly, team-first attitude",
    ],
  },
  {
    id: "cashier",
    title: "Front Counter / Cashier",
    location: "Clarksville, TN & Oak Grove, KY",
    employmentType: "Part-time",
    payMin: 13,
    payMax: 15,
    hours: "12–30 hrs/week · flexible shifts",
    summary:
      "Be the first smile guests see — take orders, handle payments, and make sure every order goes out right.",
    responsibilities: [
      "Take orders and process payments accurately",
      "Answer questions about the menu and heat levels",
      "Keep the front counter and dining area clean",
      "Help package pickup and delivery orders",
    ],
    requirements: [
      "16 or older",
      "Comfortable with a POS / register",
      "Clear, friendly communication",
      "Dependable schedule",
    ],
  },
  {
    id: "shift-lead",
    title: "Shift Lead",
    location: "Clarksville, TN",
    employmentType: "Full-time",
    payMin: 16,
    payMax: 19,
    hours: "30–40 hrs/week · opening or closing shifts",
    summary:
      "Run the floor — coach the team, hit quality and speed targets, and keep shifts running smoothly. A clear path toward management.",
    responsibilities: [
      "Lead and motivate the team during your shift",
      "Open or close the restaurant and handle cash",
      "Uphold food-safety and quality standards",
      "Step in on any station when it gets busy",
    ],
    requirements: [
      "18 or older",
      "1+ year in food service or retail",
      "Some leadership or keyholder experience",
      "Calm under pressure",
    ],
  },
];
