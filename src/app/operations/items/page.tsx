import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  OPERATIONS_SESSION_COOKIE,
  verifyOperationsSessionToken,
} from "@/lib/operations-auth";
import { catalogueRows, categoriesOf } from "@/lib/items";
import { loadGraph } from "@/lib/items-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { OperationsShell } from "@/components/operations/OperationsShell";
import { SetupNotice } from "@/components/admin/SetupNotice";
import { ItemsBrowser } from "@/components/items/ItemsBrowser";

export const metadata: Metadata = {
  title: "Items database",
  robots: { index: false, follow: false },
};

// Costs move whenever a supplier price does, and a stale one would be copied
// onto a cost sheet before anybody noticed.
export const dynamic = "force-dynamic";

/**
 * The items database.
 *
 * Every physical thing in the operation, in one list — the crew's copy, which
 * is read-only by construction rather than by permission. The catalogue is a
 * controlled document: it is edited in one place, `/admin/items`, and consumed
 * everywhere else. A location reads the standard, it does not set it.
 */
export default async function ItemsPage() {
  const cookieStore = await cookies();
  if (!(await verifyOperationsSessionToken(cookieStore.get(OPERATIONS_SESSION_COOKIE)?.value))) {
    redirect("/operations/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const graph = await loadGraph();
  const rows = catalogueRows(graph);

  return (
    <OperationsShell
      title="Items database"
      description={`${rows.length} ${rows.length === 1 ? "item" : "items"}`}
      back={{ href: "/operations", label: "Back to operations" }}
    >
      <ItemsBrowser
        rows={rows}
        categories={categoriesOf(graph.items)}
        canEdit={false}
        basePath="/operations/items"
      />
    </OperationsShell>
  );
}
