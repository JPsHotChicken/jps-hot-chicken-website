import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { categoriesOf } from "@/lib/items";
import { READABLE_TYPES, readItemSheet, type ReadableType } from "@/lib/items-ai";
import { loadGraph } from "@/lib/items-repo";
import { GenerationError } from "@/lib/model-reply";
import { isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Reads a spec sheet, label or photo into a filled-in item record. Nothing is
 * saved: the fields come back to the form for the owner to check.
 *
 * A route rather than a Server Action because this carries a file, and actions
 * post through a body-size limit meant for form fields (see the pay-stubs
 * upload for the same choice). The uploader posts one file per request, so a
 * folder of sheets is a queue of these rather than one long call.
 */

// One model call reading a file, plus a retry if the reply is unreadable. A
// segment config has to be a literal, so this can't come from `anthropic.ts`.
export const maxDuration = 300;

/** Vercel refuses request bodies past 4.5 MB before this code runs. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * What a file really is, by its first bytes rather than the name or type the
 * browser reported. A JPEG renamed `.pdf` would otherwise be sent to the API as
 * a PDF and rejected there with a worse message.
 */
function sniff(bytes: Uint8Array): ReadableType | null {
  const starts = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);

  if (starts(0x25, 0x50, 0x44, 0x46)) return "application/pdf"; // %PDF
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  // RIFF....WEBP
  if (starts(0x52, 0x49, 0x46, 0x46) && [0x57, 0x45, 0x42, 0x50].every((byte, index) => bytes[8 + index] === byte)) {
    return "image/webp";
  }
  return null;
}

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
    return NextResponse.json({ error: "Choose a file to read." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 4 MB.` },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = sniff(bytes);
  if (!mediaType || !READABLE_TYPES.includes(mediaType)) {
    return NextResponse.json(
      { error: "That file isn't a PDF, JPEG or PNG." },
      { status: 415 },
    );
  }

  try {
    const graph = await loadGraph();
    return NextResponse.json(await readItemSheet(bytes, mediaType, categoriesOf(graph.items)));
  } catch (error) {
    if (error instanceof GenerationError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("[items] reading a spec sheet failed", error);
    return NextResponse.json({ error: "That file couldn't be read. Try again." }, { status: 500 });
  }
}
