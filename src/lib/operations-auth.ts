/**
 * Access code gate for the operations area at `/operations`.
 *
 * One shared code for the whole crew rather than a code each: these are the
 * tools of running a shift, and who is holding the tablet is not something any
 * of them needs to know. A correct code mints a signed, httpOnly cookie, and
 * that cookie — not the code — is what every later request is checked against.
 *
 * Web Crypto throughout, matching `admin-auth` and `staff-auth`, so the same
 * code runs in `proxy.ts` as well as in Server Components and Server Actions.
 */

export const OPERATIONS_SESSION_COOKIE = "jp_operations_session";

/**
 * Roughly a trading day, so a tablet signed in before open is still signed in
 * at close but not still signed in a week later.
 */
export const OPERATIONS_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

/** How many digits the code has, and how many boxes the sign-in draws. */
export const OPERATIONS_CODE_LENGTH = 4;

/**
 * The code the crew types in.
 *
 * `OPERATIONS_CODE` overrides it, which is how it gets changed without a deploy
 * — set it in Vercel and redeploy nothing. An override must be four digits too,
 * or the sign-in boxes can't spell it. Unlike the admin password this has a
 * default, so the area works the moment it ships.
 */
function getAccessCode(): string {
  return process.env.OPERATIONS_CODE?.trim() || "2670";
}

/**
 * Secret used to sign session cookies. Prefers whatever already signs the admin
 * and staff cookies; falls back to the access code so the gate needs nothing
 * configured to work — with the useful side effect that changing the code signs
 * everybody out.
 */
function getSigningSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || getAccessCode();
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

/** True when a submitted code is four digits and nothing else. */
export function isValidCodeShape(code: string): boolean {
  return new RegExp(`^[0-9]{${OPERATIONS_CODE_LENGTH}}$`).test(code);
}

/**
 * Check a typed code. Compares HMACs rather than the digits themselves so the
 * comparison doesn't leak a shared prefix to anyone timing it.
 */
export async function verifyOperationsCode(submitted: string): Promise<boolean> {
  const salt = "jp-operations-code";
  const [a, b] = await Promise.all([hmac(salt, submitted), hmac(salt, getAccessCode())]);
  return timingSafeEqual(a, b);
}

/** Mint a signed session token that expires `OPERATIONS_SESSION_MAX_AGE_SECONDS` from now. */
export async function createOperationsSessionToken(): Promise<string> {
  const expiresAt = Date.now() + OPERATIONS_SESSION_MAX_AGE_SECONDS * 1000;
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ exp: expiresAt })));
  return `${payload}.${await hmac(getSigningSecret(), payload)}`;
}

/** Verify a session token's signature and expiry. */
export async function verifyOperationsSessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  if (!timingSafeEqual(await hmac(getSigningSecret(), payload), signature)) return false;

  try {
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const { exp } = JSON.parse(decoded) as { exp?: number };
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}
