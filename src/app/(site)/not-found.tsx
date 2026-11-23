import type { Metadata } from "next";

import { NotFoundContent } from "@/components/NotFoundContent";

// Overrides the root layout's "index, follow" so the 404 sends one signal.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
  title: "Page Not Found",
  description: "That page doesn't exist. Order hot chicken online or find a JP's Hot Chicken near you.",
};

/** notFound() inside a site page: the (site) layout already adds the chrome. */
export default function NotFound() {
  return <NotFoundContent />;
}
