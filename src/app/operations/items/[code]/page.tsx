import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import {
  OPERATIONS_SESSION_COOKIE,
  verifyOperationsSessionToken,
} from "@/lib/operations-auth";
import { costOf, gapsIn, normaliseCode, whereUsed } from "@/lib/items";
import {
  listItemLocations,
  listItemSuppliers,
  listLocations,
  listRevisions,
  listSuppliers,
  loadGraph,
} from "@/lib/items-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/admin/SetupNotice";
import { ItemRecord } from "@/components/items/ItemRecord";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  return {
    title: normaliseCode(decodeURIComponent((await params).code)),
    robots: { index: false, follow: false },
  };
}

/**
 * One item's record as the crew reads it: what it is, what it costs, what it is
 * made of, and everything that is made from it. Changing any of it happens at
 * `/admin/items`.
 */
export default async function ItemPage({ params }: { params: Promise<{ code: string }> }) {
  const cookieStore = await cookies();
  if (!(await verifyOperationsSessionToken(cookieStore.get(OPERATIONS_SESSION_COOKIE)?.value))) {
    redirect("/operations/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const code = normaliseCode(decodeURIComponent((await params).code));
  const graph = await loadGraph();
  const item = graph.items.find((candidate) => normaliseCode(candidate.code) === code);
  if (!item) notFound();

  const usedBy = whereUsed(item.id, graph);
  const parts = graph.components.get(item.id) ?? [];

  const [suppliers, itemSuppliers, locations, itemLocationIds, revisions] = await Promise.all([
    listSuppliers(),
    listItemSuppliers(item.id),
    listLocations(),
    listItemLocations(item.id),
    listRevisions(item.id),
  ]);

  return (
    <ItemRecord
      item={item}
      cost={costOf(item.id, graph)}
      gaps={gapsIn(item, parts.length)}
      usedBy={usedBy.map((used) => ({
        code: used.code,
        name: used.internalName,
        type: used.type,
      }))}
      // Nothing is addable here, so there is nothing to offer.
      candidates={[]}
      suppliers={suppliers}
      itemSuppliers={itemSuppliers}
      locations={locations}
      itemLocationIds={itemLocationIds}
      revisions={revisions}
      canEdit={false}
      basePath="/operations/items"
      chrome="operations"
    />
  );
}
