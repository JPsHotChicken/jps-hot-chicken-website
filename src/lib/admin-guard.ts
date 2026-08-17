import "server-only";

import { cookies } from "next/headers";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";

/**
 * The checks every admin Server Action starts with.
 *
 * A Server Action is a public POST endpoint — being rendered inside a protected
 * page proves nothing about who is calling it. So each one re-reads the session
 * cookie itself and validates its own arguments rather than trusting anything
 * that arrived with the request.
 */

export async function requireAdmin(): Promise<void> {
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    throw new Error("Not signed in.");
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertISODate(value: string, field: string): string {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a date in YYYY-MM-DD form.`);
  }
  return value;
}

export function assertUuid(value: string, field: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${field} is not a valid id.`);
  }
  return value;
}

/** Trim, require something left, and cap the length so a row can't be abused. */
export function assertText(value: string, field: string, { max = 200, required = false } = {}) {
  const trimmed = value.trim();
  if (required && !trimmed) throw new Error(`${field} is required.`);
  if (trimmed.length > max) throw new Error(`${field} must be ${max} characters or fewer.`);
  return trimmed;
}

/** A number inside a range, rounded to cents. Rejects text and infinities. */
export function assertNumber(
  value: number,
  field: string,
  { min = 0, max = Number.MAX_SAFE_INTEGER } = {},
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number.`);
  }
  if (value < min || value > max) {
    throw new Error(`${field} must be between ${min} and ${max}.`);
  }
  return Math.round(value * 100) / 100;
}
