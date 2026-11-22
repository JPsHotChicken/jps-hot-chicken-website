/**
 * GA4 click events for the actions the SEO checklist asks us to count:
 * Order Pickup, Order Delivery (per app), Call, and Directions.
 *
 * Separate from `lib/google-ads.ts`, which reports Google Ads *conversions*.
 * These are plain GA4 events so the GA4 reports can show which page and which
 * store sent each order click, whether or not the visitor came from an ad.
 *
 * gtag.js sends events with the beacon transport, so a click that opens a new
 * tab or hands off to the dialer still lands. Never throws: tracking must not
 * cost an order.
 */

import "@/lib/google-ads"; // for the global `window.gtag` type

export type ClickEvent =
  | "order_pickup_click"
  | "order_delivery_click"
  | "call_click"
  | "directions_click";

export type ClickEventParams = {
  /** Location slug ("clarksville", "oak-grove"), so reports split by store. */
  location?: string;
  /** "toast", "skytab", "doordash", "ubereats", "google_maps", "apple_maps"… */
  platform?: string;
  link_url?: string;
};

export function trackEvent(name: ClickEvent, params: ClickEventParams = {}): void {
  if (typeof window === "undefined") return;
  try {
    window.gtag?.("event", name, {
      ...params,
      page_path: window.location.pathname,
    });
  } catch {
    // Blocked or half-loaded tag: ignore.
  }
}
