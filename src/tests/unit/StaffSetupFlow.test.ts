import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two steps of a first sign-in, driven through the Server Actions.
 *
 * The repository and Next's cookie jar are stubbed, because what is worth
 * pinning down here is the order of the checks — that a password cannot be set
 * without a ticket, that the ticket is spent once used, and that a signed-in
 * cookie only appears at the very end.
 */

const repo = vi.hoisted(() => ({
  isThrottled: vi.fn(() => false),
  recentFailedAttempts: vi.fn(async () => 0),
  recordLoginAttempt: vi.fn(async () => {}),
  findEmployeeBySetupCode: vi.fn(async () => null as { id: string; name: string } | null),
  findEmployeeByPassword: vi.fn(async () => null as { id: string; name: string } | null),
  setStaffPassword: vi.fn(async () => "unused"),
}));

class PasswordTakenError extends Error {
  constructor() {
    super("That password is already in use. Please choose a different one.");
    this.name = "PasswordTakenError";
  }
}

vi.mock("@/lib/staff-repo", () => ({ ...repo, PasswordTakenError }));
vi.mock("@/lib/schedule-repo", () => ({ insertTimeOff: vi.fn() }));

/** A stand-in cookie jar that records what the action set and deleted. */
const jar = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    get: (name: string) => (store.has(name) ? { value: store.get(name)! } : undefined),
    set: (name: string, value: string) => void store.set(name, value),
    delete: (name: string) => void store.delete(name),
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => jar,
  headers: async () => new Map([["x-forwarded-for", "203.0.113.9"]]),
}));

/** `redirect()` throws in Next, which is how it stops the action. */
class RedirectError extends Error {
  constructor(public to: string) {
    super(`redirect:${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

const { STAFF_SESSION_COOKIE, STAFF_SETUP_COOKIE } = await import("@/lib/staff-auth");
const { staffCreatePassword, staffVerifySetupCode } = await import("@/app/staff/actions");

/** Run an action that is expected to redirect, and say where to. */
async function redirectsTo(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (cause) {
    if (cause instanceof RedirectError) return cause.to;
    throw cause;
  }
  throw new Error("Expected a redirect, but the action returned normally.");
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  jar.store.clear();
  vi.clearAllMocks();
  repo.isThrottled.mockReturnValue(false);
  repo.recentFailedAttempts.mockResolvedValue(0);
});

describe("step one: the setup code", () => {
  it("takes a matching code and moves on to choosing a password", async () => {
    repo.findEmployeeBySetupCode.mockResolvedValue({ id: "e1", name: "Alex Morning" });

    const to = await redirectsTo(() => staffVerifySetupCode({}, form({ code: "12345" })));

    expect(to).toBe("/staff/setup/password");
    expect(jar.store.has(STAFF_SETUP_COOKIE)).toBe(true);
    // A ticket is not a sign-in — the schedule is still shut until a password exists.
    expect(jar.store.has(STAFF_SESSION_COOKIE)).toBe(false);
    expect(repo.recordLoginAttempt).toHaveBeenCalledWith("203.0.113.9", true);
  });

  it("refuses a code that belongs to nobody, and hands out no ticket", async () => {
    repo.findEmployeeBySetupCode.mockResolvedValue(null);

    const state = await staffVerifySetupCode({}, form({ code: "12345" }));

    expect(state.error).toMatch(/doesn't match anyone/);
    expect(jar.store.size).toBe(0);
    expect(repo.recordLoginAttempt).toHaveBeenCalledWith("203.0.113.9", false);
  });

  it("won't go to the database for something that isn't five digits", async () => {
    const state = await staffVerifySetupCode({}, form({ code: "1234" }));

    expect(state.error).toMatch(/five digit code/);
    expect(repo.findEmployeeBySetupCode).not.toHaveBeenCalled();
  });

  it("stops at the throttle before checking anything", async () => {
    repo.isThrottled.mockReturnValue(true);

    const state = await staffVerifySetupCode({}, form({ code: "12345" }));

    expect(state.error).toMatch(/Too many/);
    expect(repo.findEmployeeBySetupCode).not.toHaveBeenCalled();
  });
});

describe("step two: choosing a password", () => {
  /** Walk step one so the jar holds a real, signed ticket. */
  async function withTicket() {
    repo.findEmployeeBySetupCode.mockResolvedValue({ id: "e1", name: "Alex Morning" });
    await redirectsTo(() => staffVerifySetupCode({}, form({ code: "12345" })));
    vi.clearAllMocks();
  }

  it("saves the password, spends the ticket and signs them in", async () => {
    await withTicket();

    const to = await redirectsTo(() =>
      staffCreatePassword({}, form({ password: "hotsauce", confirm: "hotsauce" })),
    );

    expect(repo.setStaffPassword).toHaveBeenCalledWith("e1", "hotsauce");
    expect(to).toBe("/staff");
    expect(jar.store.has(STAFF_SESSION_COOKIE)).toBe(true);
    // Spent, so the same code cannot be replayed into a second password.
    expect(jar.store.has(STAFF_SETUP_COOKIE)).toBe(false);
  });

  it("refuses outright when there is no ticket", async () => {
    const state = await staffCreatePassword({}, form({ password: "hotsauce", confirm: "hotsauce" }));

    expect(state.error).toMatch(/took too long/);
    expect(repo.setStaffPassword).not.toHaveBeenCalled();
    expect(jar.store.has(STAFF_SESSION_COOKIE)).toBe(false);
  });

  it("holds out for five characters", async () => {
    await withTicket();

    const state = await staffCreatePassword({}, form({ password: "four", confirm: "four" }));

    expect(state.error).toMatch(/at least 5 characters/);
    expect(repo.setStaffPassword).not.toHaveBeenCalled();
  });

  it("wants the same password twice", async () => {
    await withTicket();

    const state = await staffCreatePassword({}, form({ password: "hotsauce", confirm: "hotsalsa" }));

    expect(state.error).toMatch(/don't match/);
    expect(repo.setStaffPassword).not.toHaveBeenCalled();
  });

  it("passes on a clash, since the password is what says who is signing in", async () => {
    await withTicket();
    repo.setStaffPassword.mockRejectedValue(new PasswordTakenError());

    const state = await staffCreatePassword({}, form({ password: "hotsauce", confirm: "hotsauce" }));

    expect(state.error).toMatch(/already in use/);
    // A clash must not leave them signed in as somebody else.
    expect(jar.store.has(STAFF_SESSION_COOKIE)).toBe(false);
  });
});
