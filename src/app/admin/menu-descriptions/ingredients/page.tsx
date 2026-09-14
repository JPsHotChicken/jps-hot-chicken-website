import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { loadLibrary } from "@/lib/menu-descriptions-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/admin/SetupNotice";
import { IngredientsTable } from "@/components/menu-descriptions/IngredientsTable";
import { MenuDescriptionsShell } from "@/components/menu-descriptions/MenuDescriptionsShell";

export const metadata: Metadata = {
  title: "Ingredients",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** The ingredients every recipe is built from. */
export default async function IngredientsPage() {
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { ingredients } = await loadLibrary();

  return (
    <MenuDescriptionsShell
      tab="ingredients"
      subtitle={`${ingredients.length} ingredient${ingredients.length === 1 ? "" : "s"}`}
    >
      <IngredientsTable ingredients={ingredients} />
    </MenuDescriptionsShell>
  );
}
