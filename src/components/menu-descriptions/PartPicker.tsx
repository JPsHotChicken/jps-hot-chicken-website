"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { FIELD_CLASS } from "@/components/admin/field";

export type PartOption = {
  kind: "item" | "recipe";
  id: string;
  name: string;
  /** An item's code, so the catalogue and the recipe read the same way. */
  code?: string;
  /** A second line of context: an item's category, or "Menu item". */
  detail: string;
};

export type PartValue = { kind: "item" | "recipe"; id: string } | null;

const GROUPS = [
  { kind: "item", label: "Items" },
  { kind: "recipe", label: "Recipes" },
] as const;

/**
 * A searchable dropdown over the catalogue and the recipes together, grouped.
 *
 * Built on a plain input rather than a `<select>` because a few dozen items are
 * unusable without typing to filter. Follows the ARIA combobox pattern: arrows
 * move, Enter picks, Escape puts the box back as it was.
 */
export function PartPicker({
  options,
  value,
  onChange,
  label,
}: {
  options: PartOption[];
  value: PartValue;
  onChange: (value: PartValue) => void;
  label: string;
}) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = value
    ? options.find((option) => option.kind === value.kind && option.id === value.id)
    : undefined;

  // Grouped for display, flattened for keyboard movement — one index covers both.
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Codes match too: somebody reading off a case label types RAW-0011.
    const found = needle
      ? options.filter((option) =>
          `${option.name} ${option.code ?? ""}`.toLowerCase().includes(needle),
        )
      : options;
    return GROUPS.flatMap((group) => found.filter((option) => option.kind === group.kind));
  }, [options, query]);

  const optionId = (index: number) => `${listId}-${index}`;

  const choose = (option: PartOption) => {
    onChange({ kind: option.kind, id: option.id });
    setOpen(false);
    setQuery("");
  };

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  const scrollTo = (index: number) =>
    document.getElementById(optionId(index))?.scrollIntoView({ block: "nearest" });

  return (
    <div className="relative">
      <input
        ref={input}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? optionId(active) : undefined}
        value={open ? query : (selected?.name ?? "")}
        placeholder={selected ? selected.name : "Choose an item or recipe…"}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onBlur={close}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) return setOpen(true);
            if (matches.length === 0) return;
            const step = event.key === "ArrowDown" ? 1 : -1;
            const next = (active + step + matches.length) % matches.length;
            setActive(next);
            scrollTo(next);
          } else if (event.key === "Enter") {
            if (open && matches[active]) {
              event.preventDefault();
              choose(matches[active]);
            }
          } else if (event.key === "Escape") {
            if (open) {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }
        }}
        // While searching, the current choice shows faintly as the placeholder.
        className={`${FIELD_CLASS} ${selected?.kind === "recipe" && !open ? "pr-24" : "pr-8"} ${
          selected ? "placeholder:text-foreground/50" : "placeholder:text-muted-foreground"
        }`}
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      {selected?.kind === "recipe" && !open && (
        <span className="pointer-events-none absolute top-1/2 right-8 -translate-y-1/2 rounded bg-brand/10 px-1.5 py-0.5 text-[0.65rem] font-semibold text-brand">
          Recipe
        </span>
      )}

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          // Keeps focus in the input when an option is clicked, so the blur
          // that closes the list doesn't fire before the click lands.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 min-w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {matches.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">Nothing matches “{query.trim()}”.</p>
          ) : (
            GROUPS.map((group) => {
              const members = matches
                .map((option, index) => ({ option, index }))
                .filter(({ option }) => option.kind === group.kind);
              if (members.length === 0) return null;
              return (
                <div key={group.kind} role="group" aria-labelledby={`${listId}-${group.kind}`}>
                  <p
                    id={`${listId}-${group.kind}`}
                    className="px-2 pt-2 pb-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    {group.label}
                  </p>
                  {members.map(({ option, index }) => {
                    const isSelected = selected?.kind === option.kind && selected.id === option.id;
                    return (
                      <div
                        key={`${option.kind}-${option.id}`}
                        id={optionId(index)}
                        role="option"
                        aria-selected={isSelected}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(option)}
                        className={`flex cursor-pointer items-baseline gap-2 rounded-md px-2 py-1.5 text-sm ${
                          index === active ? "bg-muted" : ""
                        } ${isSelected ? "font-semibold" : ""}`}
                      >
                        {option.code && (
                          <code className="shrink-0 font-mono text-[0.7rem] text-muted-foreground">
                            {option.code}
                          </code>
                        )}
                        <span className="min-w-0 flex-1 truncate">{option.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{option.detail}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
