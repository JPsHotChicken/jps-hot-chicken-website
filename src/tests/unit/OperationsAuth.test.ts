import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  OPERATIONS_SESSION_MAX_AGE_SECONDS,
  createOperationsSessionToken,
  isValidCodeShape,
  verifyOperationsCode,
  verifyOperationsSessionToken,
} from "@/lib/operations-auth";

describe("operations access code", () => {
  afterEach(() => {
    delete process.env.OPERATIONS_CODE;
    vi.useRealTimers();
  });

  it("accepts the built-in code and rejects everything else", async () => {
    expect(await verifyOperationsCode("2670")).toBe(true);
    expect(await verifyOperationsCode("2671")).toBe(false);
    expect(await verifyOperationsCode("")).toBe(false);
    // A correct prefix must not pass — the comparison is on whole HMACs.
    expect(await verifyOperationsCode("267")).toBe(false);
    expect(await verifyOperationsCode("26700")).toBe(false);
  });

  it("lets OPERATIONS_CODE override the built-in code", async () => {
    process.env.OPERATIONS_CODE = "1234";
    expect(await verifyOperationsCode("1234")).toBe(true);
    expect(await verifyOperationsCode("2670")).toBe(false);
  });

  it("only accepts four digits as a code shape", () => {
    expect(isValidCodeShape("2670")).toBe(true);
    expect(isValidCodeShape("267")).toBe(false);
    expect(isValidCodeShape("26701")).toBe(false);
    expect(isValidCodeShape("26a0")).toBe(false);
    expect(isValidCodeShape(" 2670")).toBe(false);
  });
});

describe("operations session token", () => {
  beforeEach(() => {
    // The token is signed with the admin secret when there is one, so pin it.
    process.env.ADMIN_SESSION_SECRET = "test-secret";
  });

  afterEach(() => {
    delete process.env.ADMIN_SESSION_SECRET;
    vi.useRealTimers();
  });

  it("round-trips a freshly minted token", async () => {
    expect(await verifyOperationsSessionToken(await createOperationsSessionToken())).toBe(true);
  });

  it("rejects a missing, malformed, or tampered token", async () => {
    const token = await createOperationsSessionToken();
    const [payload, signature] = token.split(".");

    expect(await verifyOperationsSessionToken(undefined)).toBe(false);
    expect(await verifyOperationsSessionToken("")).toBe(false);
    expect(await verifyOperationsSessionToken(payload)).toBe(false);
    expect(await verifyOperationsSessionToken(`${payload}.${signature}x`)).toBe(false);
    // A payload swapped for one claiming a later expiry no longer matches.
    const forged = btoa(JSON.stringify({ exp: Date.now() + 999_999_999 }));
    expect(await verifyOperationsSessionToken(`${forged}.${signature}`)).toBe(false);
  });

  it("rejects a token once it has expired", async () => {
    const token = await createOperationsSessionToken();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (OPERATIONS_SESSION_MAX_AGE_SECONDS + 60) * 1000);
    expect(await verifyOperationsSessionToken(token)).toBe(false);
  });

  it("stops honouring a token signed under a different secret", async () => {
    const token = await createOperationsSessionToken();
    process.env.ADMIN_SESSION_SECRET = "rotated";
    expect(await verifyOperationsSessionToken(token)).toBe(false);
  });
});
