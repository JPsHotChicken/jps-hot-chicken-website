/**
 * The one text-field look the truck order screens share.
 *
 * There is no `ui/input` component in this project — the scheduler styles its
 * handful of inputs inline. That works for a handful; the order sheet, the item
 * form and the importer between them have too many for copies of the same
 * string to stay in step.
 */
export const FIELD_CLASS =
  "w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none " +
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 " +
  "aria-[invalid=true]:border-destructive";

/** The label above one. */
export const LABEL_CLASS = "block text-xs font-semibold text-muted-foreground";
