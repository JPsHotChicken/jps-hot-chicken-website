import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { readPayrollPdf, UnreadablePayrollError } from "@/lib/pay-stubs-pdf";
import { saveBatch } from "@/lib/pay-stubs-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Takes the payroll PDF the accountant sends and turns it into a draft pay run.
 *
 * A route rather than a Server Action because this carries a file: actions post
 * through a body-size limit meant for form fields, and a pay run for a full
 * roster is comfortably past it.
 *
 * Reading a PDF is real work, so this runs on Node rather than the edge.
 */
export const runtime = "nodejs";

/** Generous for a pay run, mean enough that nobody can post a film here. */
const MAX_BYTES = 20 * 1024 * 1024;

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
    return NextResponse.json({ error: "Choose a PDF to upload." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 20 MB.` },
      { status: 413 },
    );
  }
  if (file.type && file.type !== "application/pdf") {
    return NextResponse.json({ error: "That is not a PDF." }, { status: 415 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const payroll = await readPayrollPdf(bytes);
    const batchId = await saveBatch({
      sourceFilename: file.name,
      parsed: payroll,
      pageFiles: payroll.pageFiles,
    });
    return NextResponse.json({ batchId, pageCount: payroll.pageFiles.length });
  } catch (error) {
    if (error instanceof UnreadablePayrollError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("[pay-stubs] upload failed", error);
    return NextResponse.json(
      { error: "That upload could not be processed. Nothing was saved." },
      { status: 500 },
    );
  }
}
