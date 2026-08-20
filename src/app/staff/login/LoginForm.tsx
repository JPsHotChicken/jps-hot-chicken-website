"use client";

import { useActionState, useState } from "react";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/CodeInput";
import { staffLogin, type StaffLoginState } from "../actions";

const LENGTH = 4;

export function StaffLoginForm() {
  const [state, formAction, pending] = useActionState<StaffLoginState, FormData>(staffLogin, {});
  const [code, setCode] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      <CodeInput
        length={LENGTH}
        name="code"
        legend="Your four digit code"
        describedBy={state.error ? "staff-login-error" : undefined}
        onChange={setCode}
      />

      {state.error && (
        <p id="staff-login-error" role="alert" className="text-center text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={pending || code.length < LENGTH}
        className="w-full"
      >
        <LogIn data-icon="inline-start" />
        {pending ? "Checking…" : "See my schedule"}
      </Button>
    </form>
  );
}
