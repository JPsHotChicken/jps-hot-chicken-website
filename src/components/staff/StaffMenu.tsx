"use client";

import { useEffect, useRef } from "react";
import {
  CalendarRange,
  FileText,
  House,
  LogOut,
  ScrollText,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { staffLogout } from "@/app/staff/actions";
import { STAFF_VIEWS, STAFF_VIEW_LABELS, type StaffView } from "@/lib/staff-views";

const ICONS: Record<StaffView, React.ReactNode> = {
  home: <House className="size-4" />,
  schedule: <CalendarRange className="size-4" />,
  payStubs: <FileText className="size-4" />,
  rules: <ScrollText className="size-4" />,
};

type Props = {
  open: boolean;
  view: StaffView;
  onOpenChange: (open: boolean) => void;
  onSelect: (view: StaffView) => void;
};

/**
 * The slide-out menu on `/staff`. Always mounted and slid with a transform, the
 * same way the admin drawer is, so it animates both in and out.
 */
export function StaffMenu({ open, view, onOpenChange, onSelect }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  return (
    <>
      <div
        aria-hidden
        onClick={() => onOpenChange(false)}
        className={`fixed inset-0 z-40 bg-foreground/20 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        aria-hidden={!open}
        tabIndex={-1}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-background shadow-xl transition-transform duration-200 ease-out outline-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="mr-auto font-heading text-base font-bold">Menu</h2>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close menu"
            onClick={() => onOpenChange(false)}
            tabIndex={open ? 0 : -1}
          >
            <X />
          </Button>
        </header>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {STAFF_VIEWS.map((item) => {
            const active = item === view;
            return (
              <button
                key={item}
                type="button"
                aria-current={active ? "page" : undefined}
                tabIndex={open ? 0 : -1}
                onClick={() => {
                  onSelect(item);
                  onOpenChange(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-base font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                  active ? "bg-brand/10 text-brand" : "hover:bg-muted"
                }`}
              >
                <span className={active ? "text-brand" : "text-muted-foreground"}>
                  {ICONS[item]}
                </span>
                {STAFF_VIEW_LABELS[item]}
              </button>
            );
          })}
        </nav>

        <form action={staffLogout} className="border-t border-border p-3">
          <button
            type="submit"
            tabIndex={open ? 0 : -1}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-base font-semibold text-muted-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
