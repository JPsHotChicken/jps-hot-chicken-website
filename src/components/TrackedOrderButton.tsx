"use client";

import { cn } from "@/lib/utils";
import { trackConversion } from "@/lib/google-ads";
import { decorateOrderingUrl, readAttribution } from "@/lib/attribution";

type TrackedOrderButtonProps = {
  /** The ordering platform URL (Toast, SkyTab) or an internal /order path. */
  href: string;
  size?: "default" | "lg";
  variant?: "solid" | "outline";
  className?: string;
  children?: React.ReactNode;
};

/**
 * The order CTA, with a Google Ads conversion attached.
 *
 * This is the site's main tracked action. Because checkout happens on an
 * external ordering platform, the click is all we can see — see the caveat at
 * the top of `lib/google-ads.ts` before reading anything into the numbers.
 *
 * Navigation is deferred until the conversion beacon is away (or a 1s timeout
 * fires), because otherwise the browser cancels the request on its way out and
 * the conversion never lands. If the tag is missing or blocked, the click still
 * goes through immediately — tracking must never cost an order.
 */
export function TrackedOrderButton({
  href,
  size = "lg",
  variant = "solid",
  className,
  children = "Order Online",
}: TrackedOrderButtonProps) {
  const isExternal = /^https?:\/\//.test(href);

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle modified clicks (new tab, download, middle click)
    // on its own — intercepting those breaks expected behaviour.
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();
    // Carry the click id across to the ordering platform so a completed order
    // over there can still be credited to the keyword that paid for the click.
    // Read at click time, not at render, so a click id captured after this
    // component mounted is still picked up.
    const destination = isExternal
      ? decorateOrderingUrl(href, readAttribution())
      : href;
    trackConversion("order", () => {
      if (isExternal) {
        window.open(destination, "_blank", "noopener,noreferrer");
      } else {
        window.location.href = destination;
      }
    });
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-heading font-semibold tracking-wide transition-all focus-visible:outline-none focus-visible:ring-3",
        size === "lg" ? "h-14 px-8 text-lg" : "h-11 px-6 text-base",
        variant === "solid"
          ? "bg-brand text-brand-foreground shadow-sm hover:brightness-110 hover:shadow-md focus-visible:ring-brand/50"
          : "border border-foreground/25 bg-background text-foreground hover:bg-muted focus-visible:ring-foreground/30",
        className,
      )}
    >
      {children}
      {isExternal && <span className="sr-only"> (opens in a new tab)</span>}
    </a>
  );
}
