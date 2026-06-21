import type { MenuSection as MenuSectionType, MenuItem } from "@/data/menu";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const TAG_LABELS: Record<NonNullable<MenuItem["tags"]>[number], string> = {
  vegetarian: "Vegetarian",
  "gluten-free": "Gluten-Free",
  spicy: "Spicy",
};

const TAG_STYLES: Record<NonNullable<MenuItem["tags"]>[number], string> = {
  vegetarian: "bg-green-100 text-green-800",
  "gluten-free": "bg-sky-100 text-sky-800",
  spicy: "bg-brand/10 text-brand",
};

function DietaryTag({ tag }: { tag: NonNullable<MenuItem["tags"]>[number] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TAG_STYLES[tag],
      )}
    >
      {tag === "spicy" ? "🔥 " : ""}
      {TAG_LABELS[tag]}
    </span>
  );
}

export function MenuSection({ section }: { section: MenuSectionType }) {
  return (
    <section aria-labelledby={`section-${slug(section.title)}`} className="scroll-mt-24">
      <header className="border-b-2 border-brand/20 pb-3">
        <h2
          id={`section-${slug(section.title)}`}
          className="text-2xl font-bold uppercase tracking-tight sm:text-3xl"
        >
          {section.title}
        </h2>
        {section.description && (
          <p className="mt-1 text-base text-muted-foreground">{section.description}</p>
        )}
      </header>

      <ul className="mt-6 divide-y divide-border">
        {section.items.map((item) => (
          <li key={item.name} className="py-5">
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-lg font-semibold text-foreground">{item.name}</h3>
              <span
                aria-label={`Price: ${formatPrice(item.price)}`}
                className="shrink-0 font-heading text-lg font-semibold text-brand"
              >
                {formatPrice(item.price)}
              </span>
            </div>
            <p className="mt-1 text-base text-muted-foreground">{item.description}</p>
            {item.tags && item.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <DietaryTag key={tag} tag={tag} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
