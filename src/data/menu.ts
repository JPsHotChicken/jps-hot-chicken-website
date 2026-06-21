// The menu as typed data. Edit this file to update the menu — the UI reads from it.
// Prices are plain numbers; format to currency in the UI, not here.
//
// Heat is chosen in person / at the ordering site. Items that are spicy by
// default carry the "spicy" tag. Heat levels offered, mild → hot:
//   Southern (no heat) · Mild · Medium · Hot · Cluckin' Hot 🔥

export type MenuItem = {
  name: string;
  description: string;
  price: number;
  tags?: ("vegetarian" | "gluten-free" | "spicy")[];
};

export type MenuSection = {
  title: string;
  description?: string;
  items: MenuItem[];
};

export const menu: MenuSection[] = [
  {
    title: "Hot Chicken",
    description: "Hand-breaded, fried to order, and dialed to your heat.",
    items: [
      {
        name: "The Classic Sandwich",
        description:
          "Fried chicken breast, dill pickles, slaw, and comeback sauce on a toasted brioche bun.",
        price: 11,
        tags: ["spicy"],
      },
      {
        name: "Tender Box (3 pc)",
        description:
          "Three jumbo hand-breaded tenders with Texas toast, pickles, and a side of ranch.",
        price: 12,
        tags: ["spicy"],
      },
      {
        name: "Tender Box (5 pc)",
        description:
          "Five jumbo hand-breaded tenders, Texas toast, pickles, and two house dipping sauces.",
        price: 16,
        tags: ["spicy"],
      },
      {
        name: "Quarter Bird Plate",
        description:
          "Bone-in dark or white meat over Texas toast with pickles and your choice of side.",
        price: 14,
        tags: ["spicy"],
      },
      {
        name: "Loaded Hot Chicken Fries",
        description:
          "Crispy fries piled with chopped hot chicken, comeback sauce, slaw, and pickles.",
        price: 13,
        tags: ["spicy"],
      },
    ],
  },
  {
    title: "Sides",
    description: "Southern classics, made fresh daily.",
    items: [
      {
        name: "Crinkle-Cut Fries",
        description: "Golden, seasoned, and built for dipping.",
        price: 4,
        tags: ["vegetarian"],
      },
      {
        name: "Creamy Coleslaw",
        description: "Cool, crunchy, and the perfect counter to the heat.",
        price: 4,
        tags: ["vegetarian", "gluten-free"],
      },
      {
        name: "Mac & Cheese",
        description: "Three-cheese blend baked until bubbling.",
        price: 5,
        tags: ["vegetarian"],
      },
      {
        name: "Baked Beans",
        description: "Slow-cooked with brown sugar and a smoky finish.",
        price: 4,
        tags: ["gluten-free"],
      },
      {
        name: "Fried Pickles",
        description: "Hand-battered dill chips with a side of ranch.",
        price: 6,
        tags: ["vegetarian"],
      },
    ],
  },
  {
    title: "Sweets & Drinks",
    description: "Cool it down or finish it off.",
    items: [
      {
        name: "Banana Pudding",
        description: "Layered vanilla wafers, fresh banana, and whipped cream.",
        price: 5,
        tags: ["vegetarian"],
      },
      {
        name: "Sweet Tea",
        description: "Brewed daily, Southern sweet.",
        price: 3,
        tags: ["vegetarian", "gluten-free"],
      },
      {
        name: "Fresh Lemonade",
        description: "Hand-squeezed and lightly tart.",
        price: 3,
        tags: ["vegetarian", "gluten-free"],
      },
      {
        name: "Fountain Soda",
        description: "Free refills, dine-in.",
        price: 3,
        tags: ["vegetarian", "gluten-free"],
      },
    ],
  },
];
