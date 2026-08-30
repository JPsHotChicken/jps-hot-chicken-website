import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { StaffAuthShell } from "@/components/staff/AuthShell";
import { STAFF_SETUP_COOKIE, readStaffSetupToken } from "@/lib/staff-auth";
import { findEmployeeById } from "@/lib/staff-repo";
import { CreatePasswordForm } from "./CreatePasswordForm";

export const metadata: Metadata = {
  title: "Create your password",
  robots: { index: false, follow: false },
};

/**
 * Step two of a first sign-in.
 *
 * Reachable only with the ticket the code page set, which is where the employee
 * id comes from — the form never carries one, so this page cannot be pointed at
 * somebody else. Landing here without a ticket (a bookmark, or a ticket that
 * timed out) just starts the flow again.
 */
export default async function CreatePasswordPage() {
  const cookieStore = await cookies();
  const employeeId = await readStaffSetupToken(cookieStore.get(STAFF_SETUP_COOKIE)?.value);
  if (!employeeId) redirect("/staff/setup");

  const employee = await findEmployeeById(employeeId);
  if (!employee) redirect("/staff/setup");

  return (
    <StaffAuthShell
      subtitle="Create your password"
      footer={
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Not you?{" "}
          <Link href="/staff/setup" className="font-semibold hover:underline">
            Start again
          </Link>
        </p>
      }
    >
      <CreatePasswordForm name={employee.name.split(" ")[0]} />
    </StaffAuthShell>
  );
}
