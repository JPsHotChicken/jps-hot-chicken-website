"use client";

import { trackEvent, type ClickEvent, type ClickEventParams } from "@/lib/analytics";
import { trackConversion, type ConversionName } from "@/lib/google-ads";

type TrackedLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  event: ClickEvent;
  eventParams?: ClickEventParams;
  /** Also report a Google Ads conversion (e.g. "call"). */
  conversion?: ConversionName;
};

/**
 * A real `<a href>` (crawlable, works without JS) that reports a GA4 click
 * event on the way out. External links open in a new tab, so the page never
 * unloads under the beacon.
 */
export function TrackedLink({
  href,
  event,
  eventParams,
  conversion,
  onClick,
  children,
  ...rest
}: TrackedLinkProps) {
  const isExternal = /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        trackEvent(event, { link_url: href, ...eventParams });
        if (conversion) trackConversion(conversion);
      }}
    >
      {children}
      {isExternal && <span className="sr-only"> (opens in a new tab)</span>}
    </a>
  );
}
