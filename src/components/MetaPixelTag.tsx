import Script from "next/script";

/**
 * Meta Pixel — measures Facebook and Instagram ads and builds retargeting
 * audiences from people who visited the site.
 *
 * The pixel ID is public by design; it appears in the page source of every
 * site running the pixel and grants no access to the ad account.
 *
 * Meta's setup page says to paste the snippet into the <head> of every page.
 * Two deliberate departures from that:
 *
 * - It is rendered from the (site) layout only, never app-wide. The admin,
 *   staff, and operations areas show payroll figures, tip sheets, and
 *   scheduling, and the pixel's automatic event setup reads button text and
 *   page URLs — none of that belongs in an ad platform. Same reasoning as
 *   ClarityTag.
 * - `afterInteractive` instead of a raw <head> script: an ad pixel is not
 *   needed to paint the page, and blocking first render on it is what makes a
 *   paid click bounce. The pixel still loads on every public page view.
 *
 * Client-side navigation needs no help here, unlike GA4 (see
 * GoogleAnalyticsTag): fbevents.js watches history.pushState and sends its own
 * PageView each time the App Router changes the URL. Firing one manually on
 * route change would count every click-through twice.
 */
const META_PIXEL_ID = "28145994341759330";

export function MetaPixelTag() {
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window, document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${META_PIXEL_ID}');
          fbq('track', 'PageView');
        `}
      </Script>
      {/* Counts the visit for the few browsers running with JavaScript off. */}
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
