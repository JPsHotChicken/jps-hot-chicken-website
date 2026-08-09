/**
 * Minimal password gate for the owner-only admin dashboard.
 *
 * There is one user (the owner), so there is no user table — just a password
 * checked against an environment variable, and a signed, httpOnly cookie that
 * proves the check already happened.
 *
 * Everything here uses Web Crypto rather than `node:crypto` so the same code
 * runs in Server Components, Server Actions, and `proxy.ts`.
 */

export const SESSION_COOKIE = "jp_admin_session";

/** How long a login lasts before the owner has to sign in again. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

/**
 * Secret used to sign session cookies. Falls back to the admin password so the
 * owner only has to set one environment variable — a side effect being that
 * changing the password invalidates every existing session, which is what you
 * want anyway.
 */
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

/** Length-safe, content-constant-time string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/** True when the admin password is configured at all. */
export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

/**
 * Check a submitted password. Compares HMACs rather than the raw strings so the
 * comparison doesn't leak the password's length or a shared prefix.
 */
export async function verifyPassword(submitted: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD;
  // Fail closed: with no password set, nobody gets in.
  if (!expected) return false;
  const salt = "jp-admin-password";
  const [a, b] = await Promise.all([hmac(salt, submitted), hmac(salt, expected)]);
  return timingSafeEqual(a, b);
}

/** Mint a signed session token that expires `SESSION_MAX_AGE_SECONDS` from now. */
export async function createSessionToken(): Promise<string> {
  const secret = getSigningSecret();
  if (!secret) throw new Error("ADMIN_PASSWORD is not set — cannot create a session.");
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ exp: expiresAt })));
  return `${payload}.${await hmac(secret, payload)}`;
}

/** Verify a session token's signature and expiry. */
export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  const secret = getSigningSecret();
  if (!token || !secret) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  if (!timingSafeEqual(await hmac(secret, payload), signature)) return false;

  try {
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const { exp } = JSON.parse(decoded) as { exp?: number };
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}
