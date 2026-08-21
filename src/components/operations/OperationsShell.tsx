import Link from "next/link";
import { ChevronLeft, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { operationsLogout } from "@/app/operations/actions";

type Props = {
  title: string;
  /** One line under the title: what this page is for. */
  description?: string;
  /** Where the back arrow goes — the hub goes home, a section goes to the hub. */
  back: { href: string; label: string };
  /**
   * Room for a section that works in two columns rather than one — the drawer
   * count puts its keypad beside the figures on a landscape iPad.
   */
  wide?: boolean;
  children: React.ReactNode;
};

/**
 * The page chrome every operations page sits in.
 *
 * Sized for a device at the register rather than a desk: one column by
 * default, a sticky header so the way back is always in reach, and nothing else
 * competing for the screen. `wide` opens it up for a section that needs the
 * width of a landscape tablet. The lock button is there because the device this
 * runs on is usually a shared one — whoever finishes can lock it behind them.
 */
export function OperationsShell({ title, description, back, wide, children }: Props) {
  return (
    <div className="min-h-screen bg-muted">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className={cn("mx-auto flex w-full items-center gap-3 px-4 py-3 sm:px-6", wide ? "max-w-6xl" : "max-w-3xl")}>
          <Link
            href={back.href}
            aria-label={back.label}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <div className="mr-auto min-w-0">
            <h1 className="truncate font-heading text-lg font-bold tracking-tight">{title}</h1>
            {description && (
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <form action={operationsLogout}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut data-icon="inline-start" />
              Lock
            </Button>
          </form>
        </div>
      </header>

      <main className={cn("mx-auto w-full space-y-4 p-4 sm:px-6", wide ? "max-w-6xl" : "max-w-3xl")}>
        {children}
      </main>
    </div>
  );
}
