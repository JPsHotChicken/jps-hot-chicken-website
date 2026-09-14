import { History } from "lucide-react";

/** Marks a description written before something in its recipe changed. */
export function StaleBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.7rem] font-semibold text-amber-900"
      title="Something in this recipe changed after its description was written"
    >
      <History className="size-3" />
      Out of date
    </span>
  );
}
