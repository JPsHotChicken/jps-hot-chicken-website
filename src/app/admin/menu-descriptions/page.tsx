import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { loadLibrary } from "@/lib/menu-descriptions-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/admin/SetupNotice";
import { MenuDescriptionsShell } from "@/components/menu-descriptions/MenuDescriptionsShell";
import { RecipeList } from "@/components/menu-descriptions/RecipeList";

export const metadata: Metadata = {
  title: "Menu descriptions",
  robots: { index: false, follow: false },
};

// A stale badge that lags behind an ingredient edit would defeat the point of it.
export const dynamic = "force-dynamic";

/** Every recipe, split into menu items and the components they are built from. */
export default async function MenuDescriptionsPage() {
  // `proxy.ts` already redirects signed-out visitors; checking again here means
  // the page can never render off the back of a forged cookie.
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { recipes, ingredients } = await loadLibrary();
  const stale = recipes.filter((recipe) => recipe.isStale).length;

  return (
    <MenuDescriptionsShell
      tab="recipes"
      subtitle={`${recipes.length} recipe${recipes.length === 1 ? "" : "s"} · ${ingredients.length} ingredient${ingredients.length === 1 ? "" : "s"}${stale > 0 ? ` · ${stale} out of date` : ""}`}
    >
      <RecipeList recipes={recipes} />
    </MenuDescriptionsShell>
  );
}
