import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What `setStaffPassword` actually asks the database to write.
 *
 * This is the one place the setup code is spent, and the expiry only holds if
 * it happens in the *same* update as the password — so the payload itself is
 * worth pinning down rather than trusting the two to stay together.
 */

const update = vi.hoisted(() => vi.fn());
const eq = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  getDb: () => ({ from: () => ({ update }) }),
}));

const { setStaffPassword, PasswordTakenError } = await import("@/lib/staff-repo");

/** The single object handed to `.update()`. */
function payload(): Record<string, unknown> {
  return update.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  eq.mockResolvedValue({ error: null });
  update.mockReturnValue({ eq });
});

describe("setStaffPassword", () => {
  it("stores the password and expires the setup code in one write", async () => {
    await setStaffPassword("e1", "hotsauce");

    expect(update).toHaveBeenCalledTimes(1);
    expect(payload()).toMatchObject({ staff_password: "hotsauce", setup_code: null });
    expect(eq).toHaveBeenCalledWith("id", "e1");
  });

  it("stamps when the password was set", async () => {
    await setStaffPassword("e1", "hotsauce");

    expect(typeof payload().password_set_at).toBe("string");
    expect(Number.isNaN(Date.parse(payload().password_set_at as string))).toBe(false);
  });

  /**
   * One statement means one outcome: a password refused for being somebody
   * else's takes the code-clearing down with it, so the employee still has a
   * working code to try a different password with.
   */
  it("raises a taken password rather than a raw database error", async () => {
    eq.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });

    await expect(setStaffPassword("e1", "hotsauce")).rejects.toBeInstanceOf(PasswordTakenError);
  });

  it("passes other database failures through", async () => {
    eq.mockResolvedValue({ error: { code: "08006", message: "connection failure" } });

    await expect(setStaffPassword("e1", "hotsauce")).rejects.toThrow(/connection failure/);
  });
});
