import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import {
  OPERATIONS_SESSION_COOKIE,
  verifyOperationsSessionToken,
} from "@/lib/operations-auth";
import { OperationsShell } from "@/components/operations/OperationsShell";
import { OPERATIONS_SECTIONS, operationsHref } from "@/components/operations/sections";

export const metadata: Metadata = {
  title: "Operations",
  robots: { index: false, follow: false },
};

/**
 * The operations hub.
 *
 * A shelf of the tools the crew reaches for during a shift, listed from
 * `sections.tsx`. One shared access code covers the lot — unlike `/staff` there
 * is nobody to identify, only a door to keep shut.
 */
export default async function OperationsPage() {
  // `proxy.ts` already redirects locked-out visitors; checking again here means
  // the page can never render off the back of a forged cookie.
  const cookieStore = await cookies();
  if (!(await verifyOperationsSessionToken(cookieStore.get(OPERATIONS_SESSION_COOKIE)?.value))) {
    redirect("/operations/login");
  }

  return (
    <OperationsShell
      title="Operations"
      description="Running the store, shift by shift"
      back={{ href: "/", label: "Back to the website" }}
    >
      <nav className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        <ul className="divide-y divide-border">
          {OPERATIONS_SECTIONS.map((section) => (
            <li key={section.slug}>
              <Link
                href={operationsHref(section.slug)}
                className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="text-brand">{section.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-heading text-base font-bold">{section.label}</span>
                    {!section.ready && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
                        Coming soon
                      </span>
                    )}
                  </span>
                  <span className="block text-sm text-muted-foreground">{section.hint}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </OperationsShell>
  );
}
