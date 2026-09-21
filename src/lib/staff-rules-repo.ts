import "server-only";

import { getDb } from "@/lib/supabase/server";
import {
  RULE_SLIDES,
  findRuleSlide,
  type RuleSignature,
  type RuleSlideId,
  type RulesProgress,
} from "@/lib/staff-rules";

/**
 * Sign-offs on the rules & regulations slides, one row per person per slide
 * version. Only signatures on a slide's *current* version count — an older one
 * is kept as the record of what was agreed to then, and otherwise ignored.
 */

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[staff-rules] ${context}: ${error?.message ?? "unknown error"}`);
}

const isCurrent = (row: { slide_id: string; slide_version: number }) =>
  findRuleSlide(row.slide_id)?.version === row.slide_version;

/** Everything this person has signed that still counts, in slide order. */
export async function listRuleSignatures(employeeId: string): Promise<RuleSignature[]> {
  const { data, error } = await getDb()
    .from("staff_rule_signatures")
    .select("slide_id, slide_version, signed_name, signed_at")
    .eq("employee_id", employeeId);

  if (error) fail("loading your signatures", error);

  const byId = new Map(data.filter(isCurrent).map((row) => [row.slide_id, row]));
  return RULE_SLIDES.flatMap((slide) => {
    const row = byId.get(slide.id);
    return row ? [{ slideId: slide.id, signedName: row.signed_name, signedAt: row.signed_at }] : [];
  });
}

/**
 * File a signature on a slide's current version. Signing the same one twice
 * keeps the first — the date on a sign-off shouldn't move because the page was
 * submitted again.
 */
export async function saveRuleSignature(
  employeeId: string,
  slideId: RuleSlideId,
  signedName: string,
): Promise<void> {
  const slide = findRuleSlide(slideId);
  if (!slide) throw new Error(`[staff-rules] unknown slide "${slideId}"`);

  const { error } = await getDb().from("staff_rule_signatures").upsert(
    {
      employee_id: employeeId,
      slide_id: slide.id,
      slide_version: slide.version,
      signed_name: signedName,
    },
    { onConflict: "employee_id,slide_id,slide_version", ignoreDuplicates: true },
  );
  if (error) fail("saving a signature", error);
}

/** Everybody's progress, keyed by employee id. Absent means nothing signed. */
export async function loadRulesProgress(): Promise<Record<string, RulesProgress>> {
  const { data, error } = await getDb()
    .from("staff_rule_signatures")
    .select("employee_id, slide_id, slide_version, signed_at");

  if (error) fail("loading rules sign-offs", error);

  const signedBy = new Map<string, Map<string, string>>();
  for (const row of data.filter(isCurrent)) {
    const slides = signedBy.get(row.employee_id) ?? new Map<string, string>();
    slides.set(row.slide_id, row.signed_at);
    signedBy.set(row.employee_id, slides);
  }

  return Object.fromEntries(
    [...signedBy].map(([employeeId, slides]) => {
      const complete = slides.size === RULE_SLIDES.length;
      const latest = [...slides.values()].sort().at(-1) ?? null;
      return [employeeId, { signed: slides.size, completedAt: complete ? latest : null }];
    }),
  );
}
