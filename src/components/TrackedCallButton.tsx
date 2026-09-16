"use client";

import { Phone } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPhone, telHref } from "@/lib/format";
import { trackConversion } from "@/lib/google-ads";

type TrackedCallButtonProps = {
  phone: string;
  size?: "default" | "lg";
  className?: string;
  /** Label override. Defaults to the formatted number. */
  children?: React.ReactNode;
};

/**
 * Click-to-call, with a Google Ads conversion attached.
 *
 * For a restaurant this is often the highest-intent action on the page —
 * someone phoning about a large order is worth far more than a click. It counts
 * the tap, not a connected call; Google's own call reporting is what measures
 * call duration, and that is set up separately in the Ads UI.
 *
 * A `tel:` link hands off to the dialer rather than unloading the page, so the
 * conversion is not racing a navigation the way the order button is. Firing it
 * through the same helper keeps the behaviour identical either way.
 */
export function TrackedCallButton({
  phone,
  size = "lg",
  className,
  children,
}: TrackedCallButtonProps) {
  return (
    <a
      href={telHref(phone)}
      onClick={() => trackConversion("call")}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border border-foreground/25 bg-background font-heading font-semibold tracking-wide text-foreground transition-all hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-foreground/30",
        size === "lg" ? "h-14 px-8 text-lg" : "h-11 px-6 text-base",
        className,
      )}
    >
      <Phone className="size-5 shrink-0" aria-hidden="true" />
      {children ?? `Call ${formatPhone(phone)}`}
    </a>
  );
}
