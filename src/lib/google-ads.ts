/**
 * Google Ads conversion tracking.
 *
 * ⚠️ READ THIS BEFORE TRUSTING THE NUMBERS.
 *
 * Online ordering is hosted off-site (Toast for Clarksville, SkyTab for Oak
 * Grove), so checkout happens on a domain we do not control and cannot tag.
 * That means we cannot count completed orders. What we count instead is the
 * click through to the ordering platform — intent, not revenue.
 *
 * It will overcount: some people click and never finish the order. Treat it as
 * a directional signal for comparing keywords against each other, NOT as sales.
 * Do not switch to a Target ROAS bid strategy on the back of this number — the
 * "revenue" would be fictional. To get real order data, the ordering platform
 * has to report completed orders back, which is a separate job.
 *
 * Calls and catering leads, by contrast, are real completed actions.
 *
 * ── Setup ─────────────────────────────────────────────────────────────────────
 * Everything here stays dormant until NEXT_PUBLIC_GOOGLE_ADS_ID is set, so the
 * site is safe to deploy before the tag exists. Set these in Vercel:
 *
 *   NEXT_PUBLIC_GOOGLE_ADS_ID           AW-XXXXXXXXX  (the conversion ID)
 *   NEXT_PUBLIC_GOOGLE_ADS_ORDER_LABEL  the label for "Order Click"
 *   NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL   the label for "Catering Lead"
 *   NEXT_PUBLIC_GOOGLE_ADS_CALL_LABEL   the label for "Phone Call Click"
 *
 * These are public by design — a conversion ID is visible in any browser's page
 * source on every site that runs Google Ads. It is not a secret and carries no
 * access to the account.
 */

export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;

/** Conversion labels, one per action we track. */
export const CONVERSION_LABELS = {
  order: process.env.NEXT_PUBLIC_GOOGLE_ADS_ORDER_LABEL,
  lead: process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL,
  call: process.env.NEXT_PUBLIC_GOOGLE_ADS_CALL_LABEL,
} as const;

export type ConversionName = keyof typeof CONVERSION_LABELS;

/** True when the tag is configured. Everything no-ops when this is false. */
export function isGoogleAdsConfigured(): boolean {
  return Boolean(GOOGLE_ADS_ID);
}

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: unknown[];
  }
}

/**
 * Report a conversion, then run `onDone`.
 *
 * The callback dance matters. A conversion fired on a link click races the
 * browser's navigation away from the page, and the navigation usually wins —
 * the beacon is cancelled and the conversion is silently lost. Google's
 * `event_callback` fires once the hit is away, so navigation is deferred until
 * then, with a short timeout so a blocked or slow tag never strands the
 * customer on the page. The order button must work even when tracking does not.
 */
export function trackConversion(name: ConversionName, onDone?: () => void): void {
  const label = CONVERSION_LABELS[name];
  const gtag = typeof window !== "undefined" ? window.gtag : undefined;

  // Not configured, blocked by an ad blocker, or still loading: just proceed.
  if (!GOOGLE_ADS_ID || !label || !gtag) {
    onDone?.();
    return;
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDone?.();
  };

  try {
    gtag("event", "conversion", {
      send_to: `${GOOGLE_ADS_ID}/${label}`,
      event_callback: finish,
    });
  } catch {
    finish();
    return;
  }

  // Safety net: never hold a customer hostage to a tag that does not answer.
  window.setTimeout(finish, 1000);
}
