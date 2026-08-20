"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type InteriorSlide = {
  src: string;
  alt: string;
};

type InteriorSlideshowProps = {
  images: InteriorSlide[];
  className?: string;
  /** Seconds each photo is held before the slideshow advances on its own. */
  intervalSeconds?: number;
};

/** True for the current photo and the one on either side of it (wrapping). */
function isNear(i: number, index: number, count: number) {
  const distance = Math.abs(i - index);
  return distance <= 1 || distance === count - 1;
}

/**
 * Auto-advancing photo slideshow: one large image that crossfades to the next
 * every few seconds, with overlay arrows and a row of thumbnails underneath —
 * every photo at once, the current one highlighted — that jump straight to a
 * photo. The arrows wrap in both directions, so there is no dead end at either
 * end of the strip, and left/right arrow keys move between photos while the
 * slideshow has focus.
 *
 * Auto-advance pauses while the pointer is over the slideshow or one of its
 * controls has focus, so it never moves out from under someone mid-look, and it
 * stays off entirely for visitors who ask for reduced motion.
 */
export function InteriorSlideshow({
  images,
  className,
  intervalSeconds = 5,
}: InteriorSlideshowProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = images.length;

  // Wrap in both directions so the arrows and thumbnails never dead-end.
  const step = useCallback(
    (delta: number) => setIndex((i) => (i + delta + count) % count),
    [count],
  );

  // Advance on a timer. `index` is a dependency so any manual move (arrow,
  // thumbnail, or key) restarts the clock rather than cutting the new photo
  // short.
  useEffect(() => {
    if (paused || count < 2) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const id = window.setTimeout(
      () => setIndex((i) => (i + 1) % count),
      intervalSeconds * 1000,
    );
    return () => window.clearTimeout(id);
  }, [paused, count, index, intervalSeconds]);

  if (count === 0) return null;

  return (
    <div
      className={cn("w-full", className)}
      role="group"
      aria-roledescription="carousel"
      aria-label="Trenton interior photos"
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          step(-1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          step(1);
        }
      }}
    >
      {/* Large image. The current photo plus its two neighbours are stacked in
          the same box and the current one is faded in, so advancing crossfades
          instead of blinking — while only ever loading three of these big files
          at a time. Only the visible photo is exposed to screen readers. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted">
        {images.map((slide, i) =>
          isNear(i, index, count) ? (
            <Image
              key={slide.src}
              src={slide.src}
              alt={slide.alt}
              aria-hidden={i === index ? undefined : true}
              fill
              sizes="(max-width: 640px) 100vw, 768px"
              className={cn(
                "object-cover transition-opacity duration-700 ease-out motion-reduce:transition-none",
                i === index ? "opacity-100" : "opacity-0",
              )}
            />
          ) : null,
        )}
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous photo"
          className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-foreground shadow-md transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50 sm:left-3 sm:size-11"
        >
          <ChevronLeft className="size-5 sm:size-6" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next photo"
          className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/85 text-foreground shadow-md transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50 sm:right-3 sm:size-11"
        >
          <ChevronRight className="size-5 sm:size-6" aria-hidden="true" />
        </button>
      </div>

      {/* Every photo as a small preview; the current one is highlighted. The
          thumbnails flex-share the row so all of them stay visible at once. */}
      <div className="mt-2 flex gap-1.5 sm:mt-3 sm:gap-2">
        {images.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show photo ${i + 1} of ${count}`}
            aria-current={i === index ? "true" : undefined}
            className={cn(
              "group relative aspect-[4/3] min-w-0 flex-1 overflow-hidden rounded-md bg-muted shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50 sm:rounded-lg",
              i === index && "ring-2 ring-brand ring-offset-1",
            )}
          >
            <Image
              src={slide.src}
              alt=""
              fill
              sizes="(max-width: 640px) 15vw, 90px"
              className={cn(
                "object-cover transition-opacity group-hover:opacity-100",
                i === index ? "opacity-100" : "opacity-70",
              )}
            />
          </button>
        ))}
      </div>
      {/* Announced only when the slideshow is paused — i.e. when the visitor is
          the one moving through it — so auto-advance stays quiet. */}
      <p className="sr-only" aria-live={paused ? "polite" : "off"}>
        Photo {index + 1} of {count}
      </p>
    </div>
  );
}
