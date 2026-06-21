import { cn } from "@/lib/utils";
import { siteConfig } from "@/data/site";

type OrderButtonProps = {
  /** Visual size. `lg` is for hero/page CTAs, `default` for the nav. */
  size?: "default" | "lg";
  className?: string;
  /** Override the visible label. */
  children?: React.ReactNode;
};

/**
 * The single transactional CTA on the site. Links out to the third-party
 * ordering provider in a new tab. Sized for comfortable tap targets (>=44px).
 */
export function OrderButton({
  size = "default",
  className,
  children = "Order Online",
}: OrderButtonProps) {
  return (
    <a
      href={siteConfig.orderingUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full bg-brand font-heading font-semibold uppercase tracking-wide text-brand-foreground shadow-sm transition-all hover:brightness-110 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/50 active:translate-y-px",
        size === "lg"
          ? "h-14 px-8 text-lg"
          : "h-11 px-6 text-base",
        className,
      )}
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
      <span aria-hidden="true">→</span>
    </a>
  );
}
