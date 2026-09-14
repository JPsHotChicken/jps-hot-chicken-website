import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { isGeneratorConfigured } from "@/lib/menu-descriptions-ai";
import { loadLibrary } from "@/lib/menu-descriptions-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/admin/SetupNotice";
import { RecipeBuilder } from "@/components/menu-descriptions/RecipeBuilder";

export const metadata: Metadata = {
  title: "New recipe",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** The builder with nothing in it yet. Saving gives the recipe its own page. */
export default async function NewRecipePage() {
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const library = await loadLibrary();

  return <RecipeBuilder recipe={null} library={library} generatorReady={isGeneratorConfigured()} />;
}
