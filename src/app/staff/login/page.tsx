import type { Metadata } from "next";
import Link from "next/link";

import { StaffAuthShell } from "@/components/staff/AuthShell";
import { StaffLoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Staff sign in",
  robots: { index: false, follow: false },
};

export default function StaffLoginPage() {
  return (
    <StaffAuthShell
      subtitle="Staff schedule"
      footer={
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Forgotten your password? Ask your manager — they can read it back to you.
        </p>
      }
    >
      <StaffLoginForm />

      {/* The way in for anybody who has a code but no password yet. Deliberately
          under the form and plainly worded: this is the first thing a new hire
          is looking for, and they are being talked through it by a manager. */}
      <div className="mt-5 border-t border-border pt-5 text-center">
        <p className="text-sm text-muted-foreground">New to signing in?</p>
        <Link
          href="/staff/setup"
          className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          Set up my password
        </Link>
      </div>
    </StaffAuthShell>
  );
}
