import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Download } from "lucide-react";

import { STAFF_SESSION_COOKIE, readStaffSession } from "@/lib/staff-auth";
import { findEmployeeById } from "@/lib/staff-repo";
import { loadStubAccess } from "@/lib/pay-stubs-repo";
import { formatPayDate } from "@/lib/pay-stubs";
import { formatDateRange } from "@/lib/schedule";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/admin/SetupNotice";
import { buttonVariants } from "@/components/ui/button";
import { PayStubViewer } from "@/components/staff/PayStubViewer";

export const metadata: Metadata = {
  title: "My pay stub",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One pay stub, for the person it belongs to.
 *
 * The page checks ownership itself rather than trusting that it was reached
 * from the dashboard — and the PDF inside it is fetched through
 * `/api/pay-stubs/[stubId]`, which checks again. Two locks on one door, because
 * what is behind it is somebody's wages and the account their pay lands in.
 */
export default async function StaffPayStubPage({
  params,
}: {
  params: Promise<{ stubId: string }>;
}) {
  const cookieStore = await cookies();
  const employeeId = await readStaffSession(cookieStore.get(STAFF_SESSION_COOKIE)?.value);
  if (!employeeId) redirect("/staff/login");

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const employee = await findEmployeeById(employeeId);
  if (!employee) redirect("/staff/login");

  const { stubId } = await params;
  const stub = await loadStubAccess(stubId);
  // Somebody else's stub and a stub that does not exist look the same from
  // here, as does one from a pay run that has not been released yet.
  if (!stub || stub.employeeId !== employeeId || !stub.releasedAt) notFound();

  const period =
    stub.periodStart && stub.periodEnd
      ? formatDateRange(stub.periodStart, stub.periodEnd)
      : null;

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/staff"
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            aria-label="Back to my schedule"
          >
            <ChevronLeft />
          </Link>

          <div className="mr-auto min-w-0">
            <h1 className="truncate font-heading text-base font-bold tracking-tight">
              {period ?? formatPayDate(stub.payDate)}
            </h1>
            <p className="text-xs text-muted-foreground">
              {period ? `Paid ${formatPayDate(stub.payDate)}` : "Pay stub"}
            </p>
          </div>

          <a
            href={`/api/pay-stubs/${stub.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download data-icon="inline-start" />
            Open
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 p-4 sm:px-6">
        <PayStubViewer stubId={stub.id} />
        <p className="mt-3 text-center text-xs text-muted-foreground">
          This is your pay stub. Only you and the owner can open it.
        </p>
      </main>
    </div>
  );
}
