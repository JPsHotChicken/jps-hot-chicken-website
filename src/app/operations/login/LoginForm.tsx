"use client";

import { useActionState, useState } from "react";
import { Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CodeInput } from "@/components/CodeInput";
import { OPERATIONS_CODE_LENGTH } from "@/lib/operations-auth";
import { operationsLogin, type OperationsLoginState } from "../actions";

export function OperationsLoginForm() {
  const [state, formAction, pending] = useActionState<OperationsLoginState, FormData>(
    operationsLogin,
    {},
  );
  const [code, setCode] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      <CodeInput
        length={OPERATIONS_CODE_LENGTH}
        name="code"
        legend="Access code"
        describedBy={state.error ? "operations-login-error" : undefined}
        onChange={setCode}
      />

      {state.error && (
        <p id="operations-login-error" role="alert" className="text-center text-sm text-destructive">
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={pending || code.length < OPERATIONS_CODE_LENGTH}
        className="w-full"
      >
        <Lock data-icon="inline-start" />
        {pending ? "Checking…" : "Unlock"}
      </Button>
    </form>
  );
}
