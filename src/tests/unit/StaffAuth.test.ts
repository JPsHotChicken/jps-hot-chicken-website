import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  STAFF_PASSWORD_MAX_LENGTH,
  STAFF_SESSION_MAX_AGE_SECONDS,
  STAFF_SETUP_MAX_AGE_SECONDS,
  createStaffSessionToken,
  createStaffSetupToken,
  isValidPasswordShape,
  isValidSetupCodeShape,
  readStaffSession,
  readStaffSetupToken,
} from "@/lib/staff-auth";

describe("staff sign-in shapes", () => {
  it("only accepts five digits as a setup code", () => {
    expect(isValidSetupCodeShape("12345")).toBe(true);
    // Leading zeros are real codes, not numbers that lost a digit.
    expect(isValidSetupCodeShape("00042")).toBe(true);
    expect(isValidSetupCodeShape("1234")).toBe(false);
    expect(isValidSetupCodeShape("123456")).toBe(false);
    expect(isValidSetupCodeShape("1234a")).toBe(false);
    expect(isValidSetupCodeShape(" 12345")).toBe(false);
    expect(isValidSetupCodeShape("")).toBe(false);
  });

  it("holds passwords to five characters and nothing else", () => {
    expect(isValidPasswordShape("hotsauce")).toBe(true);
    expect(isValidPasswordShape("12345")).toBe(true);
    // Five characters is the whole rule — no letters or symbols demanded.
    expect(isValidPasswordShape("!!!!!")).toBe(true);
    expect(isValidPasswordShape("four")).toBe(false);
    expect(isValidPasswordShape("")).toBe(false);
    // Five spaces are five characters, but nobody could type them back.
    expect(isValidPasswordShape("     ")).toBe(false);
    expect(isValidPasswordShape("a".repeat(STAFF_PASSWORD_MAX_LENGTH))).toBe(true);
    expect(isValidPasswordShape("a".repeat(STAFF_PASSWORD_MAX_LENGTH + 1))).toBe(false);
  });
});

describe("staff session token", () => {
  beforeEach(() => {
    process.env.ADMIN_SESSION_SECRET = "test-secret";
  });

  afterEach(() => {
    delete process.env.ADMIN_SESSION_SECRET;
    vi.useRealTimers();
  });

  it("names the employee it was minted for", async () => {
    expect(await readStaffSession(await createStaffSessionToken("employee-1"))).toBe("employee-1");
  });

  it("refuses a token that has been tampered with", async () => {
    const token = await createStaffSessionToken("employee-1");
    const [payload, signature] = token.split(".");

    expect(await readStaffSession(`${payload}x.${signature}`)).toBeNull();
    expect(await readStaffSession(`${payload}.${signature}x`)).toBeNull();
    expect(await readStaffSession(payload)).toBeNull();
    expect(await readStaffSession(undefined)).toBeNull();
  });

  it("expires after a fortnight", async () => {
    vi.useFakeTimers();
    const token = await createStaffSessionToken("employee-1");

    vi.advanceTimersByTime((STAFF_SESSION_MAX_AGE_SECONDS - 60) * 1000);
    expect(await readStaffSession(token)).toBe("employee-1");

    vi.advanceTimersByTime(120 * 1000);
    expect(await readStaffSession(token)).toBeNull();
  });

  /**
   * The whole mechanism for signing every employee out at once: a token minted
   * under an older version is refused, so bumping the version empties every
   * session without a table of live ones to clear.
   */
  it("refuses a session minted before the version moved on", async () => {
    const stale = await signPayloadLikeAnOlderBuild({
      sub: "employee-1",
      exp: Date.now() + 60_000,
    });

    expect(await readStaffSession(stale)).toBeNull();
  });

  it("won't take a setup ticket as a sign-in", async () => {
    const ticket = await createStaffSetupToken("employee-1");

    expect(await readStaffSetupToken(ticket)).toBe("employee-1");
    // Same shape, same secret — only the version keeps them apart.
    expect(await readStaffSession(ticket)).toBeNull();
  });

  it("won't take a session as a setup ticket", async () => {
    expect(await readStaffSetupToken(await createStaffSessionToken("employee-1"))).toBeNull();
  });

  it("lets a setup ticket go stale quickly", async () => {
    vi.useFakeTimers();
    const ticket = await createStaffSetupToken("employee-1");

    vi.advanceTimersByTime((STAFF_SETUP_MAX_AGE_SECONDS + 1) * 1000);
    expect(await readStaffSetupToken(ticket)).toBeNull();
  });
});

/**
 * A token exactly as the four-digit-code build wrote them: correctly signed with
 * the same secret, but with no version field at all.
 */
async function signPayloadLikeAnOlderBuild(payload: { sub: string; exp: number }): Promise<string> {
  const encoded = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.ADMIN_SESSION_SECRET!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  return `${encoded}.${base64Url(new Uint8Array(signature))}`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
