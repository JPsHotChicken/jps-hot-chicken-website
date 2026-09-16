"use client";

import { useEffect, useRef, useState } from "react";

import { ATTRIBUTION_KEYS, readAttribution } from "@/lib/attribution";
import { trackConversion } from "@/lib/google-ads";
import { siteConfig } from "@/data/site";
import { formatPhone, telHref } from "@/lib/format";

type Status = "idle" | "submitting" | "sent" | "error";

/**
 * Catering / large-order enquiry form for the paid landing pages.
 *
 * This is the only owned lead capture on the site — everything else either
 * leaves for an ordering platform or is a phone call. It is what a gclid can
 * actually be attached to, which is why it exists on pages we pay to send
 * people to.
 *
 * The ad click identifiers are written into hidden inputs at mount rather than
 * read on the server, because by the time someone submits they may be several
 * clicks from the landing URL and the query string is long gone.
 */
export function CateringForm({ source }: { source: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const headingRef = useRef<HTMLParagraphElement>(null);

  // Move focus to the confirmation so screen reader users are told it worked.
  useEffect(() => {
    if (status === "sent") headingRef.current?.focus();
  }, [status]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    // Fill the attribution fields at submit time rather than at mount.
    // sessionStorage does not exist during server rendering, and a click id can
    // be captured after this form first paints — reading it now means we send
    // whatever the visit actually knows at the moment it converts.
    for (const key of ATTRIBUTION_KEYS) {
      const value = readAttribution()[key];
      if (value) data.set(key, value);
    }

    setStatus("submitting");
    setErrors({});

    try {
      const res = await fetch("/api/catering", { method: "POST", body: data });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          errors?: Record<string, string>;
          error?: string;
        };
        setErrors(body.errors ?? { form: body.error ?? "Something went wrong." });
        setStatus("error");
        return;
      }
      // Only count the conversion once the server has actually accepted it.
      // Firing on click would count abandoned and failed submissions as leads.
      trackConversion("lead");
      form.reset();
      setStatus("sent");
    } catch {
      setErrors({ form: "We couldn't reach the kitchen. Please call us instead." });
      setStatus("error");
    }
  }

  const phone = siteConfig.locations.find((l) => l.phone)?.phone;

  if (status === "sent") {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
        <p
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-xl font-bold tracking-tight outline-none"
        >
          Got it — we&apos;ll call you back.
        </p>
        <p className="mt-2 text-muted-foreground">
          We usually get back to catering enquiries the same day we&apos;re open.
          {phone ? " In a hurry? " : ""}
          {phone && (
            <a href={telHref(phone)} className="font-semibold text-brand hover:underline">
              Call {formatPhone(phone)}
            </a>
          )}
        </p>
      </div>
    );
  }

  const fieldClass =
    "mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none focus-visible:ring-3 focus-visible:ring-brand/40";
  const labelClass = "block text-sm font-semibold";
  const errorClass = "mt-1 text-sm text-brand";

  return (
    <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <h2 className="font-heading text-2xl font-bold tracking-tight">
        Feeding a crowd?
      </h2>
      <p className="mt-2 text-muted-foreground">
        Parties, offices, units, team meals. Tell us what you need and we&apos;ll
        call you back with a quote.
      </p>

      {/* Ad click identifiers and campaign parameters, carried through to the
          notification email so the owner can see which keyword produced a lead.
          Declared here so the fields exist on the form; their values are set
          from sessionStorage at submit time (see handleSubmit). */}
      {ATTRIBUTION_KEYS.map((key) => (
        <input key={key} type="hidden" name={key} defaultValue="" />
      ))}
      <input type="hidden" name="source" value={source} />

      {/* Honeypot. Hidden from people, irresistible to bots. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="catering-name" className={labelClass}>
            Name
          </label>
          <input
            id="catering-name"
            name="name"
            type="text"
            required
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "catering-name-error" : undefined}
            className={fieldClass}
          />
          {errors.name && (
            <p id="catering-name-error" className={errorClass}>
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="catering-phone" className={labelClass}>
            Phone
          </label>
          <input
            id="catering-phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            inputMode="tel"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? "catering-phone-error" : undefined}
            className={fieldClass}
          />
          {errors.phone && (
            <p id="catering-phone-error" className={errorClass}>
              {errors.phone}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="catering-email" className={labelClass}>
          Email <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id="catering-email"
          name="email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "catering-email-error" : undefined}
          className={fieldClass}
        />
        {errors.email && (
          <p id="catering-email-error" className={errorClass}>
            {errors.email}
          </p>
        )}
      </div>

      <div className="mt-4">
        <label htmlFor="catering-details" className={labelClass}>
          What do you need?{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="catering-details"
          name="details"
          rows={4}
          placeholder="Date, how many people, anything you have in mind."
          className={fieldClass}
        />
      </div>

      {errors.form && (
        <p role="alert" className="mt-4 text-sm font-semibold text-brand">
          {errors.form}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-brand px-8 font-heading text-base font-bold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50 disabled:opacity-60"
      >
        {status === "submitting" ? "Sending…" : "Send enquiry"}
      </button>
    </form>
  );
}
