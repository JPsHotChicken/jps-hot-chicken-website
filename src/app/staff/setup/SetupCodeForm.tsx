"use client";

import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/CodeInput";
import { STAFF_SETUP_CODE_LENGTH } from "@/lib/staff-auth";
import { staffVerifySetupCode, type StaffSetupState } from "../actions";

export function SetupCodeForm() {
  const [state, formAction, pending] = useActionState<StaffSetupState, FormData>(
    staffVerifySetupCode,
    {},
  );
  const [code, setCode] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      <CodeInput
        length={STAFF_SETUP_CODE_LENGTH}
        name="code"
        legend="Your five digit code"
        describedBy={state.error ? "staff-setup-error" : undefined}
        onChange={setCode}
      />

      {state.error && (
        <p id="staff-setup-error" role="alert" className="text-center text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={pending || code.length < STAFF_SETUP_CODE_LENGTH}
        className="w-full"
      >
        <ArrowRight data-icon="inline-start" />
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
