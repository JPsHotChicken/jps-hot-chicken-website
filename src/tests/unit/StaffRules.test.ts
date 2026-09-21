import { describe, expect, it } from "vitest";

import { RULE_SLIDES, checkSignature, firstUnsignedIndex } from "@/lib/staff-rules";

describe("checkSignature", () => {
  it("accepts the first name on file followed by a last name", () => {
    expect(checkSignature("Noah Williams", "Noah")).toEqual({ ok: true, name: "Noah Williams" });
  });

  it("tidies spacing, and doesn't mind case, accents or a middle name", () => {
    expect(checkSignature("  noah   james  Williams ", "Noah")).toEqual({
      ok: true,
      name: "noah james Williams",
    });
    expect(checkSignature("Cydayne O'Neil", "Cydáyne").ok).toBe(true);
  });

  it("refuses random letters", () => {
    const result = checkSignature("asdf jkl", "Noah");
    expect(result.ok).toBe(false);
    // Says which name is on file, so a nickname on the roster gets noticed.
    expect(!result.ok && result.reason).toContain('"Noah"');
  });

  it("refuses a first name alone", () => {
    const result = checkSignature("Noah", "Noah");
    expect(!result.ok && result.reason).toMatch(/last name/);
  });

  it("refuses a last name that is only an initial", () => {
    const result = checkSignature("Noah W.", "Noah");
    expect(!result.ok && result.reason).toMatch(/not just an initial/);
  });

  it("refuses a first name that only starts the same way", () => {
    expect(checkSignature("No Williams", "Noah").ok).toBe(false);
    expect(checkSignature("Noahh Williams", "Noah").ok).toBe(false);
  });

  it("refuses numbers and symbols", () => {
    const result = checkSignature("Noah W1lliams", "Noah");
    expect(!result.ok && result.reason).toMatch(/letters only/);
  });

  it("checks only the first word of a longer name on file", () => {
    expect(checkSignature("Alex Morningside", "Alex Morning").ok).toBe(true);
  });

  it("refuses an empty signature", () => {
    expect(checkSignature("   ", "Noah").ok).toBe(false);
  });
});

describe("firstUnsignedIndex", () => {
  it("is the first slide not yet signed", () => {
    expect(firstUnsignedIndex(new Set())).toBe(0);
    expect(firstUnsignedIndex(new Set([RULE_SLIDES[0].id]))).toBe(1);
    // A later signature doesn't let anyone past an earlier gap.
    expect(firstUnsignedIndex(new Set([RULE_SLIDES[0].id, RULE_SLIDES[2].id]))).toBe(1);
  });

  it("is the slide count once everything is signed", () => {
    expect(firstUnsignedIndex(new Set(RULE_SLIDES.map((slide) => slide.id)))).toBe(
      RULE_SLIDES.length,
    );
  });
});
