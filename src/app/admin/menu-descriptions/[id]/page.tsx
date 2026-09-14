import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { isGeneratorConfigured } from "@/lib/menu-descriptions-ai";
import { loadLibrary } from "@/lib/menu-descriptions-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/admin/SetupNotice";
import { RecipeBuilder } from "@/components/menu-descriptions/RecipeBuilder";

export const metadata: Metadata = {
  title: "Recipe builder",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// Generating a description is one model call that can take the better part of a
// minute, and a retry doubles that. Server Actions take their limit from here.
export const maxDuration = 300;

/** One recipe: its components, allergens, and generated menu copy. */
export default async function RecipeBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { id } = await params;
  const library = await loadLibrary();
  const recipe = library.recipes.find((candidate) => candidate.id === id);
  if (!recipe) notFound();

  return (
    <RecipeBuilder recipe={recipe} library={library} generatorReady={isGeneratorConfigured()} />
  );
}
