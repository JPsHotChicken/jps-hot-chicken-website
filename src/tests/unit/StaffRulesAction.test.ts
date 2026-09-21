import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Signing a rules slide, driven through the Server Action. The slideshow already
 * stops people skipping ahead or signing "asdf", but the action is a public
 * endpoint, so the same two rules are pinned down here where they matter.
 */

const repo = vi.hoisted(() => ({
  findEmployeeById: vi.fn(async () => ({ id: "e1", name: "Noah", group: "morning" as const })),
}));
const rules = vi.hoisted(() => ({
  listRuleSignatures: vi.fn(async () => [] as { slideId: string; signedName: string; signedAt: string }[]),
  saveRuleSignature: vi.fn(async () => {}),
}));

vi.mock("@/lib/staff-repo", () => repo);
vi.mock("@/lib/staff-rules-repo", () => rules);
vi.mock("@/lib/schedule-repo", () => ({ insertTimeOff: vi.fn() }));

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
  headers: async () => new Map(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { STAFF_SESSION_COOKIE, createStaffSessionToken } = await import("@/lib/staff-auth");
const { signRulesSlideAction } = await import("@/app/staff/actions");

const signature = (slideId: string) => ({
  slideId,
  signedName: "Noah Williams",
  signedAt: "2026-09-20T15:00:00Z",
});

beforeEach(async () => {
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  vi.clearAllMocks();
  jar.store.clear();
  jar.store.set(STAFF_SESSION_COOKIE, await createStaffSessionToken("e1"));
  rules.listRuleSignatures.mockResolvedValue([]);
});

describe("signRulesSlideAction", () => {
  it("files a signature that starts with the name on file", async () => {
    rules.listRuleSignatures
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([signature("write-ups")]);

    const result = await signRulesSlideAction("write-ups", "  Noah   Williams ");

    expect(rules.saveRuleSignature).toHaveBeenCalledWith("e1", "write-ups", "Noah Williams");
    expect(result).toEqual({ ok: true, signature: signature("write-ups") });
  });

  it("refuses somebody else's name, or random letters", async () => {
    const result = await signRulesSlideAction("write-ups", "Jordan Smith");

    expect(result.ok).toBe(false);
    expect(rules.saveRuleSignature).not.toHaveBeenCalled();
  });

  it("refuses a page while an earlier one is unsigned", async () => {
    rules.listRuleSignatures.mockResolvedValue([signature("write-ups")]);

    const result = await signRulesSlideAction("breaks", "Noah Williams");

    expect(result).toEqual({ ok: false, error: "Sign the pages before this one first." });
    expect(rules.saveRuleSignature).not.toHaveBeenCalled();
  });

  it("refuses a page that doesn't exist", async () => {
    const result = await signRulesSlideAction("made-up", "Noah Williams");

    expect(result.ok).toBe(false);
    expect(rules.saveRuleSignature).not.toHaveBeenCalled();
  });

  it("needs a signed-in employee", async () => {
    jar.store.clear();

    await expect(signRulesSlideAction("write-ups", "Noah Williams")).rejects.toThrow(
      "Not signed in.",
    );
  });
});
