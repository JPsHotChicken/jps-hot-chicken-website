import type { Metadata, Viewport } from "next";
import { Blinker } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { GoogleAnalytics } from "@next/third-parties/google";

import "./globals.css";
import { siteConfig } from "@/data/site";
import { buildOrganizationJsonLd, serializeJsonLd } from "@/lib/jsonld";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

// Blinker is a static (non-variable) font. It ships 100/200/300/400/600/700/800/900
// — note there is NO 500, so we avoid `font-medium` in the UI. Load only the weights
// the site actually uses: 400 (body), 600 (semibold), 700 (bold), 800 (extrabold).
const blinker = Blinker({
  weight: ["400", "600", "700", "800"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const viewport: Viewport = {
  // Brand chili red (sRGB approximation of the oklch --brand token).
  themeColor: "#ff6200",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [
    "hot chicken",
    "Nashville hot chicken",
    "fried chicken",
    ...siteConfig.locations.flatMap((loc) => [loc.city, `${loc.city} ${loc.state}`]),
    "chicken tenders",
    "chicken sandwich",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
    url: siteConfig.url,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteConfig.name} — ${siteConfig.tagline}`,
    description: siteConfig.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jsonLd = buildOrganizationJsonLd();
  // GA4 activates once NEXT_PUBLIC_GA_ID (a "G-…" measurement ID) is set in Vercel.
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="en" className={`${blinker.variable} h-full`}>
      <body className="flex min-h-full flex-col">
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
        <Nav />
        <main id="main" className="flex-1">
          {children}
        </main>
        <Footer />
        <Analytics />
        {gaId && <GoogleAnalytics gaId={gaId} />}
      </body>
    </html>
  );
}
