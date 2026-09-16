"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { rememberAttribution } from "@/lib/attribution";

/**
 * Captures ad click identifiers (gclid / gbraid / wbraid) and UTM parameters
 * into sessionStorage on every page view.
 *
 * Rendered once in the site layout so it covers every public page — a paid click
 * can land anywhere, not only on a landing page.
 *
 * Reads `window.location.search` directly instead of `useSearchParams()`, which
 * would opt every page into dynamic rendering and cost us the static-render
 * speed that paid landing pages live or die by. `usePathname()` is only a
 * cheap trigger so client-side navigations re-run the capture.
 */
export function AttributionCapture() {
  const pathname = usePathname();

  useEffect(() => {
    rememberAttribution(window.location.search);
  }, [pathname]);

  return null;
}
