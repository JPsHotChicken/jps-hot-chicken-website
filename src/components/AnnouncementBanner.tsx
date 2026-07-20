import type { ComponentType } from "react";
import Link from "next/link";
import { AlertTriangle, Info, Megaphone } from "lucide-react";

import { cn } from "@/lib/utils";
import { siteConfig } from "@/data/site";

/**
 * Site announcement bar. Reusable: drop `<AnnouncementBanner />` anywhere and it
 * reads the current notice from `siteConfig.announcement` (owner flips `enabled`
 * on/off and edits the text there). Renders nothing when disabled or empty.
 *
 * Every prop can also be passed directly to reuse the bar for a one-off notice
 * independent of the site config, e.g.:
 *   <AnnouncementBanner message="We're closed today" variant="warning" />
 */
export type AnnouncementVariant = "brand" | "warning" | "info" | "gray";

const VARIANTS: Record<
  AnnouncementVariant,
  { className: string; Icon: ComponentType<{ className?: string }> }
> = {
  brand: { className: "bg-brand text-brand-foreground", Icon: Megaphone },
  warning: { className: "bg-amber-400 text-amber-950", Icon: AlertTriangle },
  info: { className: "bg-foreground text-background", Icon: Info },
  gray: { className: "bg-gray-300 text-black", Icon: Megaphone },
};

type AnnouncementBannerProps = {
  /** Text to show. Defaults to the site-wide notice. */
  message?: string;
  /** Color/tone of the bar. Defaults to the site-wide setting. */
  variant?: AnnouncementVariant;
  /** Whether to render. Defaults to the site-wide toggle. */
  enabled?: boolean;
  /** When set, the whole bar becomes a link to this URL. Defaults to the site-wide setting. */
  href?: string;
  /** Extra classes for the outer bar (e.g. `sticky top-0 z-40`). */
  className?: string;
};

export function AnnouncementBanner({
  message = siteConfig.announcement.message,
  variant = siteConfig.announcement.variant,
  enabled = siteConfig.announcement.enabled,
  href = siteConfig.announcement.href,
  className,
}: AnnouncementBannerProps) {
  if (!enabled || !message) return null;

  const { className: variantClass, Icon } = VARIANTS[variant];

  const content = (
    <div className="mx-auto flex w-full max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center sm:gap-2.5 sm:py-2.5">
      <Icon className="size-4 shrink-0 sm:size-5" aria-hidden="true" />
      <p className="font-heading text-xs font-semibold uppercase tracking-wide underline-offset-2 group-hover:underline sm:text-sm">
        {message}
      </p>
    </div>
  );

  // When an href is provided, the entire bar is a single link/button.
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "group block transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current",
          variantClass,
          className,
        )}
      >
        {content}
      </Link>
    );
  }

  return (
    <div role="status" aria-live="polite" className={cn(variantClass, className)}>
      {content}
    </div>
  );
}
