"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import type { FoodImage } from "@/data/food";

type MarqueeProps = {
  images: FoodImage[];
  /** Tailwind WIDTH class(es) for each item, e.g. "w-16 sm:w-20". Images are square. */
  itemClassName: string;
  /** Auto-scroll direction: "left" moves the strip leftward, "right" rightward. */
  direction?: "left" | "right";
  /** Seconds for the strip to travel one full set of images (sets the auto-scroll speed). */
  durationSeconds?: number;
  /** Horizontal padding around each item — controls the gap between images. */
  paddingClassName?: string;
  /** When false, the row is static (centered, no duplication or animation). */
  scroll?: boolean;
  /** `sizes` hint for next/image. */
  sizes?: string;
  /** Object-fit/position classes for each image. */
  imageClassName?: string;
  /** Aspect-ratio class for each image box, e.g. "aspect-square" or "aspect-[3/2]". */
  aspectClassName?: string;
  /** Top-margin class for the item name beneath each image, e.g. "mt-2". */
  labelMarginClassName?: string;
};

/**
 * Horizontal image strip with the item name beneath each image. When `scroll`
 * is true the list is rendered twice (for a seamless loop) and auto-scrolled by
 * animating a GPU-composited `transform: translate3d(...)` via
 * requestAnimationFrame — the same transform technique the original CSS marquee
 * used, so it stays smooth on every browser (including iOS Safari) rather than
 * relying on programmatic `scrollLeft`. The user can grab and drag it back and
 * forth (mouse, touch, or trackpad); auto-scrolling pauses while they interact
 * and resumes shortly after. Respects `prefers-reduced-motion` (no auto-scroll,
 * but still draggable).
 */
export function Marquee({
  images,
  itemClassName,
  direction = "left",
  durationSeconds = 40,
  paddingClassName = "px-3 sm:px-4",
  scroll = true,
  sizes = "240px",
  imageClassName = "object-contain",
  aspectClassName = "aspect-square",
  labelMarginClassName = "mt-2",
}: MarqueeProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Mutable interaction state, kept in a ref so the rAF loop reads live values.
  // `offset` is the current translateX in px (kept within (-half, 0]).
  const state = useRef({ paused: false, dragging: false, lastX: 0, offset: 0 });

  useEffect(() => {
    const track = trackRef.current;
    if (!scroll || !track) return;

    const s = state.current;
    // "left" scrolls the strip leftward → translateX decreases (negative).
    const sign = direction === "right" ? 1 : -1;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let autoOn = !media.matches;
    const onMedia = () => {
      autoOn = !media.matches;
    };
    media.addEventListener?.("change", onMedia);

    // The track holds two identical sets of images, so one set is half its
    // width. Keeping the offset within (-half, 0] loops seamlessly: content at
    // offset x and x-half is identical.
    const half = () => track.scrollWidth / 2;
    const wrap = (x: number) => {
      const h = half();
      if (h <= 0) return 0;
      let v = x % h;
      if (v > 0) v -= h;
      return v;
    };
    const apply = () => {
      track.style.transform = `translate3d(${s.offset}px, 0, 0)`;
    };

    let raf = 0;
    let last = performance.now();
    let resume: ReturnType<typeof setTimeout> | null = null;
    const scheduleResume = (delay: number) => {
      if (resume) clearTimeout(resume);
      resume = setTimeout(() => {
        s.paused = false;
      }, delay);
    };

    apply();

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const h = half();
      if (h > 0 && autoOn && !s.paused && !s.dragging) {
        s.offset = wrap(s.offset + sign * (h / durationSeconds) * dt);
        apply();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onPointerDown = (e: PointerEvent) => {
      s.dragging = true;
      s.paused = true;
      s.lastX = e.clientX;
      if (resume) {
        clearTimeout(resume);
        resume = null;
      }
      // Capture the mouse so a drag keeps tracking outside the strip. For touch
      // we skip capture so the browser can still hand vertical swipes to the page.
      if (e.pointerType === "mouse") {
        try {
          track.setPointerCapture(e.pointerId);
        } catch {}
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!s.dragging) return;
      const dx = e.clientX - s.lastX;
      s.lastX = e.clientX;
      s.offset = wrap(s.offset + dx);
      apply();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!s.dragging) return;
      s.dragging = false;
      try {
        track.releasePointerCapture(e.pointerId);
      } catch {}
      scheduleResume(500);
    };
    // Horizontal trackpad/wheel gestures nudge the strip and briefly pause auto-
    // scroll. Vertical wheel (page scrolling) is ignored so scrolling past the
    // strip never freezes it.
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      s.offset = wrap(s.offset - e.deltaX);
      apply();
      s.paused = true;
      scheduleResume(700);
    };

    track.addEventListener("pointerdown", onPointerDown);
    track.addEventListener("pointermove", onPointerMove);
    track.addEventListener("wheel", onWheel, { passive: true });
    // Listen for release on the window too, so a pointer that lifts off the
    // strip (or a cancelled touch) can never leave auto-scroll stuck paused.
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return () => {
      cancelAnimationFrame(raf);
      if (resume) clearTimeout(resume);
      media.removeEventListener?.("change", onMedia);
      track.removeEventListener("pointerdown", onPointerDown);
      track.removeEventListener("pointermove", onPointerMove);
      track.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [scroll, direction, durationSeconds, images.length]);

  const items = scroll ? [...images, ...images] : images;

  const tiles = items.map((img, i) => {
    const isDuplicate = scroll && i >= images.length;
    return (
      <div key={i} className={cn("shrink-0", paddingClassName)} aria-hidden={isDuplicate}>
        <div className={cn("flex flex-col items-center", itemClassName)}>
          <div className={cn("relative w-full", aspectClassName)}>
            <Image
              src={img.src}
              alt={isDuplicate ? "" : img.alt}
              fill
              sizes={sizes}
              // Already pre-compressed at display size — skip the on-demand
              // optimizer (avoids CPU cost for ~28 images).
              unoptimized
              loading="lazy"
              draggable={false}
              className={imageClassName}
            />
          </div>
          {/* Display name — sits inside the tile, so it scrolls with the
              image. Aria-hidden since the image alt already names it for
              screen readers; this short label is what the customer reads. */}
          <p
            aria-hidden="true"
            className={cn(
              labelMarginClassName,
              "w-full text-center font-heading text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground sm:text-xs",
            )}
          >
            {img.name}
          </p>
        </div>
      </div>
    );
  });

  if (!scroll) {
    return (
      <div className="w-full overflow-hidden">
        <div className="flex justify-center">{tiles}</div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden">
      <div
        ref={trackRef}
        onDragStart={(e) => e.preventDefault()}
        className="flex w-max cursor-grab touch-pan-y select-none will-change-transform active:cursor-grabbing"
      >
        {tiles}
      </div>
    </div>
  );
}
