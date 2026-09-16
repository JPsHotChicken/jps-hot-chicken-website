/**
 * Reading what the model sends back.
 *
 * Structured output makes a malformed reply rare, but a reply cut off at the
 * token limit or wrapped in a code fence is still possible, and nothing
 * unchecked goes into the database. These are the pieces every caller needs to
 * take a reply apart safely; what each field is allowed to hold is the caller's
 * own business.
 */

/**
 * Raised with a sentence already fit to show the owner. Whatever goes wrong
 * inside a model call — a rejected key, a rate limit, a file that can't be
 * opened — arrives at the page as one of these.
 */
export class GenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerationError";
  }
}

/** Raised when a reply isn't the JSON that was asked for. Callers retry once. */
export class GenerationFormatError extends Error {
  constructor(readonly detail: string) {
    super(`The reply wasn't in the expected format: ${detail}`);
    this.name = "GenerationFormatError";
  }
}

/** The reply as a JSON object, tolerating a markdown fence around it. */
export function readReplyObject(text: string): Record<string, unknown> {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  let data: unknown;
  try {
    data = JSON.parse(unfenced);
  } catch {
    throw new GenerationFormatError("not valid JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new GenerationFormatError("not a JSON object");
  }
  return data as Record<string, unknown>;
}

/** A string, tidied and cut to length. Anything that isn't one reads as blank. */
export const clip = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max).trim() : "";

/** A list of non-empty strings, cut to `max` entries. */
export function stringList(value: unknown, field: string, max: number): string[] {
  if (!Array.isArray(value)) throw new GenerationFormatError(`${field} is not a list`);
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, max);
}

/** A string that has to be there. */
export function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new GenerationFormatError(`${field} is missing`);
  }
  return value.trim();
}

/**
 * A number the reply may leave out, pinned to a sane range.
 *
 * Out-of-range and unreadable both become null rather than an error: a field
 * the model guessed badly at is one for somebody to fill in, not a reason to
 * throw away everything else it read correctly.
 */
export function optionalNumber(
  value: unknown,
  { min = 0, max = 1_000_000, places = 4 }: { min?: number; max?: number; places?: number } = {},
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  const factor = 10 ** places;
  return Math.round(parsed * factor) / factor;
}

/** A whole number in a range, or `fallback` when the reply's is unusable. */
export function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}
