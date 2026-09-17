"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { GoogleAnalytics } from "@next/third-parties/google";

/**
 * Google Analytics 4.
 *
 * The measurement ID is hardcoded so the tag ships without a Vercel step — a
 * "G-…" ID is public in the page source of every site running GA4 and carries
 * no access to the account. NEXT_PUBLIC_GA_ID overrides it if the property is
 * ever replaced.
 */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID || "G-8TS1CYVXQ7";

/**
 * Loads gtag.js for GA4 and keeps pageviews honest across client-side routing.
 *
 * Google's copy-paste snippet sends exactly one `page_view`: the one for the
 * page that was loaded from the server. Every move after that — tapping Order,
 * Locations, Careers — is a client-side navigation in the App Router, where the
 * document never reloads and gtag never fires again. Pasted as-is, GA4 would
 * report the landing page and nothing else.
 *
 * GA4's Enhanced measurement has a "page changes based on browser history
 * events" option meant to cover this, but it is a property setting, not
 * something the site controls, and it is not firing on this property today
 * (verified in the browser). So we send the navigation pageviews ourselves.
 *
 * ⚠️ If that Enhanced measurement option is ever switched on in GA4 Admin ->
 * Data streams, turn it back off — otherwise every click-through gets counted
 * twice, once by Google and once here.
 *
 * The first pageview is skipped on purpose: `gtag('config', …)` already sent it
 * on load. Only the ones after it need help.
 *
 * Reads `window.location` directly rather than `useSearchParams()`, which would
 * opt every page into dynamic rendering and cost the static-render speed paid
 * landing pages live or die by — the same trade-off AttributionCapture makes.
 */
export function GoogleAnalyticsTag() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Blocked by an ad blocker, or still loading: nothing to report to.
    if (typeof window.gtag !== "function") return;

    window.gtag("event", "page_view", {
      page_location: window.location.href,
      page_title: document.title,
      send_to: GA_MEASUREMENT_ID,
    });
  }, [pathname]);

  return <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />;
}
