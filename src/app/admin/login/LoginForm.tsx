"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { login, type LoginState } from "../actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-semibold">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-describedby={state.error ? "login-error" : undefined}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      {state.error && (
        <p id="login-error" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        <Lock data-icon="inline-start" />
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
