import { NextResponse } from "next/server";
import { Resend } from "resend";

import { siteConfig } from "@/data/site";

export const runtime = "nodejs";

// ⚠️ Resend requires a verified sender domain. Set CAREERS_FROM_EMAIL to an
// address on your verified domain (e.g. "JP's Hot Chicken Careers
// <careers@jpshotchicken.com>"). For quick testing you can use Resend's
// "onboarding@resend.dev" sender.
const FROM = process.env.CAREERS_FROM_EMAIL || "JP's Hot Chicken Careers <onboarding@resend.dev>";
// Where new applications are sent. Defaults to the owner's address.
const NOTIFY_TO = process.env.CAREERS_NOTIFY_EMAIL || siteConfig.email;

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form submission." }, { status: 400 });
  }

  const get = (k: string) => String(form.get(k) ?? "").trim();
  const name = get("name");
  const email = get("email");
  const phone = get("phone");
  const age = get("age");
  const workAuthorized = get("workAuthorized");
  const position = get("position");
  const location = get("location");
  const availability = get("availability");
  const employmentType = get("employmentType");
  const foodService = get("foodService");
  const experience = get("experience");
  const transportation = get("transportation");
  const certify = get("certify");

  // Server-side validation (defense in depth). Email is optional.
  if (
    !name ||
    !phone ||
    !age ||
    !workAuthorized ||
    !position ||
    !location ||
    !availability ||
    !employmentType ||
    !foodService ||
    !transportation
  ) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (certify !== "yes") {
    return NextResponse.json(
      { error: "Please certify the information is accurate." },
      { status: 400 },
    );
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  const summaryHtml = `
    <h2>New application — ${esc(position)}</h2>
    <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif">
      <tr><td><strong>Name</strong></td><td>${esc(name)}</td></tr>
      <tr><td><strong>Email</strong></td><td>${esc(email) || "—"}</td></tr>
      <tr><td><strong>Phone</strong></td><td>${esc(phone)}</td></tr>
      <tr><td><strong>Age</strong></td><td>${esc(age)}</td></tr>
      <tr><td><strong>Work authorized (U.S.)</strong></td><td>${esc(workAuthorized)}</td></tr>
      <tr><td><strong>Position</strong></td><td>${esc(position)}</td></tr>
      <tr><td><strong>Location</strong></td><td>${esc(location)}</td></tr>
      <tr><td><strong>Employment preference</strong></td><td>${esc(employmentType)}</td></tr>
      <tr><td><strong>Availability</strong></td><td>${esc(availability)}</td></tr>
      <tr><td><strong>Food service before</strong></td><td>${esc(foodService)}</td></tr>
      <tr><td valign="top"><strong>Experience</strong></td><td>${esc(experience) || "—"}</td></tr>
      <tr><td><strong>Reliable transportation</strong></td><td>${esc(transportation)}</td></tr>
    </table>
  `;

  const confirmationHtml = `
    <div style="font-family:sans-serif;line-height:1.5">
      <h2>Thanks for applying, ${esc(name.split(" ")[0] || "there")}!</h2>
      <p>We received your application${
        position ? ` for <strong>${esc(position)}</strong>` : ""
      } at ${esc(siteConfig.name)}. Our team will review it and reach out if it's a fit.</p>
      <p>Questions? Just reply to this email.</p>
      <p>— The ${esc(siteConfig.name)} team</p>
    </div>
  `;

  // If Resend isn't configured yet, don't fail the applicant — log and succeed
  // so the flow works in dev. Emails go out once RESEND_API_KEY is set.
  if (!process.env.RESEND_API_KEY) {
    console.warn(
      `[careers] RESEND_API_KEY not set — application from ${email || phone} (${position}) not emailed.`,
    );
    return NextResponse.json({ ok: true, emailed: false });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Notify the owner, reply-to the applicant when we have their email.
    await resend.emails.send({
      from: FROM,
      to: NOTIFY_TO,
      replyTo: email || undefined,
      subject: `New application: ${position} — ${name}`,
      html: summaryHtml,
    });

    // Confirm to the applicant — only if they gave us an email.
    if (email) {
      await resend.emails.send({
        from: FROM,
        to: email,
        subject: `We received your application — ${siteConfig.name}`,
        html: confirmationHtml,
      });
    }

    return NextResponse.json({ ok: true, emailed: true });
  } catch (err) {
    console.error("[careers] Resend error:", err);
    return NextResponse.json(
      { error: "We couldn't send your application. Please try again or email us." },
      { status: 502 },
    );
  }
}
