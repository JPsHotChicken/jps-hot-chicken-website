"use server";

import { assertISODate, assertText, assertUuid, requireAdmin } from "@/lib/admin-guard";
import * as repo from "@/lib/applications-repo";
import {
  isApplicationStatus,
  isValidTime,
  type ApplicationStatus,
  type Interview,
  type InterviewDraft,
  type TextSnippet,
} from "@/lib/applications";

/**
 * Server Actions behind the Applications page.
 *
 * Every one re-checks the admin session and validates its own arguments — see
 * `admin-guard.ts` for why being reachable only from a protected page isn't the
 * same as being protected.
 */

/* --------------------------------------------------------------- validation */

function assertStatus(value: string): ApplicationStatus {
  if (!isApplicationStatus(value)) throw new Error(`Unknown status "${value}".`);
  return value;
}

function assertTime(value: string): string {
  const trimmed = value.trim();
  if (!isValidTime(trimmed)) throw new Error("A time has to look like 14:30.");
  return trimmed;
}

function assertInterview(draft: InterviewDraft): InterviewDraft {
  return {
    applicationId: draft.applicationId === null ? null : assertUuid(draft.applicationId, "Applicant"),
    name: assertText(draft.name, "Name", { max: 120, required: true }),
    phone: assertText(draft.phone, "Phone", { max: 40 }),
    date: assertISODate(draft.date, "Date"),
    time: assertTime(draft.time),
    note: assertText(draft.note, "Note", { max: 500 }),
  };
}

/* ------------------------------------------------------------- applications */

export async function setStatusAction(id: string, status: string): Promise<void> {
  await requireAdmin();
  await repo.setApplicationStatus(assertUuid(id, "Application"), assertStatus(status));
}

export async function setNoteAction(id: string, note: string): Promise<void> {
  await requireAdmin();
  await repo.setApplicationNote(
    assertUuid(id, "Application"),
    assertText(note, "Note", { max: 2000 }),
  );
}

export async function deleteApplicationAction(id: string): Promise<void> {
  await requireAdmin();
  await repo.deleteApplication(assertUuid(id, "Application"));
}

/* ---------------------------------------------------------------- interviews */

export async function createInterviewAction(draft: InterviewDraft): Promise<Interview> {
  await requireAdmin();
  return repo.createInterview(assertInterview(draft));
}

export async function updateInterviewAction(
  id: string,
  draft: InterviewDraft,
): Promise<Interview> {
  await requireAdmin();
  return repo.updateInterview(assertUuid(id, "Interview"), assertInterview(draft));
}

export async function deleteInterviewAction(id: string): Promise<void> {
  await requireAdmin();
  await repo.deleteInterview(assertUuid(id, "Interview"));
}

/* ------------------------------------------------------------- text snippets */

export async function createSnippetAction(title: string, body: string): Promise<TextSnippet> {
  await requireAdmin();
  return repo.createSnippet(
    assertText(title, "Title", { max: 120 }),
    assertText(body, "Text", { max: 5000, required: true }),
  );
}

export async function updateSnippetAction(
  id: string,
  title: string,
  body: string,
): Promise<TextSnippet> {
  await requireAdmin();
  return repo.updateSnippet(
    assertUuid(id, "Text piece"),
    assertText(title, "Title", { max: 120 }),
    assertText(body, "Text", { max: 5000, required: true }),
  );
}

export async function deleteSnippetAction(id: string): Promise<void> {
  await requireAdmin();
  await repo.deleteSnippet(assertUuid(id, "Text piece"));
}

export async function reorderSnippetsAction(
  ordered: readonly { id: string; sortOrder: number }[],
): Promise<void> {
  await requireAdmin();
  await repo.reorderSnippets(
    ordered.map(({ id, sortOrder }) => ({
      id: assertUuid(id, "Text piece"),
      sortOrder: Math.max(0, Math.trunc(sortOrder)),
    })),
  );
}

/* -------------------------------------------------------------------- reload */

/** Pull the database's version of the whole page back, after a failed save. */
export async function reloadApplicationsAction(): Promise<repo.ApplicationsData> {
  await requireAdmin();
  return repo.loadApplicationsPage();
}
