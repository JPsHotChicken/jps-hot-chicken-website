"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type InteriorSlide = {
  src: string;
  alt: string;
};

type InteriorSlideshowProps = {
  images: InteriorSlide[];
  className?: string;
};

/**
 * Manual photo slideshow: one large image with overlay arrows, and a row of
 * thumbnails underneath — every photo at once, the current one highlighted —
 * that jump straight to a photo. The arrows wrap in both directions, so there
 * is no dead end at either end of the strip. Left/right arrow keys move between
 * photos while the slideshow has focus.
 */
export function InteriorSlideshow({ images, className }: InteriorSlideshowProps) {
  const [index, setIndex] = useState(0);
  const count = images.length;

  // Wrap in both directions so the arrows and thumbnails never dead-end.
  const step = useCallback(
    (delta: number) => setIndex((i) => (i + delta + count) % count),
    [count],
  );

  if (count === 0) return null;

  const current = images[index];

  return (
    <div
      className={cn("w-full", className)}
      role="group"
      aria-roledescription="carousel"
      aria-label="Trenton interior photos"
      tabIndex={0}
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
      {/* Large image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-muted">
        <Image
          key={current.src}
          src={current.src}
          alt={current.alt}
          fill
          sizes="(max-width: 640px) 100vw, 768px"
          className="object-cover"
        />
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
      <p className="sr-only" aria-live="polite">
        Photo {index + 1} of {count}
      </p>
    </div>
  );
}
