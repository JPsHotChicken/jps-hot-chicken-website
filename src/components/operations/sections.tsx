import { Banknote, Database } from "lucide-react";

/**
 * The sections of the operations area — the tools the crew uses to run a shift.
 *
 * The hub at `/operations` is built from this list, so adding a section is a
 * matter of building its page and listing it here. `ready: false` keeps a
 * section visible but marked as unfinished, which is how one gets announced to
 * the team before it does anything.
 */
export type OperationsSection = {
  slug: string;
  label: string;
  /** One line on the hub card: what the section is for. */
  hint: string;
  icon: React.ReactNode;
  ready: boolean;
};

export const OPERATIONS_SECTIONS: OperationsSection[] = [
  {
    slug: "cash-drawer",
    label: "Cash drawer counting",
    hint: "Count the drawer down, set the till, work out the drop",
    icon: <Banknote className="size-5" />,
    ready: true,
  },
  {
    slug: "items",
    label: "Items database",
    hint: "Look up any item, its cost, and what it is made of",
    icon: <Database className="size-5" />,
    ready: true,
  },
];

export const operationsHref = (slug: string) => `/operations/${slug}`;

export const findSection = (slug: string) =>
  OPERATIONS_SECTIONS.find((section) => section.slug === slug);
