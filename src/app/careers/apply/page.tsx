import type { Metadata } from "next";
import Link from "next/link";

import { siteConfig } from "@/data/site";
import { jobs } from "@/data/jobs";
import { ApplicationForm } from "@/components/ApplicationForm";

export const metadata: Metadata = {
  title: "Apply",
  description: `Apply to join the ${siteConfig.name} team — a short application, no account required.`,
  alternates: { canonical: "/careers/apply" },
  robots: { index: false },
};

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role } = await searchParams;

  return (
    <div className="bg-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mb-8 text-center">
          <p className="font-heading text-sm font-bold uppercase tracking-[0.3em] text-brand">
            {siteConfig.name}
          </p>
          <h1 className="mt-2 font-heading text-4xl font-extrabold uppercase tracking-tight sm:text-5xl">
            Apply
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Takes about 3 minutes — no account needed.
          </p>
        </header>

        <ApplicationForm jobs={jobs} initialRole={role ?? ""} />

        <p className="mx-auto mt-8 max-w-xl text-center text-xs leading-relaxed text-muted-foreground">
          {siteConfig.name} is an equal opportunity employer. We do not discriminate on the
          basis of race, color, religion, sex, sexual orientation, gender identity,
          national origin, age, disability, veteran status, or any other protected
          characteristic.
        </p>

        <div className="mt-6 text-center">
          <Link href="/careers" className="text-sm font-semibold text-brand hover:underline">
            ← Back to open roles
          </Link>
        </div>
      </div>
    </div>
  );
}
