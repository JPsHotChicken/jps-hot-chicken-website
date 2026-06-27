import { NextResponse } from "next/server";
import { Resend } from "resend";

import { siteConfig } from "@/data/site";

export const runtime = "nodejs";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

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
  const role = get("role");
  const name = get("name");
  const email = get("email");
  const phone = get("phone");
  const age16 = get("age16");
  const workAuthorized = get("workAuthorized");
  const availability = get("availability");
  const about = get("about");

  // Server-side validation (defense in depth).
  if (!name || !email || !phone || !availability) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }
  if (age16 !== "yes" || workAuthorized !== "yes") {
    return NextResponse.json(
      { error: "You must be 16+ and authorized to work in the U.S." },
      { status: 400 },
    );
  }

  // Optional resume → attachment.
  const attachments: { filename: string; content: Buffer }[] = [];
  const resume = form.get("resume");
  if (resume instanceof File && resume.size > 0) {
    if (resume.size > MAX_RESUME_BYTES) {
      return NextResponse.json({ error: "Resume is too large (5 MB max)." }, { status: 400 });
    }
    attachments.push({
      filename: resume.name || "resume",
      content: Buffer.from(await resume.arrayBuffer()),
    });
  }

  const summaryHtml = `
    <h2>New application — ${esc(role)}</h2>
    <table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif">
      <tr><td><strong>Name</strong></td><td>${esc(name)}</td></tr>
      <tr><td><strong>Email</strong></td><td>${esc(email)}</td></tr>
      <tr><td><strong>Phone</strong></td><td>${esc(phone)}</td></tr>
      <tr><td><strong>Role</strong></td><td>${esc(role)}</td></tr>
      <tr><td><strong>16 or older</strong></td><td>${esc(age16)}</td></tr>
      <tr><td><strong>Work authorized</strong></td><td>${esc(workAuthorized)}</td></tr>
      <tr><td><strong>Availability</strong></td><td>${esc(availability)}</td></tr>
      <tr><td valign="top"><strong>Notes</strong></td><td>${esc(about) || "—"}</td></tr>
    </table>
    <p style="font-family:sans-serif;color:#666">Resume attached: ${
      attachments.length ? "yes" : "no"
    }</p>
  `;

  const confirmationHtml = `
    <div style="font-family:sans-serif;line-height:1.5">
      <h2>Thanks for applying, ${esc(name.split(" ")[0] || "there")}!</h2>
      <p>We received your application${
        role ? ` for <strong>${esc(role)}</strong>` : ""
      } at ${esc(siteConfig.name)}. Our team will review it and reach out if it's a fit.</p>
      <p>Questions? Just reply to this email.</p>
      <p>— The ${esc(siteConfig.name)} team</p>
    </div>
  `;

  // If Resend isn't configured yet, don't fail the applicant — log and succeed
  // so the flow works in dev. Emails go out once RESEND_API_KEY is set.
  if (!process.env.RESEND_API_KEY) {
    console.warn(
      `[careers] RESEND_API_KEY not set — application from ${email} (${role}) not emailed.`,
    );
    return NextResponse.json({ ok: true, emailed: false });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Notify the owner (with resume attached), reply-to the applicant.
    await resend.emails.send({
      from: FROM,
      to: NOTIFY_TO,
      replyTo: email,
      subject: `New application: ${role} — ${name}`,
      html: summaryHtml,
      attachments: attachments.length ? attachments : undefined,
    });

    // Confirm to the applicant.
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `We received your application — ${siteConfig.name}`,
      html: confirmationHtml,
    });

    return NextResponse.json({ ok: true, emailed: true });
  } catch (err) {
    console.error("[careers] Resend error:", err);
    return NextResponse.json(
      { error: "We couldn't send your application. Please try again or email us." },
      { status: 502 },
    );
  }
}
