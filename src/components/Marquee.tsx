import Image from "next/image";

import { cn } from "@/lib/utils";
import type { FoodImage } from "@/data/food";

type MarqueeProps = {
  images: FoodImage[];
  /** Tailwind size classes for each image box, e.g. "h-44 w-44 sm:h-60 sm:w-60". */
  itemClassName: string;
  /** Literal animation utility, e.g. "animate-[marquee_45s_linear_infinite]". */
  animationClassName: string;
  /** `sizes` hint for next/image. */
  sizes?: string;
  /** Object-fit/position classes for each image. */
  imageClassName?: string;
};

/**
 * Infinite, auto-scrolling horizontal image strip (pure CSS, no JS).
 * The image list is rendered twice so the -50% keyframe loops seamlessly.
 * Respects `prefers-reduced-motion`.
 */
export function Marquee({
  images,
  itemClassName,
  animationClassName,
  sizes = "240px",
  imageClassName = "object-contain",
}: MarqueeProps) {
  const items = [...images, ...images];

  return (
    <div className="w-full overflow-hidden">
      <div className={cn("flex w-max", animationClassName, "motion-reduce:animate-none")}>
        {items.map((img, i) => {
          const isDuplicate = i >= images.length;
          return (
            <div key={i} className="shrink-0 px-3 sm:px-4" aria-hidden={isDuplicate}>
              <div className={cn("relative", itemClassName)}>
                <Image
                  src={img.src}
                  alt={isDuplicate ? "" : img.alt}
                  fill
                  sizes={sizes}
                  // Already pre-compressed WebP at display size — skip the
                  // on-demand optimizer (avoids CPU cost for ~28 images).
                  unoptimized
                  loading="lazy"
                  className={imageClassName}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
