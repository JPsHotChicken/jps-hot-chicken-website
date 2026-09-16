import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getLandingPage } from "@/data/landing";
import { LandingPageView } from "@/components/landing/LandingPageView";

const SLUG = "wings-clarksville";

export async function generateMetadata(): Promise<Metadata> {
  const page = getLandingPage(SLUG);
  if (!page) return {};
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/${SLUG}` },
  };
}

/**
 * Paid search landing page for the "wings-clarksville" ad group.
 *
 * Content lives in `data/landing.ts` so the headline stays in step with the
 * keywords it is bought against. This file is only the route.
 */
export default function Page() {
  const page = getLandingPage(SLUG);
  if (!page) notFound();
  return <LandingPageView page={page} />;
}
