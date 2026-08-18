"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { CalendarRange, ClipboardList, HandCoins, Truck, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export type AdminView = "scheduler" | "staff" | "truck" | "tips" | "applications";

/** The two halves of `/admin`, which switch in place rather than navigating. */
export type SchedulerView = Extract<AdminView, "scheduler" | "staff">;

const isSchedulerView = (view: AdminView): view is SchedulerView =>
  view === "scheduler" || view === "staff";

const TABS: {
  view: AdminView;
  label: string;
  icon: React.ReactNode;
  hint: string;
  /** Where the section lives, for when it has to be reached from another page. */
  href: string;
}[] = [
  {
    view: "scheduler",
    label: "Schedule maker",
    icon: <CalendarRange className="size-4" />,
    hint: "Build and publish the week",
    href: "/admin",
  },
  {
    view: "staff",
    label: "Staff management",
    icon: <Users className="size-4" />,
    hint: "Sign-in codes for your team",
    href: "/admin?view=staff",
  },
  {
    view: "truck",
    label: "Truck order",
    icon: <Truck className="size-4" />,
    hint: "What to order, and what you ordered",
    href: "/admin/truck-order",
  },
  {
    view: "tips",
    label: "Tips payout",
    icon: <HandCoins className="size-4" />,
    hint: "Split the week's tips by the hour",
    href: "/admin/tips",
  },
  {
    view: "applications",
    label: "Applications",
    icon: <ClipboardList className="size-4" />,
    hint: "Who applied, who you're interviewing",
    href: "/admin/applications",
  },
];

type Props = {
  open: boolean;
  view: AdminView;
  onOpenChange: (open: boolean) => void;
  /**
   * Given only on `/admin`, where the scheduler and staff tabs are two views of
   * one page. Tabs it can't handle — and every tab elsewhere — are links.
   */
  onSelect?: (view: SchedulerView) => void;
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
            const className = `flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
              active ? "bg-brand/10 text-brand" : "hover:bg-muted"
            }`;
            const body = (
              <>
                <span className={`mt-0.5 ${active ? "text-brand" : "text-muted-foreground"}`}>
                  {tab.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{tab.label}</span>
                  <span className="block text-xs text-muted-foreground">{tab.hint}</span>
                </span>
              </>
            );

            // Switching between the scheduler's own two views is a state change,
            // not a navigation — it would be a shame to throw away the week on
            // screen to look up somebody's sign-in code. Every other tab is a
            // page of its own and has to be navigated to. Narrowed out here
            // rather than inside the handler, where a property's type is no
            // longer known to have been checked.
            const schedulerView = isSchedulerView(tab.view) ? tab.view : null;

            return schedulerView && onSelect ? (
              <button
                key={tab.view}
                type="button"
                aria-current={active ? "page" : undefined}
                tabIndex={open ? 0 : -1}
                onClick={() => {
                  onSelect(schedulerView);
                  onOpenChange(false);
                }}
                className={className}
              >
                {body}
              </button>
            ) : (
              <Link
                key={tab.view}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                tabIndex={open ? 0 : -1}
                onClick={() => onOpenChange(false)}
                className={className}
              >
                {body}
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}
