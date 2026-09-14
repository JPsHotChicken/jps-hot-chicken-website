"use client";

import { LABEL_CLASS } from "@/components/admin/field";

/**
 * A multi-select drawn as a row of chips. The chosen values come back in the
 * vocabulary's own order, whatever order they were clicked in.
 */
export function TagToggles<T extends string>({
  legend,
  options,
  value,
  onChange,
  tone,
}: {
  legend: string;
  options: readonly T[];
  value: readonly string[];
  onChange: (value: T[]) => void;
  tone?: "allergen";
}) {
  const chosen = new Set<string>(value);
  const on =
    tone === "allergen"
      ? "border-amber-400 bg-amber-100 text-amber-950"
      : "border-brand bg-brand/10 text-foreground";

  return (
    <fieldset>
      <legend className={LABEL_CLASS}>{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = chosen.has(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onChange(
                  options.filter((candidate) =>
                    candidate === option ? !selected : chosen.has(candidate),
                  ),
                )
              }
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                selected ? on : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
