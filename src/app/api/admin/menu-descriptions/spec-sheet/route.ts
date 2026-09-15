import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { GenerationError, readSpecSheet } from "@/lib/menu-descriptions-ai";
import { loadCategories } from "@/lib/menu-descriptions-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Reads a supplier's spec sheet PDF into a filled-in ingredient. Nothing is
 * saved: the ingredient comes back to the form for the owner to check.
 *
 * A route rather than a Server Action because this carries a file, and actions
 * post through a body-size limit meant for form fields (see the pay-stubs
 * upload for the same choice).
 */

// One model call reading a PDF, plus a retry if the reply is unreadable.
export const maxDuration = 300;

/** Vercel refuses request bodies past 4.5 MB before this code runs. */
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "The database is not configured." }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a PDF to read." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 4 MB.` },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Checked by content, not by the name or type the browser reported.
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    return NextResponse.json({ error: "That file isn't a PDF." }, { status: 415 });
  }

  try {
    const categories = await loadCategories();
    if (categories.length === 0) {
      return NextResponse.json({ error: "Add a category first." }, { status: 422 });
    }
    return NextResponse.json(await readSpecSheet(bytes, categories));
  } catch (error) {
    if (error instanceof GenerationError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("[menu-descriptions] reading a spec sheet failed", error);
    return NextResponse.json({ error: "That PDF couldn't be read. Try again." }, { status: 500 });
  }
}
