"use client";

import { useRef, useState } from "react";

type Props = {
  /** How many digits the code has. */
  length: number;
  /** Name of the hidden field the joined digits are posted under. */
  name: string;
  /** Wording above the boxes. */
  legend: string;
  /** Id of the error message to point each box at, when there is one. */
  describedBy?: string;
  /** Told the current value so the submit button can wait for a full code. */
  onChange?: (code: string) => void;
};

/**
 * A row of single-digit boxes for typing a short numeric code.
 *
 * Separate boxes rather than one text field: on a phone this is the difference
 * between tapping a keypad and fighting an autocorrecting keyboard. The boxes
 * mirror their value into one hidden input, so the form still posts a plain
 * field and works without JavaScript having to run first.
 *
 * Shared by the staff sign-in and the operations gate — same gesture, same
 * muscle memory, whichever code somebody is typing.
 */
export function CodeInput({ length, name, legend, describedBy, onChange }: Props) {
  const [digits, setDigits] = useState<string[]>(Array(length).fill(""));
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  const update = (next: string[]) => {
    setDigits(next);
    onChange?.(next.join(""));
  };

  const setDigit = (index: number, value: string) => {
    const next = [...digits];
    next[index] = value;
    update(next);
  };

  const handleChange = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return setDigit(index, "");

    // Pasting or fast typing can deliver several digits at once — spread them
    // across the remaining boxes rather than dropping all but the first.
    if (typed.length > 1) {
      const next = [...digits];
      for (let i = 0; i < typed.length && index + i < length; i++) {
        next[index + i] = typed[i];
      }
      update(next);
      boxes.current[Math.min(index + typed.length, length - 1)]?.focus();
      return;
    }

    setDigit(index, typed);
    if (index < length - 1) boxes.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      setDigit(index - 1, "");
      boxes.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) boxes.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < length - 1) boxes.current[index + 1]?.focus();
  };

  return (
    <>
      <input type="hidden" name={name} value={digits.join("")} />

      <fieldset>
        <legend className="mb-2 block text-sm font-semibold">{legend}</legend>
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
              aria-label={`Digit ${index + 1} of ${length}`}
              aria-describedby={describedBy}
              autoFocus={index === 0}
              className="size-14 rounded-lg border border-border bg-background text-center font-heading text-2xl font-bold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          ))}
        </div>
      </fieldset>
    </>
  );
}
