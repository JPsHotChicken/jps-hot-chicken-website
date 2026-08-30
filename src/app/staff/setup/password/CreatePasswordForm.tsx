"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { STAFF_PASSWORD_MIN_LENGTH } from "@/lib/staff-auth";
import { staffCreatePassword, type StaffSetupState } from "../../actions";

const FIELD =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function CreatePasswordForm({ name }: { name: string }) {
  const [state, formAction, pending] = useActionState<StaffSetupState, FormData>(
    staffCreatePassword,
    {},
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const tooShort = password.length > 0 && password.length < STAFF_PASSWORD_MIN_LENGTH;
  // Only complain about a mismatch once there is enough typed to be a mismatch,
  // rather than shouting at somebody halfway through the second box.
  const mismatch = confirm.length > 0 && !password.startsWith(confirm);
  const ready = password.length >= STAFF_PASSWORD_MIN_LENGTH && password === confirm;

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Hi {name} — pick a password you&apos;ll remember. You&apos;ll type it on its own to see your
        schedule, so make it yours.
      </p>

      <div className="space-y-2">
        <label htmlFor="new-password" className="block text-sm font-semibold">
          New password
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          autoFocus
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={tooShort}
          aria-describedby="password-rule"
          className={FIELD}
        />
        <p id="password-rule" className="text-xs text-muted-foreground">
          At least {STAFF_PASSWORD_MIN_LENGTH} characters.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="confirm-password" className="block text-sm font-semibold">
          Type it again
        </label>
        <input
          id="confirm-password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          aria-invalid={mismatch}
          className={FIELD}
        />
        {mismatch && <p className="text-xs text-destructive">Those don&apos;t match yet.</p>}
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending || !ready} className="w-full">
        <Check data-icon="inline-start" />
        {pending ? "Saving…" : "Save password and sign in"}
      </Button>
    </form>
  );
}
