"use client";

import Script from "next/script";

import { GOOGLE_ADS_ID } from "@/lib/google-ads";

/**
 * Loads gtag.js for Google Ads conversion tracking.
 *
 * Renders nothing at all until NEXT_PUBLIC_GOOGLE_ADS_ID is set, so no third
 * party script ships to visitors before the account is actually wired up.
 *
 * `afterInteractive` rather than `beforeInteractive`: a conversion tag is not
 * needed to paint the page, and blocking first render on an analytics script is
 * exactly the kind of thing that makes a paid click bounce.
 *
 * The site also loads GA4 via @next/third-parties. Both share the same gtag.js
 * and the same dataLayer, which is supported — each `config` line stands on its
 * own — so the two do not conflict.
 */
export function GoogleAdsTag() {
  if (!GOOGLE_ADS_ID) return null;

  return (
    <>
      <Script
        id="google-ads-gtag-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = window.gtag || gtag;
          gtag('js', new Date());
          gtag('config', '${GOOGLE_ADS_ID}');
        `}
      </Script>
    </>
  );
}
