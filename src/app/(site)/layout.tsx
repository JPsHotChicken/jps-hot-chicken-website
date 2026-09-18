import { Analytics } from "@vercel/analytics/next";

import { buildOrganizationJsonLd, serializeJsonLd } from "@/lib/jsonld";
import { Nav } from "@/components/Nav";
import { AttributionCapture } from "@/components/AttributionCapture";
import { GoogleAnalyticsTag } from "@/components/GoogleAnalyticsTag";
import { GoogleAdsTag } from "@/components/GoogleAdsTag";
import { ClarityTag } from "@/components/ClarityTag";
import { MetaPixelTag } from "@/components/MetaPixelTag";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { Footer } from "@/components/Footer";

/**
 * Chrome for the public marketing site. The admin dashboard lives outside this
 * group so it renders full-bleed — no nav, footer, banner, or analytics.
 */
export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = buildOrganizationJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD is trusted, build-time data derived from siteConfig.
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-foreground"
      >
        Skip to content
      </a>
      {/* Sticky header stack: the announcement bar stays pinned above the nav
          as the page scrolls. */}
      <div className="sticky top-0 z-50">
        <AnnouncementBanner />
        <Nav />
      </div>
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <Analytics />
      {/* GA4. Also re-sends page_view on client-side navigation, which Google's
          copy-paste snippet does not do. */}
      <GoogleAnalyticsTag />
      {/* Google Ads conversion tag. Dormant until NEXT_PUBLIC_GOOGLE_ADS_ID is set. */}
      <GoogleAdsTag />
      {/* Microsoft Clarity — heatmaps and session replay for the public site only. */}
      <ClarityTag />
      {/* Meta Pixel — Facebook / Instagram ad measurement and retargeting. */}
      <MetaPixelTag />
      {/* Stashes gclid / gbraid / wbraid + UTMs so a conversion can be attributed
          to the click that earned it, even several pages later. */}
      <AttributionCapture />
    </>
  );
}
