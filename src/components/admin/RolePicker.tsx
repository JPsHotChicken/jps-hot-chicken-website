"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Settings2, X } from "lucide-react";

import { roleColorClasses } from "@/lib/role-colors";
import {
  DAY_LABELS,
  formatRange,
  type DayKey,
  type Employee,
  type ShiftRange,
  type ShiftRole,
} from "@/lib/schedule";

type Props = {
  /** The cell that was clicked — the popup is anchored to it. */
  anchorEl: HTMLElement;
  employee: Employee;
  day: DayKey;
  /** The whole shift the clicked cell belongs to. */
  range: ShiftRange;
  roles: ShiftRole[];
  /** The role the shift has now, or `null`. */
  selectedId: string | null;
  onSelect: (roleId: string | null) => void;
  onManageRoles: () => void;
  onClose: () => void;
};

const POPUP_WIDTH = 240;

/**
 * Pick a role for one person's shift. Opens when a name on the grid is clicked,
 * and is positioned the same way as the employee picker, so it tracks the cell
 * as the day scrolls.
 */
export function RolePicker({
  anchorEl,
  employee,
  day,
  range,
  roles,
  selectedId,
  onSelect,
  onManageRoles,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => {
    const rect = anchorEl.getBoundingClientRect();
    return { top: rect.bottom + 4, left: rect.left };
  });

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
      aria-label={`Role for ${employee.name}`}
      style={{ top: position.top, left: position.left, width: POPUP_WIDTH }}
      className="fixed z-50 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
    >
      <div className="border-b border-border px-2 py-1.5">
        <p className="truncate text-sm font-semibold">{employee.name}</p>
        <p className="text-xs text-muted-foreground">
          {DAY_LABELS[day]} · {formatRange(range)}
        </p>
      </div>

      <p className="px-2 pt-2 pb-1 text-[0.65rem] font-bold tracking-widest text-muted-foreground uppercase">
        Role this shift
      </p>

      <button
        type="button"
        onClick={() => onSelect(null)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
      >
        <X className="size-3.5" />
        No role
        {selectedId === null && <Check className="ml-auto size-3.5" />}
      </button>

      {roles.map((role) => (
        <button
          key={role.id}
          type="button"
          onClick={() => onSelect(role.id)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
        >
          <span
            aria-hidden
            className={`size-2.5 shrink-0 rounded-full ${roleColorClasses(role.color).dot}`}
          />
          <span className="truncate">{role.name}</span>
          {selectedId === role.id && <Check className="ml-auto size-3.5 shrink-0" />}
        </button>
      ))}

      {roles.length === 0 && (
        <p className="px-2 py-2 text-xs text-muted-foreground">No roles yet.</p>
      )}

      <button
        type="button"
        onClick={onManageRoles}
        className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-border px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
      >
        <Settings2 className="size-3.5" />
        {roles.length === 0 ? "Create a role…" : "Manage roles…"}
      </button>
    </div>
  );
}
