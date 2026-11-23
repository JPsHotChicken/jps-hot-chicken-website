"use server";

import { assertISODate, assertText, assertUuid, requireAdmin } from "@/lib/admin-guard";
import * as repo from "@/lib/attendance-repo";
import { MAX_REASON, type AttendanceDraft, type AttendanceEntry } from "@/lib/attendance";

/**
 * Server Actions behind the attendance tracker. Each re-checks the admin session
 * and validates its own arguments — see `admin-guard.ts` for why.
 */

function assertTime(value: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("Time must be a time of day.");
  }
  return value;
}

export async function addEntryAction(draft: AttendanceDraft): Promise<AttendanceEntry> {
  await requireAdmin();
  return repo.insertEntry({
    employeeId: assertUuid(draft.employeeId, "Employee"),
    date: assertISODate(draft.date, "Date"),
    time: assertTime(draft.time),
    reason: assertText(draft.reason, "Reason", { max: MAX_REASON, required: true }),
  });
}

export async function deleteEntryAction(id: string): Promise<void> {
  await requireAdmin();
  await repo.deleteEntry(assertUuid(id, "Entry"));
}
