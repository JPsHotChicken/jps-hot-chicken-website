import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

/**
 * Supabase client for the admin dashboard.
 *
 * The dashboard authenticates with `ADMIN_PASSWORD` and a signed cookie, not
 * Supabase Auth, so there is no per-user token to forward. Every table has RLS
 * enabled with no policies; this client uses the service role, which bypasses
 * RLS, and is the only thing that can read or write scheduler data.
 *
 * The `server-only` import above is the guard that matters: importing this file
 * from a Client Component is a build error, so the service key can never be
 * bundled into anything the browser downloads.
 */

export type Db = SupabaseClient<Database>;

let client: Db | null = null;

/** Thrown when the environment isn't configured, so callers can show a real message. */
export class SupabaseNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`Supabase is not configured — missing ${missing.join(" and ")}.`);
    this.name = "SupabaseNotConfiguredError";
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getDb(): Db {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [
    !url && "SUPABASE_URL",
    !key && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter((value): value is string => typeof value === "string");

  if (!url || !key) throw new SupabaseNotConfiguredError(missing);

  client = createClient<Database>(url, key, {
    // No user sessions to persist or refresh — every call is service-role.
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
