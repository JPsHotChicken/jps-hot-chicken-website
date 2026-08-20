import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { canBeComponent, costOf, gapsIn, normaliseCode, whereUsed } from "@/lib/items";
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

/** One item's record, editable. */
export default async function AdminItemPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
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

  // Anything this item is already part of would close a loop if it were added
  // as a component, so the picker never offers it. The database trigger is the
  // backstop; this is the version somebody can understand.
  const wouldLoop = new Set(usedBy.map((used) => used.id));

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
      candidates={graph.items
        .filter((candidate) => candidate.id !== item.id && !wouldLoop.has(candidate.id))
        .filter(canBeComponent)
        .map((candidate) => ({
          id: candidate.id,
          code: candidate.code,
          name: candidate.internalName,
          stockUnit: candidate.stockUnit,
          portionUnit: candidate.portionUnit,
        }))}
      suppliers={suppliers}
      itemSuppliers={itemSuppliers}
      locations={locations}
      itemLocationIds={itemLocationIds}
      revisions={revisions}
      canEdit
      basePath="/admin/items"
      chrome="admin"
    />
  );
}
