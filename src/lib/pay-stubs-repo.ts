import "server-only";

import { getDb } from "@/lib/supabase/server";
import {
  normalizeName,
  suggestAssignments,
  type MatchSource,
  type PayrollAlias,
  type ParsedPayroll,
  type RosterEntry,
} from "@/lib/pay-stubs";

/**
 * Every read and write behind Staff pay stubs.
 *
 * The split pages live in a private storage bucket rather than in a column:
 * they are files, they are only ever handed out one at a time, and nothing
 * should be able to read one without going through code that checks who is
 * asking. Nothing here mints a public URL — pages are streamed by the route at
 * `/api/pay-stubs/[stubId]`, which is where that check lives.
 */

const BUCKET = "pay-stubs";

function fail(context: string, error: { message: string; code?: string } | null): never {
  throw new Error(`[pay-stubs] ${context}: ${error?.message ?? "unknown error"}`);
}

export type BatchSummary = {
  id: string;
  createdAt: string;
  sourceFilename: string;
  pageCount: number;
  payDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  releasedAt: string | null;
  /** Pages with somebody attached to them. */
  assignedCount: number;
  /** Pages the owner has deliberately set aside. */
  skippedCount: number;
};

export type StubRow = {
  id: string;
  pageNumber: number;
  employeeId: string | null;
  employeeName: string | null;
  payrollName: string | null;
  match: MatchSource;
  skipped: boolean;
};

export type BatchDetail = BatchSummary & { stubs: StubRow[] };

/** A page still needing a decision is neither assigned nor set aside. */
export const isUnresolved = (stub: { employeeId: string | null; skipped: boolean }) =>
  !stub.employeeId && !stub.skipped;

/* ------------------------------------------------------------------ roster */

/** Active staff, for matching against and for the assignment dropdown. */
export async function loadRoster(): Promise<RosterEntry[]> {
  const { data, error } = await getDb()
    .from("employees")
    .select("id, name")
    .eq("active", true)
    .order("name");
  if (error) fail("reading the roster", error);
  return data;
}

export async function loadAliases(): Promise<PayrollAlias[]> {
  const { data, error } = await getDb()
    .from("employee_payroll_names")
    .select("employee_id, payroll_name");
  if (error) fail("reading remembered payroll names", error);
  return data.map((row) => ({ employeeId: row.employee_id, payrollName: row.payroll_name }));
}

/**
 * Remembers that payroll calls this person by this name, so next month's upload
 * matches them without being asked. Stored normalised, because it is only ever
 * compared and never displayed.
 */
async function rememberPayrollName(employeeId: string, payrollName: string): Promise<void> {
  const { error } = await getDb()
    .from("employee_payroll_names")
    .upsert(
      { employee_id: employeeId, payroll_name: normalizeName(payrollName) },
      { onConflict: "payroll_name" },
    );
  if (error) fail("remembering a payroll name", error);
}

/** Drops a remembered name — for when it was taught to the wrong person. */
export async function forgetPayrollName(payrollName: string): Promise<void> {
  const { error } = await getDb()
    .from("employee_payroll_names")
    .delete()
    .eq("payroll_name", normalizeName(payrollName));
  if (error) fail("forgetting a payroll name", error);
}

/* ----------------------------------------------------------------- reading */

const BATCH_COLUMNS =
  "id, created_at, source_filename, page_count, pay_date, period_start, period_end, released_at";

type BatchRow = {
  id: string;
  created_at: string;
  source_filename: string;
  page_count: number;
  pay_date: string | null;
  period_start: string | null;
  period_end: string | null;
  released_at: string | null;
};

function toBatch(row: BatchRow, assigned: number, skipped: number): BatchSummary {
  return {
    id: row.id,
    createdAt: row.created_at,
    sourceFilename: row.source_filename,
    pageCount: row.page_count,
    payDate: row.pay_date,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    releasedAt: row.released_at,
    assignedCount: assigned,
    skippedCount: skipped,
  };
}

export async function listBatches(): Promise<BatchSummary[]> {
  const db = getDb();
  const { data: batches, error } = await db
    .from("pay_stub_batches")
    .select(BATCH_COLUMNS)
    .order("pay_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) fail("listing pay runs", error);

  const { data: stubs, error: stubError } = await db
    .from("pay_stubs")
    .select("batch_id, employee_id, skipped");
  if (stubError) fail("counting pages", stubError);

  return batches.map((row) => {
    const mine = stubs.filter((stub) => stub.batch_id === row.id);
    return toBatch(
      row,
      mine.filter((stub) => stub.employee_id).length,
      mine.filter((stub) => stub.skipped).length,
    );
  });
}

export async function loadBatch(batchId: string): Promise<BatchDetail | null> {
  const db = getDb();
  const { data: batch, error } = await db
    .from("pay_stub_batches")
    .select(BATCH_COLUMNS)
    .eq("id", batchId)
    .maybeSingle();
  if (error) fail("reading a pay run", error);
  if (!batch) return null;

  const { data: stubs, error: stubError } = await db
    .from("pay_stubs")
    .select("id, page_number, employee_id, payroll_name, match_source, skipped")
    .eq("batch_id", batchId)
    .order("page_number");
  if (stubError) fail("reading pages", stubError);

  // Names are looked up across everybody, not just the active roster: a page
  // assigned to somebody who has since left still has to say whose it is.
  const { data: everyone, error: peopleError } = await db.from("employees").select("id, name");
  if (peopleError) fail("reading employees", peopleError);
  const nameOf = new Map(everyone.map((person) => [person.id, person.name]));

  return {
    ...toBatch(
      batch,
      stubs.filter((stub) => stub.employee_id).length,
      stubs.filter((stub) => stub.skipped).length,
    ),
    stubs: stubs.map((stub) => ({
      id: stub.id,
      pageNumber: stub.page_number,
      employeeId: stub.employee_id,
      employeeName: stub.employee_id ? (nameOf.get(stub.employee_id) ?? null) : null,
      payrollName: stub.payroll_name,
      match: stub.match_source as MatchSource,
      skipped: stub.skipped,
    })),
  };
}

/** The most recent pay run, which is the one the dashboard opens on. */
export async function latestBatchId(): Promise<string | null> {
  const [first] = await listBatches();
  return first?.id ?? null;
}

/* ----------------------------------------------------------------- writing */

const pagePath = (batchId: string, pageNumber: number) =>
  `${batchId}/page-${String(pageNumber).padStart(3, "0")}.pdf`;

/**
 * Stores an uploaded pay run: the pages into the bucket, a row per page, and a
 * first guess at who each one belongs to.
 *
 * The batch row is written first so the pages have somewhere to live, and a
 * failure part-way through takes the whole batch back out again — half an
 * uploaded pay run on screen would be worse than none.
 */
export async function saveBatch(input: {
  sourceFilename: string;
  parsed: ParsedPayroll;
  pageFiles: Uint8Array[];
}): Promise<string> {
  const db = getDb();
  const { parsed, pageFiles, sourceFilename } = input;

  const { data: batch, error } = await db
    .from("pay_stub_batches")
    .insert({
      source_filename: sourceFilename,
      page_count: pageFiles.length,
      pay_date: parsed.payDate,
      period_start: parsed.periodStart,
      period_end: parsed.periodEnd,
    })
    .select("id")
    .single();
  if (error) fail("starting a pay run", error);

  try {
    const [roster, aliases] = await Promise.all([loadRoster(), loadAliases()]);
    const suggestions = suggestAssignments(parsed.pages, roster, aliases);

    await Promise.all(
      pageFiles.map(async (bytes, index) => {
        const { error: uploadError } = await db.storage
          .from(BUCKET)
          .upload(pagePath(batch.id, index + 1), bytes, {
            contentType: "application/pdf",
            upsert: true,
          });
        if (uploadError) fail(`storing page ${index + 1}`, uploadError);
      }),
    );

    const { error: rowError } = await db.from("pay_stubs").insert(
      suggestions.map((suggestion) => ({
        batch_id: batch.id,
        page_number: suggestion.pageNumber,
        employee_id: suggestion.employeeId,
        payroll_name: suggestion.payrollName,
        match_source: suggestion.match,
        storage_path: pagePath(batch.id, suggestion.pageNumber),
      })),
    );
    if (rowError) fail("recording pages", rowError);

    return batch.id;
  } catch (problem) {
    await deleteBatch(batch.id).catch(() => {});
    throw problem;
  }
}

/**
 * Attaches a page to somebody, or takes it back off them.
 *
 * A person can only hold one page in a pay run, so handing them a second one
 * moves them: the page they were on is left unassigned for the owner to see and
 * settle. Assigning also teaches the payroll name, which is what makes the next
 * upload land on its own.
 */
export async function assignStub(stubId: string, employeeId: string | null): Promise<void> {
  const db = getDb();
  const { data: stub, error } = await db
    .from("pay_stubs")
    .select("id, batch_id, payroll_name")
    .eq("id", stubId)
    .maybeSingle();
  if (error) fail("reading a page", error);
  if (!stub) throw new Error("[pay-stubs] that page no longer exists.");

  if (employeeId) {
    const { error: clearError } = await db
      .from("pay_stubs")
      .update({ employee_id: null, match_source: "none" })
      .eq("batch_id", stub.batch_id)
      .eq("employee_id", employeeId)
      .neq("id", stubId);
    if (clearError) fail("moving somebody off their other page", clearError);
  }

  const { error: writeError } = await db
    .from("pay_stubs")
    .update(
      employeeId
        // Attaching somebody is also a decision that this page is not set
        // aside. The source becomes "alias" because assigning by hand is
        // exactly what teaches us the name.
        ? { employee_id: employeeId, match_source: "alias", skipped: false }
        : { employee_id: null, match_source: "none" },
    )
    .eq("id", stubId);
  if (writeError) fail("assigning a page", writeError);

  if (employeeId && stub.payroll_name) {
    await rememberPayrollName(employeeId, stub.payroll_name);
  }
}

/** Sets a page aside, or brings it back into play. */
export async function skipStub(stubId: string, skipped: boolean): Promise<void> {
  const { error } = await getDb()
    .from("pay_stubs")
    .update(skipped ? { skipped: true, employee_id: null, match_source: "none" } : { skipped: false })
    .eq("id", stubId);
  if (error) fail("setting a page aside", error);
}

export async function setPayDate(batchId: string, payDate: string | null): Promise<void> {
  const { error } = await getDb()
    .from("pay_stub_batches")
    .update({ pay_date: payDate })
    .eq("id", batchId);
  if (error) fail("setting the pay date", error);
}

/** Raised when a pay run still has pages nobody has decided about. */
export class UnresolvedPagesError extends Error {
  constructor(public readonly pages: number[]) {
    super(
      `Page${pages.length === 1 ? "" : "s"} ${pages.join(", ")} ${
        pages.length === 1 ? "has" : "have"
      } nobody assigned. Assign or set aside every page before going live.`,
    );
    this.name = "UnresolvedPagesError";
  }
}

/**
 * Releases a pay run to staff.
 *
 * Refused while any page is undecided. A page nobody has looked at is as likely
 * to be somebody's missing stub as it is to be a page that does not belong to
 * anyone here, and the difference matters too much to assume.
 */
export async function releaseBatch(batchId: string): Promise<void> {
  const batch = await loadBatch(batchId);
  if (!batch) throw new Error("[pay-stubs] that pay run no longer exists.");

  const unresolved = batch.stubs.filter(isUnresolved).map((stub) => stub.pageNumber);
  if (unresolved.length > 0) throw new UnresolvedPagesError(unresolved);

  const { error } = await getDb()
    .from("pay_stub_batches")
    .update({ released_at: new Date().toISOString() })
    .eq("id", batchId);
  if (error) fail("going live", error);
}

/** Takes a released pay run back out of everyone's view. */
export async function unreleaseBatch(batchId: string): Promise<void> {
  const { error } = await getDb()
    .from("pay_stub_batches")
    .update({ released_at: null })
    .eq("id", batchId);
  if (error) fail("taking a pay run back", error);
}

/** Removes a pay run and every page file behind it. */
export async function deleteBatch(batchId: string): Promise<void> {
  const db = getDb();
  const { data: files } = await db.storage.from(BUCKET).list(batchId);
  if (files && files.length > 0) {
    const { error: removeError } = await db.storage
      .from(BUCKET)
      .remove(files.map((file) => `${batchId}/${file.name}`));
    if (removeError) fail("removing stored pages", removeError);
  }

  // The pages themselves go with the batch — `pay_stubs.batch_id` cascades.
  const { error } = await db.from("pay_stub_batches").delete().eq("id", batchId);
  if (error) fail("removing a pay run", error);
}

/* -------------------------------------------------------------- one stub */

export type StubAccess = {
  id: string;
  storagePath: string;
  employeeId: string | null;
  /** Null while the pay run is still a draft. */
  releasedAt: string | null;
  payDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
};

/** What the file route needs to decide whether this caller may have this page. */
export async function loadStubAccess(stubId: string): Promise<StubAccess | null> {
  const { data, error } = await getDb()
    .from("pay_stubs")
    .select(
      "id, storage_path, employee_id, pay_stub_batches(released_at, pay_date, period_start, period_end)",
    )
    .eq("id", stubId)
    .maybeSingle();
  if (error) fail("reading a page", error);
  if (!data) return null;

  const batch = data.pay_stub_batches as unknown as {
    released_at: string | null;
    pay_date: string | null;
    period_start: string | null;
    period_end: string | null;
  } | null;

  return {
    id: data.id,
    storagePath: data.storage_path,
    employeeId: data.employee_id,
    releasedAt: batch?.released_at ?? null,
    payDate: batch?.pay_date ?? null,
    periodStart: batch?.period_start ?? null,
    periodEnd: batch?.period_end ?? null,
  };
}

/** The bytes of one page, straight out of the private bucket. */
export async function readStubFile(storagePath: string): Promise<ArrayBuffer> {
  const { data, error } = await getDb().storage.from(BUCKET).download(storagePath);
  if (error || !data) fail("reading a stored page", error);
  return data.arrayBuffer();
}

/** Every released stub belonging to one person, newest pay run first. */
export async function payStubsForEmployee(employeeId: string): Promise<
  { id: string; payDate: string | null; periodStart: string | null; periodEnd: string | null }[]
> {
  const { data, error } = await getDb()
    .from("pay_stubs")
    .select("id, pay_stub_batches!inner(pay_date, period_start, period_end, released_at)")
    .eq("employee_id", employeeId)
    .not("pay_stub_batches.released_at", "is", null);
  if (error) fail("reading someone's pay stubs", error);

  return data
    .map((row) => {
      const batch = row.pay_stub_batches as unknown as {
        pay_date: string | null;
        period_start: string | null;
        period_end: string | null;
      };
      return {
        id: row.id,
        payDate: batch.pay_date,
        periodStart: batch.period_start,
        periodEnd: batch.period_end,
      };
    })
    .sort((a, b) => (b.payDate ?? "").localeCompare(a.payDate ?? ""));
}
