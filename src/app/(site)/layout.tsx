import { Analytics } from "@vercel/analytics/next";
import { GoogleAnalytics } from "@next/third-parties/google";

import { buildOrganizationJsonLd, serializeJsonLd } from "@/lib/jsonld";
import { Nav } from "@/components/Nav";
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
  // GA4 activates once NEXT_PUBLIC_GA_ID (a "G-…" measurement ID) is set in Vercel.
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

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
      {gaId && <GoogleAnalytics gaId={gaId} />}
    </>
  );
}
