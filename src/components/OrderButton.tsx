import { cn } from "@/lib/utils";
import { siteConfig } from "@/data/site";

type OrderButtonProps = {
  /** Visual size. `lg` is for hero/page CTAs, `default` for the nav. */
  size?: "default" | "lg";
  /** `solid` is the filled brand CTA; `outline` is the bordered nav pill. */
  variant?: "solid" | "outline";
  /** Where the button links. Defaults to the general ordering URL. */
  href?: string;
  className?: string;
  /** Override the visible label. */
  children?: React.ReactNode;
};

/**
 * The transactional CTA. Links out to a third-party ordering provider in a new
 * tab. Sized for comfortable tap targets (>=44px).
 */
export function OrderButton({
  size = "default",
  variant = "solid",
  href = siteConfig.orderingUrl,
  className,
  children = "Order Online",
}: OrderButtonProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
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
      <span className="sr-only"> (opens in a new tab)</span>
      {variant === "solid" && <span aria-hidden="true">→</span>}
    </a>
  );
}
