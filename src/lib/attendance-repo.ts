import "server-only";

import { getDb } from "@/lib/supabase/server";
import type { AttendanceEmployee, AttendanceEntry } from "@/lib/attendance";

/** Every read and write behind the attendance tracker. */

const COLUMNS = "id, employee_id, employee_name, entry_date, entry_time, reason, created_at";

type Row = {
  id: string;
  employee_id: string | null;
  employee_name: string;
  entry_date: string;
  entry_time: string;
  reason: string;
  created_at: string;
};

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[attendance] ${context}: ${error?.message ?? "unknown error"}`);
}

function toEntry(row: Row): AttendanceEntry {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    date: row.entry_date,
    // Postgres hands back "16:30:00"; the page works in "16:30".
    time: row.entry_time.slice(0, 5),
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export async function loadAttendance(): Promise<{
  employees: AttendanceEmployee[];
  entries: AttendanceEntry[];
}> {
  const db = getDb();
  const [employees, entries] = await Promise.all([
    db.from("employees").select("id, name, active").order("name"),
    db
      .from("attendance_entries")
      .select(COLUMNS)
      .order("entry_date", { ascending: false })
      .order("entry_time", { ascending: false }),
  ]);
  if (employees.error) fail("load employees", employees.error);
  if (entries.error) fail("load entries", entries.error);
  return { employees: employees.data, entries: entries.data.map(toEntry) };
}

export async function insertEntry(entry: {
  employeeId: string;
  date: string;
  time: string;
  reason: string;
}): Promise<AttendanceEntry> {
  const db = getDb();
  const { data: person, error: personError } = await db
    .from("employees")
    .select("name")
    .eq("id", entry.employeeId)
    .maybeSingle();
  if (personError) fail("find employee", personError);
  if (!person) throw new Error("That employee is no longer on the roster.");

  const { data, error } = await db
    .from("attendance_entries")
    .insert({
      employee_id: entry.employeeId,
      employee_name: person.name,
      entry_date: entry.date,
      entry_time: entry.time,
      reason: entry.reason,
    })
    .select(COLUMNS)
    .single();
  if (error) fail("add entry", error);
  return toEntry(data);
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await getDb().from("attendance_entries").delete().eq("id", id);
  if (error) fail("delete entry", error);
}
