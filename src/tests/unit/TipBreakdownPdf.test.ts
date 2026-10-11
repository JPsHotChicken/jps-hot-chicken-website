import { describe, expect, it } from "vitest";

import { buildTipBreakdownPdf, splitTips, tipBreakdownFilename } from "@/lib/tip-breakdown-pdf";

describe("the tips breakdown", () => {
  it("splits the total so cash is about 9% of online, to the cent", () => {
    for (const total of [263.17, 1840.55, 0.01, 99.99, 4321]) {
      for (const seed of ["a", "2026-08-10|2026-08-15", "x|y|1"]) {
        const { cash, online, total: footed } = splitTips(total, seed);
        expect(Math.round((cash + online) * 100)).toBe(Math.round(total * 100));
        expect(footed).toBe(total);
        if (total >= 10) {
          expect(cash / online).toBeGreaterThan(0.084);
          expect(cash / online).toBeLessThan(0.096);
        }
      }
    }
  });

  it("gives the same split for the same week every time", () => {
    expect(splitTips(263.17, "w1")).toEqual(splitTips(263.17, "w1"));
  });

  it("carries the title, the date range and the three figures", async () => {
    const doc = await buildTipBreakdownPdf({
      tips: 263.17,
      period: "Aug 10 – Aug 15, 2026",
      from: "2026-08-10",
      to: "2026-08-15",
      preparedAt: new Date("2026-08-16T12:00:00Z"),
    });
    const text = doc.output();
    const split = splitTips(263.17, "2026-08-10|2026-08-15|26317");
    const fmt = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2 });

    expect(doc.getNumberOfPages()).toBe(1);
    expect(text).toContain("Tips Breakdown");
    expect(text).toContain("Aug 10");
    expect(text).toContain("CASH TIPS");
    expect(text).toContain("ONLINE TIPS");
    expect(text).toContain("TOTAL TIPS");
    expect(text).toContain(fmt(split.cash));
    expect(text).toContain(fmt(split.online));
    expect(text).toContain("263.17");
  });

  it("names the file after the period", () => {
    expect(tipBreakdownFilename("2026-08-10", "2026-08-15")).toBe(
      "jp-tip-breakdown-2026-08-10-to-2026-08-15.pdf",
    );
  });
});
