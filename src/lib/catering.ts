/**
 * Catering / large-order enquiries submitted from the paid landing pages.
 *
 * Validation lives here rather than in the route handler so the same rules can
 * be unit tested without standing up a request.
 */

import { ATTRIBUTION_KEYS, type Attribution } from "@/lib/attribution";

export type CateringEnquiry = {
  name: string;
  phone: string;
  email?: string;
  /** Free text: when, how many people, what they want. */
  details?: string;
  /** Which landing page the enquiry came from. */
  source?: string;
  attribution: Attribution;
};

export type ValidationResult =
  | { ok: true; enquiry: CateringEnquiry }
  | { ok: false; errors: Record<string, string> };

const MAX = { name: 100, phone: 30, email: 254, details: 2000, source: 200 } as const;

/** Digits only, to compare lengths regardless of how it was typed. */
function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Deliberately loose email check. A regex cannot decide whether an address is
 * real, and every strict pattern eventually rejects somebody's legitimate
 * address. Email is optional here anyway — the phone number is what gets a
 * catering order called back.
 */
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function str(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function validateCateringForm(form: FormData): ValidationResult {
  const errors: Record<string, string> = {};

  const name = str(form, "name").slice(0, MAX.name);
  const phone = str(form, "phone").slice(0, MAX.phone);
  const email = str(form, "email").slice(0, MAX.email);
  const details = str(form, "details").slice(0, MAX.details);
  const source = str(form, "source").slice(0, MAX.source);

  if (!name) errors.name = "Please tell us your name.";

  if (!phone) {
    errors.phone = "Please leave a phone number so we can call you back.";
  } else if (digits(phone).length < 10) {
    errors.phone = "That phone number looks too short.";
  }

  if (email && !looksLikeEmail(email)) {
    errors.email = "That email address doesn't look right.";
  }

  // Honeypot. A field hidden from people but happily filled in by bots. Real
  // submissions always leave it empty, so anything here is spam.
  if (str(form, "company")) {
    errors.company = "spam";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const attribution: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = str(form, key);
    if (value) attribution[key] = value.slice(0, 512);
  }

  return {
    ok: true,
    enquiry: {
      name,
      phone,
      ...(email ? { email } : {}),
      ...(details ? { details } : {}),
      ...(source ? { source } : {}),
      attribution,
    },
  };
}
