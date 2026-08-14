"use client";

import { useEffect, useRef } from "react";
import { CalendarRange, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export type AdminView = "scheduler" | "staff";

const TABS: { view: AdminView; label: string; icon: React.ReactNode; hint: string }[] = [
  {
    view: "scheduler",
    label: "Schedule maker",
    icon: <CalendarRange className="size-4" />,
    hint: "Build and publish the week",
  },
  {
    view: "staff",
    label: "Staff management",
    icon: <Users className="size-4" />,
    hint: "Sign-in codes for your team",
  },
];

type Props = {
  open: boolean;
  view: AdminView;
  onOpenChange: (open: boolean) => void;
  onSelect: (view: AdminView) => void;
};

/**
 * The slide-out navigation between the two halves of the dashboard.
 *
 * The panel is always mounted and moved with a transform rather than being added
 * and removed, so it can animate both ways — a panel that only exists while open
 * has nothing to animate out from. `pointer-events-none` while closed keeps it
 * from swallowing clicks on the toolbar behind it.
 */
export function AdminDrawer({ open, view, onOpenChange, onSelect }: Props) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    // Move focus in, so the drawer is reachable from the keyboard immediately.
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
        aria-label="Dashboard sections"
        aria-hidden={!open}
        tabIndex={-1}
        // A quarter of the viewport, with a floor so it stays usable on a phone
        // where a true quarter would be under 100px.
        className={`fixed inset-y-0 left-0 z-50 flex w-1/4 min-w-64 flex-col border-r border-border bg-background shadow-xl transition-transform duration-200 ease-out outline-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="mr-auto font-heading text-base font-bold">Dashboard</h2>
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

        <nav className="flex-1 space-y-1 p-3">
          {TABS.map((tab) => {
            const active = tab.view === view;
            return (
              <button
                key={tab.view}
                type="button"
                aria-current={active ? "page" : undefined}
                tabIndex={open ? 0 : -1}
                onClick={() => {
                  onSelect(tab.view);
                  onOpenChange(false);
                }}
                className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                  active ? "bg-brand/10 text-brand" : "hover:bg-muted"
                }`}
              >
                <span className={`mt-0.5 ${active ? "text-brand" : "text-muted-foreground"}`}>
                  {tab.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{tab.label}</span>
                  <span className="block text-xs text-muted-foreground">{tab.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
