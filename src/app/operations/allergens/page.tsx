import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  OPERATIONS_SESSION_COOKIE,
  verifyOperationsSessionToken,
} from "@/lib/operations-auth";
import { buildAllergenLookup } from "@/lib/allergens";
import { loadGraph } from "@/lib/items-repo";
import { loadRecipes } from "@/lib/menu-descriptions-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { OperationsShell } from "@/components/operations/OperationsShell";
import { AllergenLookup } from "@/components/operations/AllergenLookup";
import { findSection } from "@/components/operations/sections";
import { SetupNotice } from "@/components/admin/SetupNotice";

const SECTION = findSection("allergens");

export const metadata: Metadata = {
  title: "Allergen lookup",
  robots: { index: false, follow: false },
};

// A guest is asking about the dish as it is built today, not as it was when the
// page was last cached.
export const dynamic = "force-dynamic";

/**
 * Allergen lookup.
 *
 * Answers a guest's question at the counter from the catalogue itself: every
 * allergen recorded on an ingredient is carried up through each prepped item
 * and sub-recipe into the dishes built on it. Read-only — allergens are edited
 * on the item, at `/admin/items`.
 */
export default async function AllergensPage({
  searchParams,
}: {
  searchParams: Promise<{ allergen?: string }>;
}) {
  const cookieStore = await cookies();
  if (!(await verifyOperationsSessionToken(cookieStore.get(OPERATIONS_SESSION_COOKIE)?.value))) {
    redirect("/operations/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const [graph, recipes, params] = await Promise.all([loadGraph(), loadRecipes(), searchParams]);

  return (
    <OperationsShell
      title={SECTION?.label ?? "Allergen lookup"}
      description="What's in every dish, down to the ingredient"
      back={{ href: "/operations", label: "Back to operations" }}
    >
      <AllergenLookup
        entries={buildAllergenLookup(graph, recipes)}
        initialAllergen={params.allergen ?? null}
        itemsPath="/operations/items"
      />
    </OperationsShell>
  );
}
