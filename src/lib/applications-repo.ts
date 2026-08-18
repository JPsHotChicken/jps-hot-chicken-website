import "server-only";

import { getDb } from "@/lib/supabase/server";
import {
  compareInterviews,
  compareSnippets,
  type Application,
  type ApplicationDraft,
  type ApplicationStatus,
  type Interview,
  type InterviewDraft,
  type TextSnippet,
} from "@/lib/applications";

/**
 * Every read and write behind the Applications page.
 *
 * Applications are only ever inserted by the apply route and updated by the
 * owner — there is nothing here that rewrites what an applicant typed, which is
 * deliberate: the sheet is a record of what was submitted, and an editable one
 * would stop being that the first time somebody tidied a phone number.
 */

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[applications] ${context}: ${error?.message ?? "unknown error"}`);
}

/* ------------------------------------------------------------------ shaping */

// One string literal each: `supabase-js` types a query off the literal it is
// given, so a column list stitched together with `+` comes back as `unknown`.
const APPLICATION_COLUMNS =
  "id, submitted_at, first_name, last_name, phone, email, age, work_authorized, position, location, availability, employment_type, food_service, experience, transportation, status, note";
const INTERVIEW_COLUMNS = "id, application_id, name, phone, interview_date, interview_time, note";
const SNIPPET_COLUMNS = "id, title, body, sort_order";

type ApplicationRow = {
  id: string;
  submitted_at: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  age: string;
  work_authorized: string;
  position: string;
  location: string;
  availability: string;
  employment_type: string;
  food_service: string;
  experience: string;
  transportation: string;
  status: ApplicationStatus;
  note: string;
};

function toApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    submittedAt: row.submitted_at,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    age: row.age,
    workAuthorized: row.work_authorized,
    position: row.position,
    location: row.location,
    availability: row.availability,
    employmentType: row.employment_type,
    foodService: row.food_service,
    experience: row.experience,
    transportation: row.transportation,
    status: row.status,
    note: row.note,
  };
}

type InterviewRow = {
  id: string;
  application_id: string | null;
  name: string;
  phone: string;
  interview_date: string;
  interview_time: string;
  note: string;
};

function toInterview(row: InterviewRow): Interview {
  return {
    id: row.id,
    applicationId: row.application_id,
    name: row.name,
    phone: row.phone,
    date: row.interview_date,
    time: row.interview_time,
    note: row.note,
  };
}

type SnippetRow = { id: string; title: string; body: string; sort_order: number };

function toSnippet(row: SnippetRow): TextSnippet {
  return { id: row.id, title: row.title, body: row.body, sortOrder: row.sort_order };
}

/* ------------------------------------------------------------- applications */

/** How far back the sheet reaches. Two years of applications for one store. */
export const APPLICATION_LIMIT = 1000;

export async function loadApplications(): Promise<Application[]> {
  const db = getDb();
  const { data, error } = await db
    .from("job_applications")
    .select(APPLICATION_COLUMNS)
    .order("submitted_at", { ascending: false })
    .limit(APPLICATION_LIMIT);
  if (error) fail("reading applications", error);
  return data.map(toApplication);
}

/**
 * Record a submitted application.
 *
 * Called from the public apply route, which is why it takes a draft rather than
 * a whole row: status and note belong to the owner and start at their defaults.
 */
export async function insertApplication(draft: ApplicationDraft): Promise<void> {
  const db = getDb();
  const { error } = await db.from("job_applications").insert({
    first_name: draft.firstName,
    last_name: draft.lastName,
    phone: draft.phone,
    email: draft.email,
    age: draft.age,
    work_authorized: draft.workAuthorized,
    position: draft.position,
    location: draft.location,
    availability: draft.availability,
    employment_type: draft.employmentType,
    food_service: draft.foodService,
    experience: draft.experience,
    transportation: draft.transportation,
  });
  if (error) fail("saving an application", error);
}

export async function setApplicationStatus(
  id: string,
  status: ApplicationStatus,
): Promise<void> {
  const db = getDb();
  const { error } = await db.from("job_applications").update({ status }).eq("id", id);
  if (error) fail("updating a status", error);
}

export async function setApplicationNote(id: string, note: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("job_applications").update({ note }).eq("id", id);
  if (error) fail("saving a note", error);
}

export async function deleteApplication(id: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("job_applications").delete().eq("id", id);
  if (error) fail("deleting an application", error);
}

/* ---------------------------------------------------------------- interviews */

export async function loadInterviews(): Promise<Interview[]> {
  const db = getDb();
  const { data, error } = await db
    .from("interviews")
    .select(INTERVIEW_COLUMNS)
    .order("interview_date", { ascending: true })
    .order("interview_time", { ascending: true });
  if (error) fail("reading interviews", error);
  return data.map(toInterview).sort(compareInterviews);
}

export async function createInterview(draft: InterviewDraft): Promise<Interview> {
  const db = getDb();
  const { data, error } = await db
    .from("interviews")
    .insert({
      application_id: draft.applicationId,
      name: draft.name,
      phone: draft.phone,
      interview_date: draft.date,
      interview_time: draft.time,
      note: draft.note,
    })
    .select(INTERVIEW_COLUMNS)
    .single();
  if (error || !data) fail("setting an interview", error);
  return toInterview(data);
}

export async function updateInterview(id: string, draft: InterviewDraft): Promise<Interview> {
  const db = getDb();
  const { data, error } = await db
    .from("interviews")
    .update({
      application_id: draft.applicationId,
      name: draft.name,
      phone: draft.phone,
      interview_date: draft.date,
      interview_time: draft.time,
      note: draft.note,
    })
    .eq("id", id)
    .select(INTERVIEW_COLUMNS)
    .single();
  if (error || !data) fail("updating an interview", error);
  return toInterview(data);
}

export async function deleteInterview(id: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("interviews").delete().eq("id", id);
  if (error) fail("deleting an interview", error);
}

/* ------------------------------------------------------------- text snippets */

export async function loadSnippets(): Promise<TextSnippet[]> {
  const db = getDb();
  const { data, error } = await db
    .from("text_snippets")
    .select(SNIPPET_COLUMNS)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) fail("reading the text pieces", error);
  return data.map(toSnippet);
}

/**
 * Add a piece at the end of the list. The new position is worked out from what
 * is stored rather than from what the page had on screen, so two tabs adding at
 * once can't land on the same number.
 */
export async function createSnippet(title: string, body: string): Promise<TextSnippet> {
  const db = getDb();
  const { data: last, error: readError } = await db
    .from("text_snippets")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  if (readError) fail("reading the text pieces", readError);

  const { data, error } = await db
    .from("text_snippets")
    .insert({ title, body, sort_order: (last[0]?.sort_order ?? -1) + 1 })
    .select(SNIPPET_COLUMNS)
    .single();
  if (error || !data) fail("adding a text piece", error);
  return toSnippet(data);
}

export async function updateSnippet(
  id: string,
  title: string,
  body: string,
): Promise<TextSnippet> {
  const db = getDb();
  const { data, error } = await db
    .from("text_snippets")
    .update({ title, body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(SNIPPET_COLUMNS)
    .single();
  if (error || !data) fail("saving a text piece", error);
  return toSnippet(data);
}

export async function deleteSnippet(id: string): Promise<void> {
  const db = getDb();
  const { error } = await db.from("text_snippets").delete().eq("id", id);
  if (error) fail("deleting a text piece", error);
}

/** Write back the positions of the rows a move actually changed. */
export async function reorderSnippets(
  ordered: readonly { id: string; sortOrder: number }[],
): Promise<void> {
  const db = getDb();
  const { data, error } = await db.from("text_snippets").select("id, sort_order");
  if (error) fail("reading positions", error);

  const stored = new Map(data.map((row) => [row.id, row.sort_order]));
  const changed = ordered.filter((snippet) => stored.get(snippet.id) !== snippet.sortOrder);
  if (changed.length === 0) return;

  const results = await Promise.all(
    changed.map((snippet) =>
      db.from("text_snippets").update({ sort_order: snippet.sortOrder }).eq("id", snippet.id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) fail("saving the new order", failed.error);
}

/* --------------------------------------------------------------------- page */

export type ApplicationsData = {
  applications: Application[];
  interviews: Interview[];
  snippets: TextSnippet[];
};

/** Everything the page shows, in one round of reads. */
export async function loadApplicationsPage(): Promise<ApplicationsData> {
  const [applications, interviews, snippets] = await Promise.all([
    loadApplications(),
    loadInterviews(),
    loadSnippets(),
  ]);
  return { applications, interviews, snippets: snippets.sort(compareSnippets) };
}
