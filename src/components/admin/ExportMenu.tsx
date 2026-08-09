"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Download, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ExportScope } from "@/lib/schedule-pdf";
import {
  SHIFT_GROUPS,
  SHIFT_GROUP_LABELS,
  employeesByGroup,
  type Employee,
} from "@/lib/schedule";

type Props = {
  employees: Employee[];
  exporting: boolean;
  onExport: (scope: ExportScope) => void;
};

/**
 * Split button: the main half downloads the whole week as a zip (the schedule
 * sheet plus a PDF per person), the caret opens narrower choices — just the
 * sheet, or just one person's hours, as a single PDF.
 */
export function ExportMenu({ employees, exporting, onExport }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const grouped = employeesByGroup(employees);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const choose = (scope: ExportScope) => {
    setOpen(false);
    onExport(scope);
  };

  return (
    <div ref={ref} className="relative flex">
      <Button
        onClick={() => onExport({ kind: "all" })}
        disabled={exporting}
        className="rounded-r-none"
      >
        <Download data-icon="inline-start" />
        {exporting ? "Exporting…" : "Export PDF"}
      </Button>
      <Button
        onClick={() => setOpen((current) => !current)}
        disabled={exporting}
        aria-label="Other export options"
        aria-expanded={open}
        aria-haspopup="menu"
        className="ml-px rounded-l-none px-1.5"
      >
        <ChevronDown />
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-1.5 max-h-96 w-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => choose({ kind: "week" })}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
          >
            <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
            Schedule sheet only
          </button>

          {employees.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              Add employees to export an individual sheet.
            </p>
          ) : (
            <>
              <p className="mt-1 flex items-center gap-2 border-t border-border px-2 pt-2 pb-1 text-[0.65rem] font-bold tracking-widest text-muted-foreground uppercase">
                <User className="size-3" />
                One person only
              </p>
              {SHIFT_GROUPS.map((group) =>
                grouped[group].length === 0 ? null : (
                  <div key={group}>
                    <p className="px-2 py-1 text-[0.65rem] font-semibold tracking-wide text-muted-foreground/70 uppercase">
                      {SHIFT_GROUP_LABELS[group]}
                    </p>
                    {grouped[group].map((employee) => (
                      <button
                        key={employee.id}
                        type="button"
                        role="menuitem"
                        onClick={() => choose({ kind: "employee", employeeId: employee.id })}
                        className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span className="truncate">{employee.name}</span>
                      </button>
                    ))}
                  </div>
                ),
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
