import {
  MAX_TASTE_SCORE,
  TASTE_DIMENSIONS,
  capitalise,
  type TasteProfile,
} from "@/lib/menu-descriptions";

/** The nine taste scores as short segmented bars, 0 to 5. */
export function TasteProfileChart({ profile }: { profile: TasteProfile }) {
  return (
    <dl className="space-y-1.5">
      {TASTE_DIMENSIONS.map((dimension) => {
        const score = profile[dimension];
        return (
          <div key={dimension} className="grid grid-cols-[4.5rem_1fr_1.25rem] items-center gap-2 text-sm">
            <dt className="text-muted-foreground">{capitalise(dimension)}</dt>
            <dd aria-hidden className="flex gap-0.5">
              {Array.from({ length: MAX_TASTE_SCORE }, (_, index) => (
                <span
                  key={index}
                  className={`h-2.5 flex-1 first:rounded-l-sm last:rounded-r-sm ${
                    index < score ? "bg-brand" : "bg-muted"
                  }`}
                />
              ))}
            </dd>
            <dd className="text-right text-xs font-semibold tabular-nums">
              {score}
              <span className="sr-only"> out of {MAX_TASTE_SCORE}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
