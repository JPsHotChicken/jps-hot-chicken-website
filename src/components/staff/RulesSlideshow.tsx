"use client";

import { useRef, useState, type ComponentType, type ReactNode } from "react";
import Image from "next/image";
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Coffee,
  ExternalLink,
  FileWarning,
  Hand,
  Headphones,
  LoaderCircle,
  Lock,
  PenLine,
  ScrollText,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  Utensils,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { signRulesSlideAction } from "@/app/staff/actions";
import {
  RULE_SLIDES,
  SIGNATURE_MAX_LENGTH,
  checkSignature,
  firstUnsignedIndex,
  formatSignedDate,
  type RuleSignature,
  type RuleSlideId,
} from "@/lib/staff-rules";
import { signatureFont } from "./signature-font";

type Icon = ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;

/*
 * The write-up form, as images for the preview and as the PDF behind them.
 * They sit under `/staff/`, so `proxy.ts` only hands them to somebody signed
 * in — which is also why they skip the image optimiser: it fetches without the
 * visitor's cookie and would be turned away.
 */
const WRITE_UP_PDF = "/staff/rules/employee-write-up-form.pdf";
const WRITE_UP_PAGES = ["/staff/rules/write-up-form-1.png", "/staff/rules/write-up-form-2.png"];

/* ------------------------------------------------------------------ pieces */

function SlideTitle({ icon: Icon, children }: { icon: Icon; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 font-heading text-lg font-bold sm:text-xl">
      <Icon aria-hidden className="size-5 shrink-0 text-brand" />
      {children}
    </h3>
  );
}

/** A thing that isn't allowed: its icon with a red circle-and-slash over it. */
function Forbidden({ icon: Icon, label }: { icon: Icon; label: string }) {
  return (
    <figure className="flex flex-col items-center gap-2">
      <span className="relative flex size-24 items-center justify-center sm:size-28">
        <Icon aria-hidden className="size-11 text-foreground sm:size-13" strokeWidth={1.75} />
        <Ban aria-hidden className="absolute inset-0 size-full text-red-600" strokeWidth={2.25} />
      </span>
      <figcaption className="text-xs font-bold tracking-wide text-red-700 uppercase">
        {label}
      </figcaption>
    </figure>
  );
}

function Consequence({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      {children}
    </p>
  );
}

function RuleCard({ icon: Icon, title, children }: { icon: Icon; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 rounded-lg border border-border p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
        <Icon aria-hidden className="size-4.5" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-foreground/85">{children}</p>
      </div>
    </li>
  );
}

type SignatureInput = {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  disabled: boolean;
  /** Set while the typed name has been turned away — the message's id. */
  errorId?: string;
};

/**
 * The line a signature sits on, in cursive.
 *
 * Given `input`, the line itself is where the name is typed: the whole box is a
 * label, so tapping anywhere on it puts the cursor on the line, and the name
 * comes out in cursive as it is typed. Without it, it shows a signature already
 * on file.
 */
function SignatureLine({
  name,
  signedAt,
  input,
}: {
  name?: string;
  signedAt?: string;
  input?: SignatureInput;
}) {
  const ink = `${signatureFont.className} min-w-0 flex-1 text-3xl leading-tight text-blue-900 sm:text-4xl dark:text-blue-200`;
  const Box = input ? "label" : "div";

  return (
    <Box
      className={`block rounded-lg border bg-background px-4 pt-2 pb-2 ${input?.errorId ? "border-destructive" : "border-border"
        } ${input
          ? "cursor-text transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
          : ""
        }`}
    >
      <span className="flex min-h-14 items-end gap-2 border-b border-foreground/30 pb-1">
        <span aria-hidden className="pb-1.5 text-sm font-bold text-muted-foreground">
          ✕
        </span>
        {input ? (
          <input
            value={input.value}
            onChange={(event) => input.onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                input.onEnter();
              }
            }}
            disabled={input.disabled}
            placeholder="Tap here to sign"
            aria-label="Your signature: type your full name, as it's written on your ID"
            aria-invalid={Boolean(input.errorId)}
            aria-describedby={input.errorId}
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            maxLength={SIGNATURE_MAX_LENGTH}
            className={`${ink} w-full bg-transparent py-0 outline-none placeholder:text-muted-foreground/40 disabled:opacity-60`}
          />
        ) : (
          <span data-testid="signature-preview" className={`${ink} truncate`}>
            {name}
          </span>
        )}
      </span>
      <span className="mt-1 flex justify-between gap-2 text-[0.65rem] font-bold tracking-widest text-muted-foreground uppercase">
        <span>Signature</span>
        {signedAt && <span>Signed {formatSignedDate(signedAt)}</span>}
      </span>
    </Box>
  );
}

/* ------------------------------------------------------------------ slides */

/**
 * What each slide says, and what signing it means. Keyed by the ids in
 * `lib/staff-rules.ts`, so a slide added there won't build until it has words
 * here. Changing the wording of one? Bump its version there too.
 */
const SLIDES: Record<RuleSlideId, { body: ReactNode; pledge: string }> = {
  "write-ups": {
    pledge: "Sign to confirm you understand that breaking the rules will result in a write-up.",
    body: (
      <>
        <SlideTitle icon={FileWarning}>Breaking the rules means a write-up</SlideTitle>
        <p className="mt-2 text-sm leading-relaxed">
          Failure to adhere to our rules and regulations{" "}
          <strong>will result in a formal write-up</strong> on the form below. A write-up goes in
          your employee file, and the form lays out what can follow — from a warning up to
          suspension or termination.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
          {WRITE_UP_PAGES.map((src, page) => (
            <a
              key={src}
              href={WRITE_UP_PDF}
              target="_blank"
              rel="noopener"
              className="block overflow-hidden rounded-lg border border-border bg-white shadow-sm transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Image
                src={src}
                alt={`Employee write-up form, page ${page + 1} of ${WRITE_UP_PAGES.length}`}
                width={1020}
                height={1320}
                unoptimized
                className="h-auto w-full"
              />
              <span className="block border-t border-border bg-muted/60 px-2 py-1 text-center text-[0.7rem] font-semibold text-muted-foreground">
                Page {page + 1}
              </span>
            </a>
          ))}
        </div>
        <a
          href={WRITE_UP_PDF}
          target="_blank"
          rel="noopener"
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
        >
          Open the full form
          <ExternalLink aria-hidden className="size-3" />
        </a>
      </>
    ),
  },

  phones: {
    pledge: "Sign to confirm you won't use your phone or wear headphones.",
    body: (
      <>
        <SlideTitle icon={Ban}>No phones. No headphones.</SlideTitle>
        <div className="mt-4 flex justify-center gap-8 sm:gap-14">
          <Forbidden icon={Smartphone} label="No phone use" />
          <Forbidden icon={Headphones} label="No headphones" />
        </div>
        <p className="mt-4 text-center text-base font-bold">
          Phone use and headphones must not be used at all while on the clock.
        </p>
        <Consequence>Failure to comply will result in a write-up.</Consequence>
      </>
    ),
  },

  breaks: {
    pledge: "Sign to confirm you'll follow the break rules.",
    body: (
      <>
        <SlideTitle icon={Coffee}>Breaks</SlideTitle>
        <ul className="mt-4 space-y-3">
          <RuleCard icon={Utensils} title="Break meals go on a for-here tray">
            All staff break meals <strong>must</strong>{" "}
            be taken on a for-here tray. No to-go trays — even if you want to eat in your car.
          </RuleCard>
          <RuleCard icon={Hand} title="Ask a manager before every break">
            You <strong>must</strong>{" "}
            ask a manager before taking a break. They&apos;ll decide whether it&apos;s an
            appropriate time for you to go.
          </RuleCard>
        </ul>
      </>
    ),
  },

  "sign-off": {
    pledge: "Sign to affirm that you've read and clearly understand everything.",
    body: (
      <>
        <SlideTitle icon={ShieldCheck}>Final sign-off</SlideTitle>
        <p className="mt-2 text-sm text-foreground/85">Here&apos;s everything you just read:</p>
        <ul className="mt-3 space-y-2">
          {(
            [
              [FileWarning, "Breaking the rules will result in a write-up."],
              [Smartphone, "No phone use or headphones — at all."],
              [Utensils, "Break meals go on a for-here tray, never a to-go tray."],
              [Hand, "Ask a manager before taking any break."],
            ] as const
          ).map(([Icon, text]) => (
            <li
              key={text}
              className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
              {text}
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-lg bg-muted px-3 py-2.5 text-sm leading-relaxed">
          By signing below, I affirm that I have read every page of the rules and regulations,
          that I clearly understand all of them, and that I will follow them. I understand that
          failing to follow them will result in a write-up.
        </p>
      </>
    ),
  },
};

/* --------------------------------------------------------------- slideshow */

type Props = {
  /** The name on file. A signature has to start with its first name. */
  employeeName: string;
  /** What this person has already signed, on each slide's current version. */
  initialSignatures: RuleSignature[];
};

const bySlide = (signatures: RuleSignature[]) =>
  Object.fromEntries(signatures.map((entry) => [entry.slideId, entry])) as Partial<
    Record<RuleSlideId, RuleSignature>
  >;

/**
 * The rules & regulations, first thing on `/staff`: one slide at a time, each
 * signed with the person's full name before the next one opens.
 *
 * Going back is always allowed. Going forward — by the Next button or the page
 * list — stops at the first slide that isn't signed yet, and the Server Action
 * refuses a signature on any slide past it too, so it can't be skipped by
 * calling it directly.
 *
 * Once every slide is signed it folds down to one line, so the schedule isn't
 * pushed under four pages of rules every visit. It opens again to review.
 */
export function RulesSlideshow({ employeeName, initialSignatures }: Props) {
  const [signatures, setSignatures] = useState(() => bySlide(initialSignatures));
  const reachable = firstUnsignedIndex(new Set(Object.keys(signatures)));
  const allSigned = reachable === RULE_SLIDES.length;

  // Open on the first page still to sign, or the start once there are none.
  const [index, setIndex] = useState(() => (allSigned ? 0 : reachable));
  const [open, setOpen] = useState(!allSigned);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  const slide = RULE_SLIDES[index];
  const signature = signatures[slide.id];
  const isLast = index === RULE_SLIDES.length - 1;

  const goTo = (next: number) => {
    if (next < 0 || next >= RULE_SLIDES.length || next > reachable) return;
    setIndex(next);
    setDraft("");
    setError(null);
    // On a phone the buttons sit under a tall page; bring the new one's top
    // back into view rather than leaving them looking at its end.
    const section = sectionRef.current;
    if (section && section.getBoundingClientRect().top < 0) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const sign = async () => {
    const check = checkSignature(draft, employeeName);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    const slideId = slide.id;
    setSaving(true);
    setError(null);
    try {
      const result = await signRulesSlideAction(slideId, check.name);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSignatures((current) => ({ ...current, [slideId]: result.signature }));
      setDraft("");
    } catch (cause) {
      console.error("[staff] Could not save a signature:", cause);
      setError("Couldn't save your signature. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    const completedAt = Object.values(signatures)
      .map((entry) => entry.signedAt)
      .sort()
      .at(-1);
    return (
      <section className="rounded-xl border border-border bg-background shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <CircleCheck aria-hidden className="size-5 shrink-0 text-emerald-600" />
          <div className="mr-auto min-w-0">
            <h2 className="font-heading text-base font-bold">Rules &amp; regulations</h2>
            <p className="text-xs text-muted-foreground">
              All {RULE_SLIDES.length} pages signed
              {completedAt && ` · ${formatSignedDate(completedAt)}`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIndex(0);
              setOpen(true);
            }}
          >
            Review
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      aria-labelledby="rules-heading"
      className="scroll-mt-20 overflow-hidden rounded-xl border border-border bg-background shadow-sm"
    >
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2
            id="rules-heading"
            className="mr-auto flex items-center gap-2 font-heading text-base font-bold"
          >
            <ScrollText aria-hidden className="size-4 text-brand" />
            Rules &amp; regulations
          </h2>
          <p className="text-xs font-semibold whitespace-nowrap text-muted-foreground tabular-nums">
            Page {index + 1} of {RULE_SLIDES.length}
          </p>
          {allSigned && (
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Hide
            </Button>
          )}
        </div>
        {!allSigned && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Read each page, then sign it with your full name to move on to the next.
          </p>
        )}

        <nav aria-label="Rules pages" className="mt-3">
          <ol
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${RULE_SLIDES.length}, minmax(0, 1fr))` }}
          >
            {RULE_SLIDES.map((entry, position) => {
              const current = position === index;
              const signed = Boolean(signatures[entry.id]);
              const locked = position > reachable;
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => goTo(position)}
                    disabled={locked}
                    aria-current={current ? "step" : undefined}
                    aria-label={`Page ${position + 1}, ${entry.title}${signed ? ", signed" : locked ? ", locked until the page before is signed" : ""
                      }`}
                    className="flex w-full flex-col gap-1.5 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed"
                  >
                    <span
                      className={`h-1.5 w-full rounded-full ${current ? "bg-brand" : signed ? "bg-emerald-500" : "bg-muted-foreground/20"
                        }`}
                    />
                    <span
                      className={`flex min-w-0 items-center gap-1 text-[0.7rem] font-semibold ${current ? "text-foreground" : "text-muted-foreground"
                        } ${locked ? "opacity-60" : ""}`}
                    >
                      <span
                        className={`flex size-4 shrink-0 items-center justify-center rounded-full text-[0.6rem] font-bold ${signed
                            ? "bg-emerald-500 text-white"
                            : current
                              ? "bg-brand text-brand-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                      >
                        {signed ? (
                          <Check aria-hidden className="size-2.5" strokeWidth={3.5} />
                        ) : locked ? (
                          <Lock aria-hidden className="size-2.5" />
                        ) : (
                          position + 1
                        )}
                      </span>
                      <span className="truncate">{entry.title}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </header>

      <div className="p-4 sm:p-5">{SLIDES[slide.id].body}</div>

      <div className="border-t border-border bg-muted/40 p-4 sm:p-5">
        {signature ? (
          <>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <CircleCheck aria-hidden className="size-4" />
              You signed this page
            </p>
            <SignatureLine name={signature.signedName} signedAt={signature.signedAt} />
          </>
        ) : (
          <>
            <p className="flex items-start gap-2 text-sm font-semibold">
              <PenLine aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
              {SLIDES[slide.id].pledge}
            </p>
            <p className="mt-0.5 mb-3 pl-6 text-xs text-muted-foreground">
              Tap the line and type your full name exactly as it&apos;s written on your ID — first
              and last name.
            </p>

            <SignatureLine
              input={{
                value: draft,
                onChange: (value) => {
                  setDraft(value);
                  setError(null);
                },
                onEnter: () => {
                  if (draft.trim() && !saving) void sign();
                },
                disabled: saving,
                errorId: error ? "rules-signature-error" : undefined,
              }}
            />

            <div className="mt-3 flex justify-end">
              <Button
                size="lg"
                onClick={sign}
                disabled={saving || !draft.trim()}
                className="w-full sm:w-auto"
              >
                {saving ? (
                  <LoaderCircle data-icon="inline-start" className="animate-spin" />
                ) : (
                  <PenLine data-icon="inline-start" />
                )}
                {saving ? "Signing…" : "Sign"}
              </Button>
            </div>

            {error && (
              <p id="rules-signature-error" role="alert" className="mt-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-border px-4 py-3">
        <Button variant="outline" onClick={() => goTo(index - 1)} disabled={index === 0}>
          <ChevronLeft data-icon="inline-start" />
          Back
        </Button>
        <p className="mx-auto text-center text-xs text-muted-foreground">
          {signature ? "" : "Sign to continue"}
        </p>
        {isLast ? (
          <Button onClick={() => setOpen(false)} disabled={!signature}>
            Done
            <Check data-icon="inline-end" />
          </Button>
        ) : (
          <Button onClick={() => goTo(index + 1)} disabled={!signature}>
            Next
            <ChevronRight data-icon="inline-end" />
          </Button>
        )}
      </footer>
    </section>
  );
}
