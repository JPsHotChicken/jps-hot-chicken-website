import { NextResponse } from "next/server";
import { Resend } from "resend";

import { siteConfig } from "@/data/site";
import { validateCateringForm, type CateringEnquiry } from "@/lib/catering";
import { CLICK_ID_KEYS, UTM_KEYS } from "@/lib/attribution";

export const runtime = "nodejs";

// Mirrors the careers route: Resend needs a verified sender domain. Falls back
// to Resend's test sender so local development works without configuration.
const FROM =
  process.env.CATERING_FROM_EMAIL ||
  process.env.CAREERS_FROM_EMAIL ||
  "JP's Hot Chicken <onboarding@resend.dev>";

const NOTIFY_TO =
  process.env.CATERING_NOTIFY_EMAIL ||
  process.env.CAREERS_NOTIFY_EMAIL ||
  siteConfig.email;

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * The attribution block at the bottom of the notification email.
 *
 * Worth surfacing to the owner in plain sight: when a catering enquiry is worth
 * a few hundred dollars, knowing which search term produced it is the whole
 * point of running the ads.
 */
function attributionHtml(enquiry: CateringEnquiry): string {
  const rows: string[] = [];
  for (const key of [...CLICK_ID_KEYS, ...UTM_KEYS]) {
    const value = enquiry.attribution[key];
    if (value) rows.push(`<tr><td><strong>${key}</strong></td><td>${esc(value)}</td></tr>`);
  }
  if (rows.length === 0) {
    return `<p style="color:#666">No ad click data — this one arrived organically or direct.</p>`;
  }
  return `
    <p style="color:#666"><strong>Came from a paid click:</strong></p>
    <table cellpadding="4" style="border-collapse:collapse;font-size:13px;color:#444">
      ${rows.join("")}
    </table>`;
}

function renderEmail(enquiry: CateringEnquiry): string {
  return `
    <h2>Catering enquiry — ${esc(enquiry.name)}</h2>
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><td><strong>Name</strong></td><td>${esc(enquiry.name)}</td></tr>
      <tr><td><strong>Phone</strong></td><td>${esc(enquiry.phone)}</td></tr>
      ${enquiry.email ? `<tr><td><strong>Email</strong></td><td>${esc(enquiry.email)}</td></tr>` : ""}
      ${enquiry.source ? `<tr><td><strong>Page</strong></td><td>${esc(enquiry.source)}</td></tr>` : ""}
    </table>
    ${enquiry.details ? `<p><strong>Details</strong><br>${esc(enquiry.details).replace(/\n/g, "<br>")}</p>` : ""}
    <hr>
    ${attributionHtml(enquiry)}`;
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read that submission." }, { status: 400 });
  }

  const result = validateCateringForm(form);
  if (!result.ok) {
    // The honeypot caught a bot. Answer 200 so it believes it succeeded and
    // moves on, rather than learning what tripped the filter and retrying.
    if (result.errors.company) return NextResponse.json({ ok: true });
    return NextResponse.json({ errors: result.errors }, { status: 400 });
  }

  const { enquiry } = result;
  const apiKey = process.env.RESEND_API_KEY;

  // Without a key the form still "works" in development — the enquiry is logged
  // rather than silently swallowed, so a misconfigured deploy is visible in the
  // logs instead of quietly dropping real leads.
  if (!apiKey) {
    console.warn("[catering] RESEND_API_KEY is not set — enquiry not emailed:", enquiry);
    return NextResponse.json({ ok: true, emailed: false });
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: FROM,
      to: NOTIFY_TO,
      subject: `Catering enquiry — ${enquiry.name}`,
      html: renderEmail(enquiry),
      ...(enquiry.email ? { replyTo: enquiry.email } : {}),
    });
  } catch (err) {
    console.error("[catering] Could not send the notification email:", err);
    return NextResponse.json(
      { error: "We couldn't send that just now. Please call us instead." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, emailed: true });
}
