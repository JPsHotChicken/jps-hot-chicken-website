"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Hand } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * A guided tour: the page is dimmed except for one thing at a time, with a card
 * saying what it is and Back / Next to move along.
 *
 * Steps can do things on the page as they open — `onEnter` — so the tour can
 * really open a day's popup rather than describe one. A step marked `tapTarget`
 * also lets the person tap the highlighted thing themselves to carry on, which
 * teaches the gesture better than any button.
 */

export type TourStep = {
  /** A CSS selector for what to spotlight; none puts the card in the middle. */
  target?: string;
  title: string;
  body: ReactNode;
  /** The Next button's words; "Next" when left out. */
  next?: string;
  /** Run when the step opens, whichever way it was reached. */
  onEnter?: () => void;
  /** Tapping the highlighted thing moves on, the same as Next. */
  tapTarget?: boolean;
};

/** How far the highlight sits outside the thing it's around, in pixels. */
const PAD = 8;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

type Box = { top: number; left: number; width: number; height: number };

/**
 * Where a step's target is on screen, kept up to date every frame. A frame
 * loop rather than resize and scroll listeners because the targets move for
 * other reasons too: a popup sliding up, a smooth scroll, a week strip settling.
 */
function useTargetBox(target: string | undefined): Box | null {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    if (!target) return;
    let frame = 0;
    let scrolled = false;
    let last = "";
    const tick = () => {
      const element = document.querySelector(target);
      if (element) {
        if (!scrolled) {
          element.scrollIntoView?.({
            block: "center",
            behavior: prefersReducedMotion() ? "auto" : "smooth",
          });
          scrolled = true;
        }
        const rect = element.getBoundingClientRect();
        const key = `${rect.top}|${rect.left}|${rect.width}|${rect.height}`;
        if (key !== last) {
          last = key;
          setBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
        }
      } else if (last !== "missing") {
        last = "missing";
        setBox(null);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      // So the next step doesn't flash the old highlight before its own is found.
      setBox(null);
    };
  }, [target]);

  return target ? box : null;
}

export function StaffTour({
  steps,
  onFinish,
}: {
  steps: TourStep[];
  /** Called once, when they finish or skip. */
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const box = useTargetBox(step.target);
  const primary = useRef<HTMLButtonElement>(null);
  const last = index === steps.length - 1;

  // The steps are rebuilt on every render of the page around them, so the
  // current one is read through a ref: `onEnter` runs when the step changes,
  // not every time the page does.
  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);
  useEffect(() => {
    stepsRef.current[index].onEnter?.();
    primary.current?.focus();
  }, [index]);

  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finishRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const next = () => (last ? onFinish() : setIndex(index + 1));
  const back = () => setIndex(Math.max(0, index - 1));

  // The card sits at whichever end of the screen the highlight isn't, so it
  // never covers what it's talking about — on a phone especially.
  const dock: "center" | "top" | "bottom" = !box
    ? "center"
    : box.top + box.height / 2 > window.innerHeight / 2
      ? "top"
      : "bottom";

  const hole = box && {
    top: box.top - PAD,
    left: box.left - PAD,
    width: box.width + PAD * 2,
    height: box.height + PAD * 2,
  };

  return (
    <div className="fixed inset-0 z-[70]">
      {/* Catches every tap, so nothing behind the tour reacts by accident —
          except the highlighted thing on a step that asks to be tapped. */}
      <div
        data-testid="tour-backdrop"
        className={`absolute inset-0 ${hole ? "" : "bg-black/60"}`}
        onClick={(event) => {
          if (!step.tapTarget || !hole) return;
          const { clientX: x, clientY: y } = event;
          const inside =
            x >= hole.left &&
            x <= hole.left + hole.width &&
            y >= hole.top &&
            y <= hole.top + hole.height;
          if (inside) next();
        }}
      />

      {hole && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-xl transition-all duration-300 ease-out motion-reduce:transition-none"
          // One shadow does both jobs: the orange outline, then the dimming that
          // reaches to every edge of the screen. (A Tailwind ring is a shadow
          // too, so it can't be used alongside this one.)
          style={{
            ...hole,
            boxShadow: "0 0 0 3px var(--color-brand), 0 0 0 9999px rgb(0 0 0 / 0.6)",
          }}
        >
          {step.tapTarget && (
            <span className="absolute inset-0 animate-pulse rounded-xl ring-4 ring-brand/50" />
          )}
        </div>
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className={`absolute inset-x-0 flex justify-center px-4 ${
          dock === "center"
            ? "top-1/2 -translate-y-1/2"
            : dock === "top"
              ? "top-4 sm:top-8"
              : "bottom-4 sm:bottom-8"
        }`}
      >
        <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-2xl">
          <p className="text-xs font-bold tracking-widest text-brand uppercase">
            {index + 1} of {steps.length}
          </p>
          <h2 id="tour-title" className="mt-1 font-heading text-xl font-bold">
            {step.title}
          </h2>
          <div id="tour-body" className="mt-2 space-y-2 text-sm text-muted-foreground">
            {step.body}
          </div>

          {step.tapTarget && (
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Hand aria-hidden className="size-4 text-brand" />
              Tap the highlighted day, or press {step.next ?? "Next"}.
            </p>
          )}

          <div className="mt-5 flex items-center gap-2">
            {index === 0 ? (
              <Button variant="ghost" size="sm" onClick={onFinish}>
                Skip tour
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={back}>
                Back
              </Button>
            )}

            {/* Where you are, as dots. */}
            <span aria-hidden className="mx-auto flex gap-1">
              {steps.map((_, dot) => (
                <span
                  key={dot}
                  className={`h-1.5 rounded-full transition-all ${
                    dot === index ? "w-4 bg-brand" : "w-1.5 bg-gray-300"
                  }`}
                />
              ))}
            </span>

            <Button ref={primary} size="sm" onClick={next}>
              {step.next ?? (last ? "Done" : "Next")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Whether someone still has the tour to see, remembered in this browser.
 *
 * Per device, not per account: a person signing in on a second phone sees it
 * once more, and can skip it. Bump the version when the tour gains new steps
 * worth showing to people who have already been through it.
 */
const TOUR_VERSION = 1;

export function useTourPending(employeeId: string | undefined): [boolean, () => void] {
  const key = `jps-staff-tour-v${TOUR_VERSION}:${employeeId}`;
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!employeeId) return;
    try {
      // Read after mount: the server can't see this browser's storage, and
      // reading it while rendering would make the two disagree.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPending(window.localStorage.getItem(key) === null);
    } catch {
      // Storage blocked (a private window, say): skip the tour rather than
      // showing it on every visit.
    }
  }, [employeeId, key]);

  const done = () => {
    setPending(false);
    try {
      window.localStorage.setItem(key, new Date().toISOString());
    } catch {
      // Nothing to do: they'll just see it again next time.
    }
  };

  return [pending, done];
}
