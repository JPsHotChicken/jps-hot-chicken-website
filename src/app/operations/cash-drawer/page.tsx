import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  OPERATIONS_SESSION_COOKIE,
  verifyOperationsSessionToken,
} from "@/lib/operations-auth";
import { OperationsShell } from "@/components/operations/OperationsShell";
import { CashCount } from "@/components/operations/CashCount";
import { findSection } from "@/components/operations/sections";

const SECTION = findSection("cash-drawer");

export const metadata: Metadata = {
  title: "Cash drawer counting",
  robots: { index: false, follow: false },
};

/**
 * Counting the drawer down at close.
 *
 * Nothing is stored: a count is a conversation with the money in front of you,
 * and once the till is set and the drop is banded there is nothing left worth
 * keeping. That also means no drawer figures ever leave the iPad. The page is
 * only here to check the door is locked and hand over to the counting screen.
 */
export default async function CashDrawerPage() {
  const cookieStore = await cookies();
  if (!(await verifyOperationsSessionToken(cookieStore.get(OPERATIONS_SESSION_COOKIE)?.value))) {
    redirect("/operations/login");
  }

  return (
    <OperationsShell
      title={SECTION?.label ?? "Cash drawer counting"}
      description="Count down, set the till to $200, drop the rest"
      back={{ href: "/operations", label: "Back to operations" }}
      wide
    >
      <CashCount />
    </OperationsShell>
  );
}
