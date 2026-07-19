"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Job } from "@/data/jobs";
import { siteConfig } from "@/data/site";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const SHIFTS = ["Morning", "Afternoon", "Evening"] as const;

type YesNo = "" | "yes" | "no";
type EmploymentPref = "" | "full-time" | "part-time" | "either";
type Errors = Record<string, string>;
type Experience = { where: string; position: string; dates: string };

const STEP_TITLES = ["Basic information", "Job details", "Review & submit"] as const;

// Location options for "Which location are you applying at?"
const LOCATION_OPTIONS = siteConfig.locations.map((loc) => ({
  value: loc.slug,
  label: `${loc.name} — ${loc.city}, ${loc.state}`,
}));

const EMPLOYMENT_OPTIONS: { value: Exclude<EmploymentPref, "">; label: string }[] = [
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "either", label: "Either" },
];

export function ApplicationForm({
  jobs,
  initialRole = "",
}: {
  jobs: Job[];
  initialRole?: string;
}) {
  const validInitial = jobs.some((j) => j.id === initialRole) ? initialRole : "";

  const [step, setStep] = useState(0);

  // Page 1 — Basic information
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [age, setAge] = useState("");
  const [workAuth, setWorkAuth] = useState<YesNo>("");

  // Page 2 — Job details
  const [position, setPosition] = useState(validInitial);
  const [location, setLocation] = useState("");
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [employment, setEmployment] = useState<EmploymentPref>("");
  const [foodService, setFoodService] = useState<YesNo>("");
  const [experiences, setExperiences] = useState<Experience[]>([
    { where: "", position: "", dates: "" },
  ]);
  const [transportation, setTransportation] = useState<YesNo>("");

  // Page 3 — Certification
  const [certify, setCertify] = useState(false);

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

  function updateExperience(index: number, field: keyof Experience, value: string) {
    setExperiences((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex)),
    );
  }

  function addExperience() {
    setExperiences((prev) => [...prev, { where: "", position: "", dates: "" }]);
  }

  function removeExperience(index: number) {
    setExperiences((prev) => prev.filter((_, i) => i !== index));
  }

  function validate(current: number): Errors {
    const e: Errors = {};

    if (current === 0) {
      if (!firstName.trim()) e.firstName = "Please enter your first name.";
      if (!lastName.trim()) e.lastName = "Please enter your last name.";
      if (!phone.trim()) e.phone = "Please enter a phone number.";
      else if (phone.replace(/\D/g, "").length < 10)
        e.phone = "Please enter a valid phone number.";
      // Email is optional — only validate the format if something was entered.
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        e.email = "Please enter a valid email address.";
      const ageNum = Number(age);
      if (!age.trim()) e.age = "Please enter your age.";
      else if (!Number.isFinite(ageNum) || ageNum < 14 || ageNum > 99)
        e.age = "Please enter a valid age.";
      if (!workAuth) e.workAuth = "Please answer this question.";
    }

    if (current === 1) {
      if (!position) e.position = "Please choose the position you're applying for.";
      if (!location) e.location = "Please choose a location.";
      if (!Object.values(availability).some(Boolean))
        e.availability = "Select at least one time you can work.";
      if (!employment) e.employment = "Please choose an option.";
      if (!foodService) e.foodService = "Please answer this question.";
      else if (foodService === "yes") {
        const first = experiences[0];
        if (!first.where.trim()) e.expWhere = "Please enter where you worked.";
        if (!first.position.trim()) e.expPosition = "Please enter your position.";
        if (!first.dates.trim()) e.expDates = "Please enter the dates you worked.";
      }
      if (!transportation) e.transportation = "Please answer this question.";
    }

    if (current === 2) {
      if (!certify) e.certify = "Please certify the information is accurate.";
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

    // Validate every page; jump to the first one with a problem.
    for (let s = 0; s < total; s++) {
      const e = validate(s);
      if (Object.keys(e).length > 0) {
        setStep(s);
        setErrors(e);
        return;
      }
    }
    setErrors({});

    setSubmitState("submitting");
    setSubmitError("");
    try {
      const selectedJob = jobs.find((j) => j.id === position);
      const positionLabel = selectedJob ? selectedJob.title : "Any position";
      const locationLabel =
        LOCATION_OPTIONS.find((o) => o.value === location)?.label ?? location;
      const employmentLabel =
        EMPLOYMENT_OPTIONS.find((o) => o.value === employment)?.label ?? employment;

      const slots = Object.entries(availability)
        .filter(([, v]) => v)
        .map(([k]) => k.replace("-", " "));

      const experienceStr =
        foodService === "yes"
          ? experiences
              .filter((ex) => ex.where.trim() || ex.position.trim() || ex.dates.trim())
              .map(
                (ex, i) =>
                  `#${i + 1} — Where: ${ex.where.trim()}; Position: ${ex.position.trim()}; Dates: ${ex.dates.trim()}`,
              )
              .join(" | ")
          : "No prior food service experience";

      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      const fd = new FormData();
      fd.set("name", fullName);
      fd.set("firstName", firstName.trim());
      fd.set("lastName", lastName.trim());
      fd.set("email", email.trim());
      fd.set("phone", phone.trim());
      fd.set("age", age.trim());
      fd.set("workAuthorized", workAuth);
      fd.set("position", positionLabel);
      fd.set("location", locationLabel);
      fd.set("availability", slots.join(", "));
      fd.set("employmentType", employmentLabel);
      fd.set("foodService", foodService);
      fd.set("experience", experienceStr);
      fd.set("transportation", transportation);
      fd.set("certify", "yes");

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
          Thanks, {firstName || "there"}.{" "}
          {email
            ? "We've emailed a confirmation and the team will be in touch soon."
            : "The team will review your application and reach out soon."}
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

        {/* Page 1: Basic information */}
        {step === 0 && (
          <div className="mt-5 space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                id={`${formId}-first`}
                label="First name"
                value={firstName}
                onChange={setFirstName}
                error={errors.firstName}
                autoComplete="given-name"
                required
              />
              <Field
                id={`${formId}-last`}
                label="Last name"
                value={lastName}
                onChange={setLastName}
                error={errors.lastName}
                autoComplete="family-name"
                required
              />
            </div>
            <Field
              id={`${formId}-phone`}
              label="Phone number"
              type="tel"
              value={phone}
              onChange={setPhone}
              error={errors.phone}
              autoComplete="tel"
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
              optional
            />
            <Field
              id={`${formId}-age`}
              label="Age"
              type="number"
              inputMode="numeric"
              value={age}
              onChange={setAge}
              error={errors.age}
              className="max-w-[8rem]"
              required
            />
            <YesNoQuestion
              id={`${formId}-workauth`}
              legend="Are you legally authorized to work in the U.S.?"
              value={workAuth}
              onChange={setWorkAuth}
              error={errors.workAuth}
              required
            />
          </div>
        )}

        {/* Page 2: Job details */}
        {step === 1 && (
          <div className="mt-5 space-y-6">
            {/* Position */}
            <div>
              <label htmlFor={`${formId}-position`} className="block font-semibold">
                Which position are you applying for?
                <RequiredMark />
              </label>
              <select
                id={`${formId}-position`}
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                aria-invalid={errors.position ? true : undefined}
                aria-describedby={errors.position ? `${formId}-position-error` : undefined}
                className={selectClass(!!errors.position)}
              >
                <option value="">Select a position…</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
                <option value="any">Any position</option>
              </select>
              <FieldError id={`${formId}-position`} message={errors.position} />
            </div>

            {/* Location */}
            <div>
              <label htmlFor={`${formId}-location`} className="block font-semibold">
                Which location are you applying at?
                <RequiredMark />
              </label>
              <select
                id={`${formId}-location`}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                aria-invalid={errors.location ? true : undefined}
                aria-describedby={errors.location ? `${formId}-location-error` : undefined}
                className={selectClass(!!errors.location)}
              >
                <option value="">Select a location…</option>
                {LOCATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <FieldError id={`${formId}-location`} message={errors.location} />
            </div>

            {/* Availability */}
            <div>
              <p className="font-semibold" id={`${formId}-avail-label`}>
                Availability
                <RequiredMark />
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Tap every time you can usually work.
              </p>
              <div
                role="group"
                aria-labelledby={`${formId}-avail-label`}
                className={cn(
                  "mt-3 space-y-2 rounded-xl transition-colors",
                  errors.availability && "bg-red-50 p-3 ring-1 ring-red-300",
                )}
              >
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
              <FieldError id={`${formId}-availability`} message={errors.availability} />
            </div>

            {/* Employment preference */}
            <fieldset>
              <legend className="font-semibold">
                Are you looking for full-time, part-time, or either?
                <RequiredMark />
              </legend>
              <div
                className={cn(
                  "mt-3 grid grid-cols-3 gap-3 rounded-xl transition-colors",
                  errors.employment && "bg-red-50 p-3 ring-1 ring-red-300",
                )}
              >
                {EMPLOYMENT_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex h-12 cursor-pointer items-center justify-center rounded-xl border-2 px-2 text-center font-heading text-sm font-bold uppercase tracking-wide transition-colors",
                      employment === opt.value
                        ? "border-brand bg-brand text-brand-foreground"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${formId}-employment`}
                      value={opt.value}
                      checked={employment === opt.value}
                      onChange={() => setEmployment(opt.value)}
                      className="sr-only"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              <FieldError id={`${formId}-employment`} message={errors.employment} />
            </fieldset>

            {/* Food service experience */}
            <div>
              <YesNoQuestion
                id={`${formId}-foodservice`}
                legend="Have you worked in food service before?"
                value={foodService}
                onChange={setFoodService}
                error={errors.foodService}
                required
              />
              {foodService === "yes" && (
                <div className="mt-4 space-y-4">
                  {experiences.map((ex, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-border bg-muted/30 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">
                          Experience {i + 1}
                        </p>
                        {i > 0 && (
                          <button
                            type="button"
                            onClick={() => removeExperience(i)}
                            className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label={`Remove experience ${i + 1}`}
                          >
                            <X className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      <div className="mt-3 space-y-3">
                        <Field
                          id={`${formId}-exp-${i}-where`}
                          label="Where"
                          value={ex.where}
                          onChange={(v) => updateExperience(i, "where", v)}
                          error={i === 0 ? errors.expWhere : undefined}
                          placeholder="Restaurant or employer"
                          required={i === 0}
                        />
                        <Field
                          id={`${formId}-exp-${i}-position`}
                          label="What position"
                          value={ex.position}
                          onChange={(v) => updateExperience(i, "position", v)}
                          error={i === 0 ? errors.expPosition : undefined}
                          placeholder="e.g. Cashier, Cook"
                          required={i === 0}
                        />
                        <Field
                          id={`${formId}-exp-${i}-dates`}
                          label="Dates worked"
                          value={ex.dates}
                          onChange={(v) => updateExperience(i, "dates", v)}
                          error={i === 0 ? errors.expDates : undefined}
                          placeholder="e.g. Jun 2023 – Aug 2024"
                          required={i === 0}
                        />
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addExperience}
                    className="inline-flex items-center gap-1.5 rounded-full border-2 border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-brand hover:text-brand"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    Add more restaurant experience
                  </button>
                </div>
              )}
            </div>

            {/* Transportation */}
            <YesNoQuestion
              id={`${formId}-transport`}
              legend="Do you have reliable transportation?"
              value={transportation}
              onChange={setTransportation}
              error={errors.transportation}
              required
            />
          </div>
        )}

        {/* Page 3: Review & submit */}
        {step === 2 && (
          <div className="mt-5 space-y-5">
            <p className="text-base text-muted-foreground">
              Please review your answers, then confirm below to submit your application.
            </p>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition-colors",
                errors.certify
                  ? "border-red-400 bg-red-50"
                  : certify
                    ? "border-brand bg-brand/5"
                    : "border-border hover:bg-muted",
              )}
            >
              <input
                type="checkbox"
                checked={certify}
                onChange={(e) => setCertify(e.target.checked)}
                aria-invalid={errors.certify ? true : undefined}
                aria-describedby={errors.certify ? `${formId}-certify-error` : undefined}
                className="mt-0.5 size-5 accent-brand"
              />
              <span className="font-semibold">
                I certify that the information above is accurate.
                <RequiredMark />
              </span>
            </label>
            <FieldError id={`${formId}-certify`} message={errors.certify} />

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
              disabled={!certify || submitState === "submitting"}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-brand px-6 font-heading text-base font-bold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50 disabled:cursor-not-allowed disabled:opacity-50"
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

function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="text-sm text-red-600">
        {" "}
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

function selectClass(error: boolean) {
  return cn(
    "mt-2 h-12 w-full rounded-xl border-2 px-4 text-base focus-visible:outline-none focus-visible:ring-3",
    error
      ? "border-red-400 bg-red-50 focus-visible:ring-red-200"
      : "border-border bg-card focus-visible:border-brand focus-visible:ring-brand/30",
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  inputMode,
  autoComplete,
  placeholder,
  className,
  required,
  optional,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block font-semibold">
        {label}
        {required && <RequiredMark />}
        {optional && (
          <span className="font-normal text-muted-foreground"> (optional)</span>
        )}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(
          "mt-2 h-12 w-full rounded-xl border-2 px-4 text-base focus-visible:outline-none focus-visible:ring-3",
          error
            ? "border-red-400 bg-red-50 focus-visible:ring-red-200"
            : "border-border bg-card focus-visible:border-brand focus-visible:ring-brand/30",
          className,
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
  required,
}: {
  id: string;
  legend: string;
  value: YesNo;
  onChange: (v: YesNo) => void;
  error?: string;
  required?: boolean;
}) {
  return (
    <fieldset>
      <legend className="font-semibold">
        {legend}
        {required && <RequiredMark />}
      </legend>
      <div
        className={cn(
          "mt-3 flex gap-3 rounded-xl transition-colors",
          error && "bg-red-50 p-3 ring-1 ring-red-300",
        )}
      >
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
