"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Paperclip, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Job } from "@/data/jobs";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const SHIFTS = ["Morning", "Afternoon", "Evening"] as const;
const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB

type YesNo = "" | "yes" | "no";
type Errors = Record<string, string>;

const STEP_TITLES = [
  "Which role?",
  "About you",
  "Eligibility",
  "Your availability",
  "Almost done",
] as const;

export function ApplicationForm({
  jobs,
  initialRole = "",
}: {
  jobs: Job[];
  initialRole?: string;
}) {
  const validInitial = jobs.some((j) => j.id === initialRole) ? initialRole : "";

  const [step, setStep] = useState(0);
  const [role, setRole] = useState(validInitial);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [age16, setAge16] = useState<YesNo>("");
  const [workAuth, setWorkAuth] = useState<YesNo>("");
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [about, setAbout] = useState("");
  const [resume, setResume] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitState, setSubmitState] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [submitError, setSubmitError] = useState("");

  const headingRef = useRef<HTMLHeadingElement>(null);
  const formId = useId();
  const total = STEP_TITLES.length;

  // Move focus to the step heading when the step changes (a11y).
  useEffect(() => {
    if (submitState !== "success") headingRef.current?.focus();
  }, [step, submitState]);

  function toggleSlot(key: string) {
    setAvailability((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function validate(current: number): Errors {
    const e: Errors = {};
    if (current === 0 && !role) e.role = "Please choose the role you're applying for.";
    if (current === 1) {
      if (!name.trim()) e.name = "Please enter your name.";
      if (!email.trim()) e.email = "Please enter your email.";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        e.email = "Please enter a valid email address.";
      if (!phone.trim()) e.phone = "Please enter a phone number.";
      else if (phone.replace(/\D/g, "").length < 10)
        e.phone = "Please enter a valid phone number.";
    }
    if (current === 2) {
      if (!age16) e.age16 = "Please answer this question.";
      else if (age16 === "no") e.age16 = "You must be 16 or older to apply for this role.";
      if (!workAuth) e.workAuth = "Please answer this question.";
      else if (workAuth === "no")
        e.workAuth = "This role requires authorization to work in the U.S.";
    }
    if (current === 3) {
      if (!Object.values(availability).some(Boolean))
        e.availability = "Select at least one time you can work.";
    }
    if (current === 4 && resume) {
      if (resume.size > MAX_RESUME_BYTES) e.resume = "File is too large (5 MB max).";
    }
    return e;
  }

  function next() {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => Math.min(s + 1, total - 1));
  }

  function back() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const e = validate(4);
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitState("submitting");
    setSubmitError("");
    try {
      const selectedJob = jobs.find((j) => j.id === role);
      const slots = Object.entries(availability)
        .filter(([, v]) => v)
        .map(([k]) => k.replace("-", " "));

      const fd = new FormData();
      fd.set("role", selectedJob ? selectedJob.title : "General application");
      fd.set("name", name.trim());
      fd.set("email", email.trim());
      fd.set("phone", phone.trim());
      fd.set("age16", age16);
      fd.set("workAuthorized", workAuth);
      fd.set("availability", slots.join(", "));
      fd.set("about", about.trim());
      if (resume) fd.set("resume", resume);

      const res = await fetch("/api/apply", { method: "POST", body: fd });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Something went wrong. Please try again.");
      }
      setSubmitState("success");
    } catch (err) {
      setSubmitState("error");
      setSubmitError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (submitState === "success") {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-border bg-card p-8 text-center shadow-sm sm:p-10">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-brand/10 text-brand">
          <Check className="size-8" aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-heading text-2xl font-bold uppercase tracking-tight">
          Application received!
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          Thanks, {name.split(" ")[0] || "there"}. We&apos;ve emailed a confirmation to{" "}
          <span className="font-semibold text-foreground">{email}</span> and the team will
          be in touch soon.
        </p>
        <Link
          href="/careers"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-brand px-6 font-heading text-base font-bold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110"
        >
          Back to careers
        </Link>
      </div>
    );
  }

  const pct = Math.round(((step + 1) / total) * 100);

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-xl">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
          <span>
            Step {step + 1} of {total}
          </span>
          <span>{STEP_TITLES[step]}</span>
        </div>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Application progress"
        >
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-heading text-2xl font-bold uppercase tracking-tight outline-none sm:text-3xl"
        >
          {STEP_TITLES[step]}
        </h2>

        {/* Step 0: role */}
        {step === 0 && (
          <fieldset className="mt-5">
            <legend className="sr-only">Choose a role</legend>
            <div className="space-y-3">
              {jobs.map((job) => (
                <label
                  key={job.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors",
                    role === job.id
                      ? "border-brand bg-brand/5"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    value={job.id}
                    checked={role === job.id}
                    onChange={() => setRole(job.id)}
                    className="mt-1 size-5 accent-brand"
                  />
                  <span>
                    <span className="block font-heading text-base font-bold uppercase tracking-tight">
                      {job.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {job.location} · {job.employmentType}
                    </span>
                  </span>
                </label>
              ))}
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors",
                  role === "general"
                    ? "border-brand bg-brand/5"
                    : "border-border hover:bg-muted",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value="general"
                  checked={role === "general"}
                  onChange={() => setRole("general")}
                  className="mt-1 size-5 accent-brand"
                />
                <span>
                  <span className="block font-heading text-base font-bold uppercase tracking-tight">
                    General application
                  </span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    Not sure which role — we&apos;ll find the best fit.
                  </span>
                </span>
              </label>
            </div>
            <FieldError id={`${formId}-role`} message={errors.role} />
          </fieldset>
        )}

        {/* Step 1: about you */}
        {step === 1 && (
          <div className="mt-5 space-y-5">
            <Field
              id={`${formId}-name`}
              label="Full name"
              value={name}
              onChange={setName}
              error={errors.name}
              autoComplete="name"
              required
            />
            <Field
              id={`${formId}-email`}
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              error={errors.email}
              autoComplete="email"
              required
            />
            <Field
              id={`${formId}-phone`}
              label="Phone"
              type="tel"
              value={phone}
              onChange={setPhone}
              error={errors.phone}
              autoComplete="tel"
              required
            />
          </div>
        )}

        {/* Step 2: eligibility */}
        {step === 2 && (
          <div className="mt-5 space-y-6">
            <YesNoQuestion
              id={`${formId}-age16`}
              legend="Are you 16 years or older?"
              value={age16}
              onChange={setAge16}
              error={errors.age16}
            />
            <YesNoQuestion
              id={`${formId}-workauth`}
              legend="Are you legally authorized to work in the U.S.?"
              value={workAuth}
              onChange={setWorkAuth}
              error={errors.workAuth}
            />
            <p className="text-sm text-muted-foreground">
              We only ask what&apos;s needed to consider you for the role. We never ask for
              your date of birth, race, or other protected information.
            </p>
          </div>
        )}

        {/* Step 3: availability */}
        {step === 3 && (
          <div className="mt-5">
            <div role="group" aria-labelledby={`${formId}-avail-label`}>
              <p id={`${formId}-avail-label`} className="font-semibold">
                Tap every time you can usually work.
              </p>
              <div className="mt-4 space-y-2">
                {/* header */}
                <div className="grid grid-cols-[2.75rem_repeat(3,1fr)] gap-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span />
                  {SHIFTS.map((s) => (
                    <span key={s} className="self-center">
                      {s}
                    </span>
                  ))}
                </div>
                {DAYS.map((day) => (
                  <div
                    key={day}
                    className="grid grid-cols-[2.75rem_repeat(3,1fr)] items-center gap-2"
                  >
                    <span className="text-sm font-bold uppercase">{day}</span>
                    {SHIFTS.map((shift) => {
                      const key = `${day}-${shift}`;
                      const on = !!availability[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={on}
                          aria-label={`${day} ${shift}`}
                          onClick={() => toggleSlot(key)}
                          className={cn(
                            "flex h-11 items-center justify-center rounded-lg border-2 text-sm font-bold transition-colors",
                            on
                              ? "border-brand bg-brand text-brand-foreground"
                              : "border-border bg-card text-muted-foreground hover:bg-muted",
                          )}
                        >
                          {on ? "✓" : ""}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <FieldError id={`${formId}-availability`} message={errors.availability} />
          </div>
        )}

        {/* Step 4: finish */}
        {step === 4 && (
          <div className="mt-5 space-y-5">
            <div>
              <label
                htmlFor={`${formId}-about`}
                className="block font-semibold"
              >
                Anything you&apos;d like us to know?{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id={`${formId}-about`}
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                rows={4}
                className="mt-2 w-full rounded-xl border-2 border-border bg-card p-3 text-base focus-visible:border-brand focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/30"
                placeholder="Experience, why you'd be a great fit, when you can start…"
              />
            </div>

            <div>
              <span className="block font-semibold">
                Resume{" "}
                <span className="font-normal text-muted-foreground">
                  (optional · PDF or Word, 5 MB max)
                </span>
              </span>
              {resume ? (
                <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border-2 border-border bg-muted/40 p-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <Paperclip className="size-4 shrink-0 text-brand" aria-hidden="true" />
                    <span className="truncate">{resume.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setResume(null)}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Remove resume"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <label className="mt-2 flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm font-semibold text-muted-foreground transition-colors hover:border-brand hover:text-brand">
                  <Paperclip className="size-4" aria-hidden="true" />
                  Attach a resume
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf"
                    className="sr-only"
                    onChange={(e) => setResume(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
              <FieldError id={`${formId}-resume`} message={errors.resume} />
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              {/* EEO reminder near submit */}
              We&apos;re an equal opportunity employer. By submitting, you confirm the
              information is accurate.
            </p>

            {submitState === "error" && (
              <p role="alert" className="text-sm font-semibold text-destructive">
                {submitError}
              </p>
            )}
          </div>
        )}

        {/* Nav buttons */}
        <div className="mt-8 flex items-center gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              className="inline-flex h-12 items-center justify-center rounded-full border-2 border-border px-6 font-heading text-base font-bold uppercase tracking-wide text-foreground transition-colors hover:bg-muted"
            >
              Back
            </button>
          )}
          {/* Distinct keys are required: without them React reuses the same
              <button> element and only flips its type from "button" to "submit"
              when advancing to the last step — which makes the click that
              triggered the step change submit the form. */}
          {step < total - 1 ? (
            <button
              key="continue"
              type="button"
              onClick={next}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-brand px-6 font-heading text-base font-bold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50"
            >
              Continue
            </button>
          ) : (
            <button
              key="submit"
              type="submit"
              disabled={submitState === "submitting"}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-brand px-6 font-heading text-base font-bold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50 disabled:opacity-70"
            >
              {submitState === "submitting" ? (
                <>
                  <Loader2 className="size-5 animate-spin" aria-hidden="true" />
                  Submitting…
                </>
              ) : (
                "Submit application"
              )}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  autoComplete,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block font-semibold">
        {label}
        {required && <span className="text-brand"> *</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "mt-2 h-12 w-full rounded-xl border-2 bg-card px-4 text-base focus-visible:outline-none focus-visible:ring-3",
          error
            ? "border-destructive focus-visible:ring-destructive/20"
            : "border-border focus-visible:border-brand focus-visible:ring-brand/30",
        )}
      />
      <FieldError id={id} message={error} />
    </div>
  );
}

function YesNoQuestion({
  id,
  legend,
  value,
  onChange,
  error,
}: {
  id: string;
  legend: string;
  value: YesNo;
  onChange: (v: YesNo) => void;
  error?: string;
}) {
  return (
    <fieldset>
      <legend className="font-semibold">{legend}</legend>
      <div className="mt-3 flex gap-3">
        {(["yes", "no"] as const).map((opt) => (
          <label
            key={opt}
            className={cn(
              "flex h-12 flex-1 cursor-pointer items-center justify-center rounded-xl border-2 font-heading text-base font-bold uppercase tracking-wide transition-colors",
              value === opt
                ? "border-brand bg-brand text-brand-foreground"
                : "border-border bg-card hover:bg-muted",
            )}
          >
            <input
              type="radio"
              name={id}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
              className="sr-only"
            />
            {opt === "yes" ? "Yes" : "No"}
          </label>
        ))}
      </div>
      <FieldError id={id} message={error} />
    </fieldset>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={`${id}-error`} role="alert" className="mt-2 text-sm font-semibold text-destructive">
      {message}
    </p>
  );
}
