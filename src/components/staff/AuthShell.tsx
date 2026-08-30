import Link from "next/link";

import { siteConfig } from "@/data/site";

type Props = {
  /** The small line under the brand, saying which step this is. */
  subtitle: string;
  children: React.ReactNode;
  /** Whatever belongs under the card — a way onward, or who to ask for help. */
  footer?: React.ReactNode;
};

/**
 * The frame around all three staff sign-in screens: the password box, the setup
 * code, and choosing a password.
 *
 * They are one flow an employee walks through on their phone in a back room, so
 * they are deliberately the same card in the same place on the page — only the
 * contents change underneath them.
 */
export function StaffAuthShell({ subtitle, children, footer }: Props) {
  const [brandFirst, ...brandRest] = siteConfig.name.split(" ");

  return (
    <div className="flex flex-1 items-center justify-center bg-muted px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-heading text-2xl font-bold tracking-tight">
            <span className="text-brand">{brandFirst}</span> {brandRest.join(" ")}
          </p>
          <h1 className="mt-1 text-sm text-muted-foreground">{subtitle}</h1>
        </div>

        <div className="rounded-xl border border-border bg-background p-6 shadow-sm">{children}</div>

        {footer}

        <p className="mt-2 text-center text-xs text-muted-foreground">
          <Link href="/" className="hover:underline">
            ← Back to the website
          </Link>
        </p>
      </div>
    </div>
  );
}
