import type { Metadata } from "next";

import { NotFoundContent } from "@/components/NotFoundContent";
import { SiteChrome } from "@/components/SiteChrome";

// Overrides the root layout's "index, follow" so the 404 sends one signal.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
  title: "Page Not Found",
  description: "That page doesn't exist. Order hot chicken online or find a JP's Hot Chicken near you.",
};

/** Unmatched URLs render here, outside the (site) layout, so add its chrome. */
export default function NotFound() {
  return (
    <SiteChrome>
      <NotFoundContent />
    </SiteChrome>
  );
}
