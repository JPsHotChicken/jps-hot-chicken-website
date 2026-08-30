import type { Metadata } from "next";
import Link from "next/link";

import { StaffAuthShell } from "@/components/staff/AuthShell";
import { SetupCodeForm } from "./SetupCodeForm";

export const metadata: Metadata = {
  title: "Set up your password",
  robots: { index: false, follow: false },
};

/**
 * Step one of a first sign-in.
 *
 * The five digit code is the only thing that proves who somebody is here, so it
 * is checked on the server and traded for a short-lived cookie before the next
 * page will let anyone choose a password. Nothing about the employee is shown
 * back — a wrong code shouldn't tell a stranger whose it nearly was.
 */
export default function StaffSetupPage() {
  return (
    <StaffAuthShell
      subtitle="Set up your password"
      footer={
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Your manager has your code. Already set a password?{" "}
          <Link href="/staff/login" className="font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <p className="mb-5 text-sm text-muted-foreground">
        Enter the five digit code your manager gave you. You&apos;ll pick your own password next.
      </p>

      <SetupCodeForm />
    </StaffAuthShell>
  );
}
