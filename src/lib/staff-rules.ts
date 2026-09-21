/**
 * The rules & regulations slides at the top of `/staff`, and the check a typed
 * signature has to pass before a slide counts as signed.
 *
 * What each slide says lives in `components/staff/RulesSlideshow.tsx`; this is
 * the list of them, in order, and nothing here reaches for the server, so the
 * browser and the Server Action run the very same check.
 *
 * **Changing a slide's wording?** Bump its `version`. Everybody is then asked to
 * sign that slide again, and what they signed before stays in the database as
 * the record of the earlier wording. Adding a slide works the same way: it
 * starts unsigned for everyone. Reordering is safe — signatures are filed by
 * `id`, not by position.
 */
export const RULE_SLIDES = [
  { id: "write-ups", version: 1, title: "Write-ups" },
  { id: "phones", version: 1, title: "Phones" },
  { id: "breaks", version: 1, title: "Breaks" },
  { id: "sign-off", version: 1, title: "Sign-off" },
] as const;

export type RuleSlideId = (typeof RULE_SLIDES)[number]["id"];

export type RuleSignature = {
  slideId: RuleSlideId;
  signedName: string;
  signedAt: string;
};

/** How far one person has got through the slides, for Staff management. */
export type RulesProgress = {
  signed: number;
  /** When the last slide was signed, once every slide is. */
  completedAt: string | null;
};

/** Longest signature stored — matches the check on the database column. */
export const SIGNATURE_MAX_LENGTH = 120;

export function findRuleSlide(id: string) {
  return RULE_SLIDES.find((slide) => slide.id === id);
}

/**
 * Position of the first slide still to sign, or `RULE_SLIDES.length` once every
 * one is. Nobody can get past this slide until they have signed it.
 */
export function firstUnsignedIndex(signedIds: ReadonlySet<string>): number {
  const index = RULE_SLIDES.findIndex((slide) => !signedIds.has(slide.id));
  return index === -1 ? RULE_SLIDES.length : index;
}

/** A word as it is compared: no accents, no case, letters only. */
function comparable(word: string): string {
  return word
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}]/gu, "");
}

export type SignatureCheck = { ok: true; name: string } | { ok: false; reason: string };

/**
 * Whether what somebody typed will do as their signature.
 *
 * The roster only holds a first name for most people, so that is what can be
 * checked: the signature has to *start* with the first name on file, which is
 * what stops "asdf" getting anyone through. After it there has to be a last
 * name written out — more than an initial. Middle names are fine.
 *
 * When the first name doesn't match, the reason says which name is on file.
 * They can see it at the top of their own page anyway, and it is what tells
 * somebody filed under a nickname to go and ask for it to be fixed.
 */
export function checkSignature(typed: string, nameOnFile: string): SignatureCheck {
  const name = typed.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, reason: "Type your full name to sign." };

  if (name.length > SIGNATURE_MAX_LENGTH) {
    return { ok: false, reason: "That's too long for a name." };
  }
  if (/[^\p{L}\p{M}\s'’.-]/u.test(name)) {
    return { ok: false, reason: "Use letters only — no numbers or symbols." };
  }

  const firstOnFile = nameOnFile.trim().split(/\s+/)[0] ?? "";
  const words = name.split(" ");

  if (!firstOnFile || comparable(words[0]) !== comparable(firstOnFile)) {
    return {
      ok: false,
      reason: `Start with your first name as it's written on your ID. We have you down as "${firstOnFile}" — if that's not right, ask a manager to fix it.`,
    };
  }
  if (words.length < 2) {
    return {
      ok: false,
      reason: "Add your last name too — sign with your full name, as it's written on your ID.",
    };
  }
  if (comparable(words[words.length - 1]).length < 2) {
    return { ok: false, reason: "Write your last name out in full, not just an initial." };
  }

  return { ok: true, name };
}

/**
 * "Sep 20, 2026" in the restaurant's time zone. Fixed rather than taken from
 * wherever the code runs, so the server (UTC on Vercel) and the phone agree.
 */
export function formatSignedDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}
