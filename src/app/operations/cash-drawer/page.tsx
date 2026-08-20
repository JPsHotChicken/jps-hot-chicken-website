import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Banknote } from "lucide-react";

import {
  OPERATIONS_SESSION_COOKIE,
  verifyOperationsSessionToken,
} from "@/lib/operations-auth";
import { OperationsShell } from "@/components/operations/OperationsShell";
import { findSection } from "@/components/operations/sections";

const SECTION = findSection("cash-drawer");

export const metadata: Metadata = {
  title: "Cash drawer counting",
  robots: { index: false, follow: false },
};

/**
 * Cash drawer counting — the first operations section.
 *
 * The page and its route exist; what it counts and how it adds up is still to
 * be decided, so it says so rather than pretending to be a tool.
 */
export default async function CashDrawerPage() {
  const cookieStore = await cookies();
  if (!(await verifyOperationsSessionToken(cookieStore.get(OPERATIONS_SESSION_COOKIE)?.value))) {
    redirect("/operations/login");
  }

  return (
    <OperationsShell
      title={SECTION?.label ?? "Cash drawer counting"}
      description={SECTION?.hint}
      back={{ href: "/operations", label: "Back to operations" }}
    >
      <section className="rounded-xl border border-border bg-background p-10 text-center shadow-sm">
        <Banknote className="mx-auto size-8 text-muted-foreground" />
        <h2 className="mt-3 font-heading text-base font-bold">Nothing here yet</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          This is where the drawer count will live. The page is ready — the
          counting itself is still to be built.
        </p>
      </section>
    </OperationsShell>
  );
}
