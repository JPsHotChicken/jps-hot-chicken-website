import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { categoriesOf } from "@/lib/items";
import { loadGraph } from "@/lib/items-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/admin/SetupNotice";
import { NewItemForm } from "@/components/items/NewItemForm";

export const metadata: Metadata = {
  title: "New item",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Starting a new record.
 *
 * Only identity is asked for here — a code, a name, what layer it belongs to.
 * Everything else is filled in on the record itself, where the fields on show
 * are the ones its type actually calls for.
 */
export default async function NewItemPage() {
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const graph = await loadGraph();

  return (
    <div className="min-h-screen bg-muted">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/admin/items"
            aria-label="Back to the catalogue"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-lg font-bold tracking-tight">New item</h1>
            <p className="truncate text-xs text-muted-foreground">
              Identity first — the rest is filled in on the record
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:px-6">
        <NewItemForm
          existingCodes={graph.items.map((item) => item.code)}
          categories={categoriesOf(graph.items)}
        />
      </main>
    </div>
  );
}
