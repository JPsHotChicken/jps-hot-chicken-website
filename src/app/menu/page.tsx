import type { Metadata } from "next";

import { siteConfig } from "@/data/site";
import { menu } from "@/data/menu";
import { MenuSection } from "@/components/MenuSection";
import { OrderButton } from "@/components/OrderButton";

export const metadata: Metadata = {
  title: "Menu",
  description:
    "The full JP's Hot Chicken menu — hand-breaded tenders, sandwiches, and plates dialed from mild to cluckin' hot, plus Southern sides, sweets, and drinks.",
  alternates: { canonical: "/menu" },
};

export default function MenuPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="text-center">
        <p className="font-heading text-sm font-semibold uppercase tracking-[0.3em] text-brand">
          {siteConfig.name}
        </p>
        <h1 className="mt-2 text-4xl font-extrabold uppercase tracking-tight sm:text-5xl">
          The Menu
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-muted-foreground">
          Everything is hand-breaded and fried to order. Choose your heat:
          Southern, Mild, Medium, Hot, or Cluckin&apos; Hot 🔥
        </p>
        <div className="mt-6 flex justify-center">
          <OrderButton size="lg" />
        </div>
      </header>

      <div className="mt-14 space-y-14">
        {menu.map((section) => (
          <MenuSection key={section.title} section={section} />
        ))}
      </div>

      <div className="mt-16 rounded-2xl bg-muted/50 p-8 text-center">
        <h2 className="text-2xl font-bold uppercase tracking-tight">Ready to dig in?</h2>
        <p className="mx-auto mt-2 max-w-md text-base text-muted-foreground">
          Order online for pickup through our ordering partner.
        </p>
        <div className="mt-5 flex justify-center">
          <OrderButton size="lg" />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Prices and availability may change. Heat levels chosen at checkout.
        </p>
      </div>
    </div>
  );
}
