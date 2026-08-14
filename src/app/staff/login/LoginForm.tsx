"use client";

import { useActionState, useRef, useState } from "react";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { staffLogin, type StaffLoginState } from "../actions";

const LENGTH = 4;

/**
 * Four separate boxes rather than one text field: on a phone this is the
 * difference between tapping a keypad and fighting an autocorrecting keyboard.
 * The boxes mirror their value into one hidden input, so the form still posts a
 * plain `code` field and works without JavaScript running first.
 */
export function StaffLoginForm() {
  const [state, formAction, pending] = useActionState<StaffLoginState, FormData>(staffLogin, {});
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  const code = digits.join("");

  const setDigit = (index: number, value: string) => {
    setDigits((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  };

  const handleChange = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return setDigit(index, "");

    // Pasting or fast typing can deliver several digits at once — spread them
    // across the remaining boxes rather than dropping all but the first.
    if (typed.length > 1) {
      setDigits((current) => {
        const next = [...current];
        for (let i = 0; i < typed.length && index + i < LENGTH; i++) {
          next[index + i] = typed[i];
        }
        return next;
      });
      boxes.current[Math.min(index + typed.length, LENGTH - 1)]?.focus();
      return;
    }

    setDigit(index, typed);
    if (index < LENGTH - 1) boxes.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      setDigit(index - 1, "");
      boxes.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) boxes.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < LENGTH - 1) boxes.current[index + 1]?.focus();
  };

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="code" value={code} />

      <fieldset>
        <legend className="mb-2 block text-sm font-semibold">Your four digit code</legend>
        <div className="flex justify-center gap-2">
          {digits.map((digit, index) => (
            <input
              key={`digit-${index}`}
              ref={(element) => {
                boxes.current[index] = element;
              }}
              value={digit}
              onChange={(event) => handleChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onFocus={(event) => event.target.select()}
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              aria-label={`Digit ${index + 1} of ${LENGTH}`}
              aria-describedby={state.error ? "staff-login-error" : undefined}
              autoFocus={index === 0}
              className="size-14 rounded-lg border border-border bg-background text-center font-heading text-2xl font-bold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          ))}
        </div>
      </fieldset>

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
