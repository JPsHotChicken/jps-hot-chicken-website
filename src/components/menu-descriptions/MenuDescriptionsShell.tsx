"use client";

import { useState } from "react";
import Link from "next/link";
import { LogOut, Menu, NotebookPen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AdminDrawer } from "@/components/admin/AdminDrawer";
import { logout } from "@/app/admin/actions";
import { MENU_DESCRIPTIONS_PATH } from "@/lib/menu-descriptions";

type Tab = "recipes" | "ingredients";

/**
 * The dashboard chrome around the generator's two lists: the drawer button, the
 * title, and a switch between recipes and ingredients.
 */
export function MenuDescriptionsShell({
  tab,
  subtitle,
  children,
}: {
  tab: Tab;
  subtitle: string;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>

          <div className="mr-auto">
            <h1 className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight">
              <NotebookPen className="size-4 text-brand" />
              Menu descriptions
            </h1>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>

          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </form>
        </div>

        <nav
          aria-label="Menu description sections"
          className="mx-auto flex w-full max-w-5xl gap-1 px-4 sm:px-6"
        >
          {(
            [
              ["recipes", "Recipes", MENU_DESCRIPTIONS_PATH],
              ["ingredients", "Ingredients", `${MENU_DESCRIPTIONS_PATH}/ingredients`],
            ] as const
          ).map(([key, label, href]) => (
            <Link
              key={key}
              href={href}
              aria-current={tab === key ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 pt-1 pb-2 text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                tab === key
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4 sm:px-6">{children}</main>

      <AdminDrawer open={menuOpen} view="menuDescriptions" onOpenChange={setMenuOpen} />
    </div>
  );
}
