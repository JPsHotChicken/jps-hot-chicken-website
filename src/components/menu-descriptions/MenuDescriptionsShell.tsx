"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, LogOut, Menu, NotebookPen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AdminDrawer } from "@/components/admin/AdminDrawer";
import { logout } from "@/app/admin/actions";
import { MENU_DESCRIPTIONS_PATH } from "@/lib/menu-descriptions";

/**
 * The dashboard chrome around the generator: the drawer button, the title, and
 * a way back to the catalogue the ingredients come from.
 *
 * There is no ingredients list here any more. An ingredient is an item, and
 * every item is edited in one place — the items database.
 */
export function MenuDescriptionsShell({
  subtitle,
  children,
}: {
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
          className="mx-auto flex w-full max-w-5xl items-center gap-1 px-4 sm:px-6"
        >
          <Link
            href={MENU_DESCRIPTIONS_PATH}
            aria-current="page"
            className="-mb-px border-b-2 border-brand px-3 pt-1 pb-2 text-sm font-semibold focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Recipes
          </Link>
          <Link
            href="/admin/items"
            className="-mb-px flex items-center gap-1 border-b-2 border-transparent px-3 pt-1 pb-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            Ingredients
            <ArrowUpRight className="size-3.5" />
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4 sm:px-6">{children}</main>

      <AdminDrawer open={menuOpen} view="menuDescriptions" onOpenChange={setMenuOpen} />
    </div>
  );
}
