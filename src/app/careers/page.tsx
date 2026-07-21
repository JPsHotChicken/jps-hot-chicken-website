import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  DollarSign,
  MapPin,
} from "lucide-react";

import { siteConfig } from "@/data/site";
import { jobs } from "@/data/jobs";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "Careers",
  description: `Join the ${siteConfig.name} team in Clarksville, TN and Oak Grove, KY. Competitive pay posted up front, flexible scheduling, free meals, and a clear path to advance. See open roles and apply.`,
  alternates: { canonical: "/careers" },
};

const PROCESS = [
  {
    title: "Apply online",
    body: "Choose a role and submit a short application. It only takes a few minutes.",
  },
  {
    title: "We review",
    body: "We review every application and reach out to set up a conversation.",
  },
  {
    title: "Meet & start",
    body: "After the quick interview, get an offer, and join the team.",
  },
];

// Only roles flagged `available` count as open; the rest show grayed out.
const openJobs = jobs.filter((job) => job.available);

const STATS = [
  {
    value: String(openJobs.length),
    label: openJobs.length === 1 ? "Open role" : "Open roles",
  },
  { value: "2", label: "Locations" },
];

function payRange(min: number, max: number) {
  return `${formatPrice(min)}–${formatPrice(max)} / hr`;
}

export default function CareersPage() {
  return (
    <div className="bg-white text-slate-900">
      {/* Hero */}
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-28">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            {siteConfig.name}
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
            Job positions
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            We&apos;re hiring across our Clarksville, TN and Oak Grove, KY locations.
            Below is all open positions available right now.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#openings"
              className="inline-flex h-11 items-center justify-center rounded-md bg-slate-900 px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              View open roles
            </a>
            <Link
              href="/careers/apply"
              className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
            >
              Submit an application
            </Link>
          </div>

          <dl className="mt-12 grid max-w-md grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
            {STATS.map((stat) => (
              <div key={stat.label} className="bg-white px-5 py-4">
                <dt className="text-sm text-slate-500">{stat.label}</dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Open roles */}
      <section
        id="openings"
        aria-labelledby="openings-title"
        className="scroll-mt-20 border-y border-slate-200 bg-slate-50"
      >
        <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
          <div className="max-w-2xl">
            <h2 id="openings-title" className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Open positions
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              {openJobs.length} {openJobs.length === 1 ? "role is" : "roles are"} currently open.{" "}
              Grayed-out roles aren&apos;t hiring yet — check back soon.
            </p>
          </div>

          <ul className="mt-10 space-y-5">
            {jobs.map((job) => (
              <li key={job.id}>
                <article
                  className={`overflow-hidden rounded-xl border border-slate-200 shadow-sm transition-shadow hover:shadow-md ${job.available ? "bg-white" : "bg-slate-50"}`}
                  aria-label={job.available ? undefined : `${job.title} — not currently hiring`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-stretch">
                    {/* Large image panel down the left side of the card */}
                    {job.image && (
                      <div className="relative aspect-[16/9] w-full shrink-0 self-stretch bg-slate-100 sm:aspect-[4/5] sm:w-56 lg:w-72">
                        <Image
                          src={job.image.src}
                          alt={job.image.alt}
                          fill
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 224px, 288px"
                          className={`object-cover ${job.available ? "" : "grayscale"}`}
                        />
                        {!job.available && (
                          <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-slate-900/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur">
                            Not hiring yet
                          </span>
                        )}
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 p-6 sm:p-8">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <h3 className="text-xl font-semibold text-slate-900">{job.title}</h3>
                          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="size-4 text-slate-400" aria-hidden="true" />
                              {job.location}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Clock className="size-4 text-slate-400" aria-hidden="true" />
                              {job.employmentType}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {job.available ? (
                            <Link
                              href={`/careers/apply?role=${job.id}`}
                              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-900 px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                            >
                              Apply
                              <ArrowRight className="size-4" aria-hidden="true" />
                            </Link>
                          ) : (
                            <button
                              type="button"
                              disabled
                              aria-disabled="true"
                              className="inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-md border border-slate-200 bg-slate-100 px-6 text-sm font-semibold text-slate-400"
                            >
                              Not hiring yet
                            </button>
                          )}
                        </div>
                      </div>

                  <details className="group mt-6 border-t border-slate-100 pt-6">
                    <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md text-sm font-semibold text-slate-900 transition-colors hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">See Responsibilities and Requirements</span>
                      <span className="hidden group-open:inline">
                        Hide Responsibilities and Requirements
                      </span>
                      <ChevronDown
                        className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      />
                    </summary>
                    <div className="mt-6 grid gap-8 sm:grid-cols-2">
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Responsibilities
                        </h4>
                        <ul className="mt-3 space-y-2">
                          {job.responsibilities.map((item) => (
                            <li key={item} className="flex gap-2.5 text-sm text-slate-600">
                              <Check
                                className="mt-0.5 size-4 shrink-0 text-slate-400"
                                aria-hidden="true"
                              />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Requirements
                        </h4>
                        <ul className="mt-3 space-y-2">
                          {job.requirements.map((item) => (
                            <li key={item} className="flex gap-2.5 text-sm text-slate-600">
                              <Check
                                className="mt-0.5 size-4 shrink-0 text-slate-400"
                                aria-hidden="true"
                              />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </details>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>

          {/* <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-5 text-center sm:flex sm:items-center sm:justify-between sm:text-left">
            <p className="text-sm text-slate-600">
              Don&apos;t see the right fit? We&apos;d still like to hear from you.
            </p>
            <Link
              href="/careers/apply"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:underline sm:mt-0"
            >
              Submit a general application
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div> */}
        </div>
      </section>

      {/* Hiring process */}
      <section
        aria-labelledby="process-title"
        className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20"
      >
        <div className="max-w-2xl">
          <h2 id="process-title" className="text-2xl font-bold text-slate-900 sm:text-3xl">
            How hiring works
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            Three simple steps from application to your first shift.
          </p>
        </div>
        <ol className="mt-10 grid gap-6 sm:grid-cols-3">
          {PROCESS.map((step, i) => (
            <li key={step.title} className="rounded-xl border border-slate-200 bg-white p-6">
              <span className="inline-flex size-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                {i + 1}
              </span>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Equal opportunity */}
      <section
        aria-labelledby="eeo-title"
        className="border-t border-slate-200 bg-slate-50"
      >
        <div className="mx-auto w-full max-w-4xl px-6 py-12">
          <h2 id="eeo-title" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Equal opportunity employer
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            {siteConfig.name} is an equal opportunity employer. We celebrate diversity and
            are committed to creating an inclusive environment for all team members. We do
            not discriminate on the basis of race, color, religion, sex, sexual orientation,
            gender identity, national origin, age, disability, veteran status, or any other
            protected characteristic. We only ask for information needed to evaluate your
            application for the role.
          </p>
        </div>
      </section>
    </div>
  );
}
