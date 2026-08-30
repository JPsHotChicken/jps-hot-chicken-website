/**
 * Session handling for the employee-facing schedule at `/staff`.
 *
 * Employees sign in with a password they chose themselves, held on their row in
 * `employees`. There is no environment variable and no account to set up: the
 * owner hands out a five digit setup code, the employee trades it once for a
 * password, and from then on the password is the whole sign-in.
 *
 * A successful sign in mints a signed, httpOnly cookie naming the employee,
 * which is what every later request is checked against. The setup flow gets a
 * second, short-lived cookie of the same construction, so the "create your
 * password" page can prove which code was just entered without trusting a form
 * field for it.
 *
 * The signature reuses the admin signing secret so nothing new has to be
 * configured. Web Crypto throughout, so this runs in `proxy.ts` as well as in
 * Server Components and Server Actions.
 */

export const STAFF_SESSION_COOKIE = "jp_staff_session";

/** Staff sessions last a fortnight — a shift worker shouldn't sign in daily. */
export const STAFF_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

/**
 * Bumping this signs every employee out at once: tokens carry the version they
 * were minted under, and anything that isn't the current one is refused. It went
 * to 2 when four digit codes gave way to passwords, so nobody kept a session
 * they'd got with a code that no longer exists.
 */
export const STAFF_SESSION_VERSION = 2;

/** How many failures from one address before sign-in is refused for a while. */
export const STAFF_MAX_ATTEMPTS = 8;
export const STAFF_ATTEMPT_WINDOW_MINUTES = 15;

/* ------------------------------------------------------------ setup tickets */

export const STAFF_SETUP_COOKIE = "jp_staff_setup";

/**
 * Long enough to pick a password and type it twice, short enough that a code
 * read out across the counter doesn't leave a way in on a shared phone.
 */
export const STAFF_SETUP_MAX_AGE_SECONDS = 15 * 60;

/** Digits in the code the owner reads out for a first sign-in. */
export const STAFF_SETUP_CODE_LENGTH = 5;

/** The shortest password an employee is allowed to choose. */
export const STAFF_PASSWORD_MIN_LENGTH = 5;

/** Guards the column's own limit, so an over-long password fails politely. */
export const STAFF_PASSWORD_MAX_LENGTH = 100;

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

/** True when a setup code is five digits and nothing else. */
export function isValidSetupCodeShape(code: string): boolean {
  return new RegExp(`^[0-9]{${STAFF_SETUP_CODE_LENGTH}}$`).test(code);
}

/**
 * Whether a password is one the employee is allowed to keep.
 *
 * Only length is checked, and it is checked on what will actually be stored:
 * the owner asked for a five character minimum and nothing more, so a password
 * of five spaces is rejected for being empty once trimmed rather than for
 * failing a rule nobody was told about.
 */
export function isValidPasswordShape(password: string): boolean {
  return (
    password.length >= STAFF_PASSWORD_MIN_LENGTH &&
    password.length <= STAFF_PASSWORD_MAX_LENGTH &&
    password.trim().length > 0
  );
}

/* ---------------------------------------------------------------- sessions */

type TokenPayload = { sub: string; exp: number; ver: number };

async function sign(secret: string, payload: TokenPayload): Promise<string> {
  const encoded = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${encoded}.${await hmac(secret, encoded)}`;
}

/** The payload a token proves, or `null` if it is missing, tampered with or expired. */
async function verify(token: string | undefined, version: number): Promise<string | null> {
  const secret = getSigningSecret();
  if (!token || !secret) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!timingSafeEqual(await hmac(secret, payload), signature)) return null;

  try {
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const { sub, exp, ver } = JSON.parse(decoded) as Partial<TokenPayload>;
    if (typeof sub !== "string" || typeof exp !== "number") return null;
    // A token minted before the version moved on is treated as expired, which
    // is how "sign everybody out" is done without a table of live sessions.
    if (ver !== version) return null;
    if (exp <= Date.now()) return null;
    return sub;
  } catch {
    return null;
  }
}

export async function createStaffSessionToken(employeeId: string): Promise<string> {
  const secret = getSigningSecret();
  if (!secret) throw new Error("ADMIN_PASSWORD is not set — cannot create a staff session.");
  return sign(secret, {
    sub: employeeId,
    exp: Date.now() + STAFF_SESSION_MAX_AGE_SECONDS * 1000,
    ver: STAFF_SESSION_VERSION,
  });
}

/**
 * The employee id a token proves, or `null`. Callers get an id rather than a
 * boolean so they cannot forget to ask *which* employee is signed in.
 */
export async function readStaffSession(token: string | undefined): Promise<string | null> {
  return verify(token, STAFF_SESSION_VERSION);
}

/* ------------------------------------------------------------------- setup */

/**
 * Proof that somebody just entered a particular employee's setup code. It is
 * deliberately a different version number from a session token, so a setup
 * ticket can never be presented as a sign-in.
 */
const STAFF_SETUP_VERSION = 100;

export async function createStaffSetupToken(employeeId: string): Promise<string> {
  const secret = getSigningSecret();
  if (!secret) throw new Error("ADMIN_PASSWORD is not set — cannot start staff setup.");
  return sign(secret, {
    sub: employeeId,
    exp: Date.now() + STAFF_SETUP_MAX_AGE_SECONDS * 1000,
    ver: STAFF_SETUP_VERSION,
  });
}

/** The employee whose code was entered, or `null` if the ticket is no good. */
export async function readStaffSetupToken(token: string | undefined): Promise<string | null> {
  return verify(token, STAFF_SETUP_VERSION);
}
