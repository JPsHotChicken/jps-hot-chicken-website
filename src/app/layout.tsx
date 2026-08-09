import type { Metadata, Viewport } from "next";
import { Blinker } from "next/font/google";

import "./globals.css";
import { siteConfig } from "@/data/site";

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
  return (
    <html lang="en" className={`${blinker.variable} h-full`}>
      {/* Page chrome (nav, footer, analytics) lives in the (site) layout so the
          admin dashboard can render full-bleed. */}
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
