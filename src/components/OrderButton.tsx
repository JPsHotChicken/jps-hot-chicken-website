import Link from "next/link";

import { cn } from "@/lib/utils";

type OrderButtonProps = {
  /** Visual size. `lg` is for hero/page CTAs, `default` for the nav. */
  size?: "default" | "lg";
  /** `solid` is the filled brand CTA; `outline` is the bordered nav pill. */
  variant?: "solid" | "outline";
  /** Where the button links. Defaults to the location picker at /order. */
  href?: string;
  className?: string;
  /** Override the visible label. */
  children?: React.ReactNode;
};

/**
 * The transactional CTA. Defaults to the internal /order location picker; pass
 * an external ordering URL to link out in a new tab instead. Sized for
 * comfortable tap targets (>=44px).
 */
export function OrderButton({
  size = "default",
  variant = "solid",
  href = "/order",
  className,
  children = "Order Online",
}: OrderButtonProps) {
  const isExternal = /^https?:\/\//.test(href);
  const buttonClass = cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-heading font-semibold tracking-wide transition-all focus-visible:outline-none focus-visible:ring-3",
    size === "lg" ? "h-14 px-8 text-lg" : "h-11 px-6 text-base",
    variant === "solid"
      ? "bg-brand text-brand-foreground shadow-sm hover:brightness-110 hover:shadow-md focus-visible:ring-brand/50"
      : "border border-foreground/25 bg-background text-foreground hover:bg-muted focus-visible:ring-foreground/30",
    className,
  );
  const inner = (
    <>
      {children}
      {isExternal && <span className="sr-only"> (opens in a new tab)</span>}
      {variant === "solid" && <span aria-hidden="true">→</span>}
    </>
  );

  return isExternal ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClass}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={buttonClass}>
      {inner}
    </Link>
  );
}
