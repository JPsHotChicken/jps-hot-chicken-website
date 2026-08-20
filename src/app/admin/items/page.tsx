import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { catalogueRows, categoriesOf } from "@/lib/items";
import { loadGraph } from "@/lib/items-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/admin/SetupNotice";
import { ItemsDashboard } from "@/components/items/ItemsDashboard";

export const metadata: Metadata = {
  title: "Items database",
  robots: { index: false, follow: false },
};

// Costs move whenever a supplier price does, and a stale one would be copied
// onto a cost sheet before anybody noticed.
export const dynamic = "force-dynamic";

/**
 * The items database, where it is edited.
 *
 * This is the only place a record can be changed. `/operations/items` shows the
 * same catalogue to the crew as a read-only view, which is what makes it a
 * controlled document rather than a shared notebook.
 */
export default async function AdminItemsPage() {
  // `proxy.ts` already redirects signed-out visitors; checking again here means
  // the page can never render off the back of a forged cookie.
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const graph = await loadGraph();

  return (
    <ItemsDashboard
      rows={catalogueRows(graph)}
      categories={categoriesOf(graph.items)}
    />
  );
}
