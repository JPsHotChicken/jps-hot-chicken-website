"use client";

import { useState } from "react";
import { Database, LogOut, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AdminDrawer } from "@/components/admin/AdminDrawer";
import { logout } from "@/app/admin/actions";
import { ItemsBrowser } from "./ItemsBrowser";
import type { CatalogueRow } from "@/lib/items";

/**
 * The catalogue list wearing the dashboard's chrome.
 *
 * The list itself is the same component the crew reads at `/operations/items`;
 * only the frame around it and the ability to edit differ.
 */
export function ItemsDashboard({
  rows,
  categories,
}: {
  rows: CatalogueRow[];
  categories: string[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const incomplete = rows.filter((row) => row.gaps > 0).length;

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
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
              <Database className="size-4 text-brand" />
              Items database
            </h1>
            <p className="text-xs text-muted-foreground">
              {rows.length} item{rows.length === 1 ? "" : "s"}
              {incomplete > 0 && ` · ${incomplete} incomplete`}
            </p>
          </div>

          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-4 sm:px-6">
        <ItemsBrowser rows={rows} categories={categories} canEdit basePath="/admin/items" />
      </main>

      <AdminDrawer open={menuOpen} view="items" onOpenChange={setMenuOpen} />
    </div>
  );
}
