/**
 * Ad-click attribution capture.
 *
 * Google passes a click identifier on every paid click. Which one you get
 * depends on the platform, and this is the part that quietly loses conversions:
 *
 *   gclid   — the standard one, on most web clicks.
 *   gbraid  — iOS app-to-web clicks, where Apple's privacy rules strip gclid.
 *   wbraid  — iOS web-to-web clicks, same reason.
 *
 * Capture only gclid and you lose a meaningful share of iOS conversions, which
 * for a restaurant — where most searches are on a phone — is most of the traffic.
 * So all three are captured, always.
 *
 * The identifier arrives on the landing URL but the conversion may happen several
 * clicks later, so it is stashed in sessionStorage and read back at submit time.
 * sessionStorage (not localStorage) is deliberate: attribution belongs to this
 * visit, and a gclid from a paid click three weeks ago should not be stapled onto
 * a lead that arrived today by typing the domain in directly.
 */

/** Click identifiers, in the order Google Ads prefers them. */
export const CLICK_ID_KEYS = ["gclid", "gbraid", "wbraid"] as const;

/** Standard campaign parameters. */
export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export const ATTRIBUTION_KEYS = [...CLICK_ID_KEYS, ...UTM_KEYS] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];
export type Attribution = Partial<Record<AttributionKey, string>>;

const STORAGE_KEY = "jp_attribution";

/** Longest value we will store, to keep a hostile URL from filling storage. */
const MAX_VALUE_LENGTH = 512;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Read attribution parameters out of a query string.
 *
 * Exported separately from the storage helpers so it can be unit tested without
 * a DOM.
 */
export function parseAttribution(search: string): Attribution {
  const params = new URLSearchParams(search);
  const found: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = params.get(key);
    if (value) found[key] = value.slice(0, MAX_VALUE_LENGTH);
  }
  return found;
}

/**
 * Merge freshly-seen parameters over whatever this session already had.
 *
 * Newer wins: if someone lands from one ad, wanders off, and comes back through
 * a second ad, the second click is the one that earned the conversion.
 *
 * Storage access is wrapped because sessionStorage throws outright in Safari's
 * private mode and when a browser blocks site data. Attribution is a
 * nice-to-have; a form that cannot be submitted is not.
 */
export function rememberAttribution(search: string): Attribution {
  const seen = parseAttribution(search);
  if (!isBrowser()) return seen;
  try {
    const merged = { ...readAttribution(), ...seen };
    if (Object.keys(merged).length > 0) {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    }
    return merged;
  } catch {
    return seen;
  }
}

/** Everything captured this session. Returns {} when storage is unavailable. */
export function readAttribution(): Attribution {
  if (!isBrowser()) return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const result: Attribution = {};
    for (const key of ATTRIBUTION_KEYS) {
      const value = (parsed as Record<string, unknown>)[key];
      if (typeof value === "string" && value) result[key] = value.slice(0, MAX_VALUE_LENGTH);
    }
    return result;
  } catch {
    return {};
  }
}

/** The single click id to report, preferring gclid, then gbraid, then wbraid. */
export function primaryClickId(attribution: Attribution): string | undefined {
  for (const key of CLICK_ID_KEYS) {
    const value = attribution[key];
    if (value) return value;
  }
  return undefined;
}

/** True when this visit looks like it came from a paid click. */
export function isPaidVisit(attribution: Attribution): boolean {
  return primaryClickId(attribution) !== undefined;
}
