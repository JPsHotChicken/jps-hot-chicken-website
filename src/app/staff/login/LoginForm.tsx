"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { staffLogin, type StaffLoginState } from "../actions";

export function StaffLoginForm() {
  const [state, formAction, pending] = useActionState<StaffLoginState, FormData>(staffLogin, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="staff-password" className="block text-sm font-semibold">
          Your password
        </label>
        <input
          id="staff-password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-describedby={state.error ? "staff-login-error" : undefined}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {state.error && (
        <p id="staff-login-error" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        <LogIn data-icon="inline-start" />
        {pending ? "Checking…" : "See my schedule"}
      </Button>
    </form>
  );
}
