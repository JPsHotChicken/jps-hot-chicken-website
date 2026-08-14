/**
 * Session handling for the employee-facing schedule at `/staff`.
 *
 * Employees sign in with a four digit code held on their row in `employees` —
 * there is no environment variable and no account to set up. A successful sign
 * in mints a signed, httpOnly cookie naming the employee, which is what every
 * later request is checked against.
 *
 * The signature reuses the admin signing secret so nothing new has to be
 * configured. Web Crypto throughout, so this runs in `proxy.ts` as well as in
 * Server Components and Server Actions.
 */

export const STAFF_SESSION_COOKIE = "jp_staff_session";

/** Staff sessions last a fortnight — a shift worker shouldn't sign in daily. */
export const STAFF_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

/** How many failures from one address before sign-in is refused for a while. */
export const STAFF_MAX_ATTEMPTS = 8;
export const STAFF_ATTEMPT_WINDOW_MINUTES = 15;

function getSigningSecret(): string | undefined {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/** True when a four digit code is exactly that and nothing else. */
export function isValidCodeShape(code: string): boolean {
  return /^[0-9]{4}$/.test(code);
}

export async function createStaffSessionToken(employeeId: string): Promise<string> {
  const secret = getSigningSecret();
  if (!secret) throw new Error("ADMIN_PASSWORD is not set — cannot create a staff session.");
  const expiresAt = Date.now() + STAFF_SESSION_MAX_AGE_SECONDS * 1000;
  const payload = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ sub: employeeId, exp: expiresAt })),
  );
  return `${payload}.${await hmac(secret, payload)}`;
}

/**
 * The employee id a token proves, or `null` if it is missing, tampered with or
 * expired. Callers get an id rather than a boolean so they cannot forget to ask
 * *which* employee is signed in.
 */
export async function readStaffSession(token: string | undefined): Promise<string | null> {
  const secret = getSigningSecret();
  if (!token || !secret) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!timingSafeEqual(await hmac(secret, payload), signature)) return null;

  try {
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const { sub, exp } = JSON.parse(decoded) as { sub?: string; exp?: number };
    if (typeof sub !== "string" || typeof exp !== "number" || exp <= Date.now()) return null;
    return sub;
  } catch {
    return null;
  }
}
