"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";

import {
  SHIFT_GROUPS,
  SHIFT_GROUP_LABELS,
  employeesByGroup,
  type Employee,
} from "@/lib/schedule";

type Props = {
  /** The cell being edited — the popup is anchored to this element. */
  anchorEl: HTMLElement;
  employees: Employee[];
  selectedId: string | null;
  onSelect: (employeeId: string | null) => void;
  onClose: () => void;
};

const POPUP_WIDTH = 232;

/**
 * The employee picker that opens when a schedule cell is double-clicked.
 * Positioned `fixed` against the cell so it escapes the grid's horizontal
 * scroll container, and re-anchored on scroll so it tracks the cell rather
 * than being left stranded.
 */
export function CellEditor({ anchorEl, employees, selectedId, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => {
    const rect = anchorEl.getBoundingClientRect();
    return { top: rect.bottom + 4, left: rect.left };
  });
  const grouped = employeesByGroup(employees);

  // Flip above / nudge inward when the popup would overflow the viewport.
  const reposition = useCallback(() => {
    const rect = anchorEl.getBoundingClientRect();
    const height = ref.current?.offsetHeight ?? 0;
    const top =
      rect.bottom + height + 8 > window.innerHeight && rect.top - height - 4 > 0
        ? rect.top - height - 4
        : rect.bottom + 4;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPUP_WIDTH - 8));
    setPosition({ top, left });
  }, [anchorEl]);

  useLayoutEffect(reposition, [reposition]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    // Capture phase so scrolling the day's own container counts too.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [onClose, reposition]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Assign employee"
      style={{ top: position.top, left: position.left, width: POPUP_WIDTH }}
      className="fixed z-50 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
      >
        <X className="size-3.5" />
        Clear this hour
        {selectedId === null && <Check className="ml-auto size-3.5" />}
      </button>

      {employees.length === 0 && (
        <p className="px-2 py-3 text-xs text-muted-foreground">
          No employees yet — add some in the panel on the right.
        </p>
      )}

      {SHIFT_GROUPS.map((group) =>
        grouped[group].length === 0 ? null : (
          <div key={group} className="mt-1">
            <p className="px-2 py-1 text-[0.65rem] font-bold tracking-widest text-muted-foreground uppercase">
              {SHIFT_GROUP_LABELS[group]}
            </p>
            {grouped[group].map((employee) => (
              <button
                key={employee.id}
                type="button"
                onClick={() => onSelect(employee.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="truncate">{employee.name}</span>
                {selectedId === employee.id && <Check className="ml-auto size-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        ),
      )}
    </div>
  );
}
