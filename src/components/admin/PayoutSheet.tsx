"use client";

import { useState } from "react";
import { RotateCcw, TriangleAlert, UserPlus, Users, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FIELD_CLASS } from "./field";
import {
  formatHours,
  formatMoney,
  hoursOf,
  type HoursBasis,
  type Payout,
  type PayoutShare,
  type TipsPerson,
} from "@/lib/tips";

/** What the owner has typed over the top of one person's imported figures. */
export type RowState = {
  included: boolean;
  /** Null while the hours are whatever the clock said. */
  hours: string | null;
  extra: string;
};

type Props = {
  people: TipsPerson[];
  rows: Record<string, RowState>;
  payout: Payout;
  basis: HoursBasis;
  onToggle: (id: string, included: boolean) => void;
  onHours: (id: string, value: string) => void;
  onResetHours: (id: string) => void;
  onExtra: (id: string, value: string) => void;
  onRemove: (id: string) => void;
  onAdd: (name: string) => string | null;
};

const CELL = "px-2 py-1.5 text-right font-mono text-sm tabular-nums";
const HEAD = "px-2 py-2 text-right text-xs font-semibold text-muted-foreground";

/** A money cell that isn't editable — worked out, not typed. */
function Money({ value, muted }: { value: number; muted?: boolean }) {
  return (
    <td className={`${CELL} ${muted ? "text-muted-foreground" : ""}`}>
      {value === 0 && muted ? "—" : formatMoney(value)}
    </td>
  );
}

/**
 * The payout itself: a row per person, and what each of them is owed.
 *
 * Hours arrive from the time clock but stay editable, because the clock is
 * sometimes wrong in ways only the owner knows about — a shift that auto-closed
 * at 4am is the obvious one, and those rows carry the clock's own warning so
 * they don't slip through. Unticking somebody takes them off the payout
 * entirely and shares their money out among everyone else.
 */
export function PayoutSheet({
  people,
  rows,
  payout,
  basis,
  onToggle,
  onHours,
  onResetHours,
  onExtra,
  onRemove,
  onAdd,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const shares = new Map<string, PayoutShare>(payout.shares.map((share) => [share.id, share]));

  const add = () => {
    const problem = onAdd(name);
    if (problem) {
      setError(problem);
      return;
    }
    setName("");
    setError(null);
    setAdding(false);
  };

  return (
    <div className="rounded-xl border border-border bg-background shadow-sm print:border-0 print:shadow-none">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="mr-auto flex items-center gap-2 font-heading text-base font-bold">
          <Users className="size-4 text-brand" />
          Payout
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAdding((current) => !current)}
          aria-expanded={adding}
          className="print:hidden"
        >
          <UserPlus data-icon="inline-start" />
          Add someone
        </Button>
      </header>

      {adding && (
        <div className="flex flex-wrap items-end gap-2 border-b border-border bg-muted/50 px-4 py-3 print:hidden">
          <div className="min-w-48 flex-1">
            <label className="block text-xs font-semibold text-muted-foreground" htmlFor="add-name">
              Who wasn&apos;t on the clock export?
            </label>
            <input
              id="add-name"
              value={name}
              autoFocus
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") add();
                if (event.key === "Escape") setAdding(false);
              }}
              maxLength={80}
              placeholder="Jordan Godfrey"
              aria-invalid={error !== null}
              className={`mt-1 ${FIELD_CLASS}`}
            />
          </div>
          <Button size="sm" onClick={add}>
            Add
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
            Cancel
          </Button>
          {error && (
            <p role="alert" className="w-full text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}

      {people.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Nobody here yet. Import a time clock export and everyone on it lands in this list with
          their hours added up.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="w-8 px-2 py-2 print:hidden">
                  <span className="sr-only">Paying</span>
                </th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground">
                  Employee
                </th>
                <th className={HEAD}>Hours</th>
                <th className={HEAD}>Tips</th>
                <th className={HEAD} title="Their share of the bonus pool, split evenly">
                  Shared bonus
                </th>
                <th className={`${HEAD} w-32`} title="A bonus for this person alone">
                  Individual bonus
                </th>
                <th className={HEAD} title="Shared bonus plus individual bonus">
                  Bonuses
                </th>
                <th className={HEAD}>Total</th>
                <th className="w-8 px-2 py-2 print:hidden">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>

            <tbody>
              {people.map((person) => {
                const row = rows[person.id];
                const share = shares.get(person.id);
                if (!row || !share) return null;

                const clockHours = hoursOf(person, basis);
                const edited = row.hours !== null;

                return (
                  <tr
                    key={person.id}
                    className={`border-b border-border last:border-0 ${
                      row.included ? "" : "opacity-45 print:hidden"
                    }`}
                  >
                    <td className="px-2 py-1.5 print:hidden">
                      <input
                        type="checkbox"
                        checked={row.included}
                        onChange={(event) => onToggle(person.id, event.target.checked)}
                        aria-label={`Pay ${person.name}`}
                        className="size-4 accent-brand"
                      />
                    </td>

                    <td className="px-2 py-1.5">
                      <span className="block text-sm font-medium">{person.name}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {person.manual ? (
                          <span>Added by hand</span>
                        ) : (
                          <span>
                            {person.shifts} {person.shifts === 1 ? "shift" : "shifts"}
                          </span>
                        )}
                        {person.anomalies.map((anomaly) => (
                          <span
                            key={anomaly}
                            className="inline-flex items-center gap-1 text-destructive"
                            title="The time clock flagged this — check the hours before paying it."
                          >
                            <TriangleAlert className="size-3" />
                            {anomaly.toLowerCase()}
                          </span>
                        ))}
                      </span>
                    </td>

                    <td className={CELL}>
                      <span className="flex items-center justify-end gap-1">
                        <input
                          value={row.hours ?? formatHours(clockHours)}
                          onChange={(event) => onHours(person.id, event.target.value)}
                          inputMode="decimal"
                          aria-label={`Hours for ${person.name}`}
                          disabled={!row.included}
                          className={`!w-20 text-right font-mono tabular-nums ${FIELD_CLASS} ${
                            edited ? "border-brand" : ""
                          } print:border-0 print:p-0`}
                        />
                        {edited && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => onResetHours(person.id)}
                            title={`Back to the clock's ${formatHours(clockHours)}`}
                            aria-label={`Reset hours for ${person.name}`}
                            className="print:hidden"
                          >
                            <RotateCcw />
                          </Button>
                        )}
                      </span>
                    </td>

                    <Money value={share.tipShare} muted={!row.included} />
                    <Money value={share.bonusShare} muted={!row.included} />

                    <td className={CELL}>
                      <input
                        value={row.extra}
                        onChange={(event) => onExtra(person.id, event.target.value)}
                        inputMode="decimal"
                        placeholder="0.00"
                        aria-label={`Individual bonus for ${person.name}`}
                        disabled={!row.included}
                        className={`!w-24 text-right font-mono tabular-nums ${FIELD_CLASS} print:border-0 print:p-0`}
                      />
                    </td>

                    <Money value={share.bonuses} muted={!row.included} />

                    <td className={`${CELL} font-semibold`}>{formatMoney(share.total)}</td>

                    <td className="px-2 py-1.5 print:hidden">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onRemove(person.id)}
                        title={`Take ${person.name} off this sheet`}
                        aria-label={`Remove ${person.name}`}
                      >
                        <X />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr className="border-t-2 border-border bg-muted/50">
                <td className="print:hidden" />
                <td className="px-2 py-2 text-sm font-semibold">
                  {payout.people} {payout.people === 1 ? "person" : "people"}
                </td>
                <td className={`${CELL} font-semibold`}>{formatHours(payout.hours)}</td>
                <td className={`${CELL} font-semibold`}>{formatMoney(payout.tips)}</td>
                <td className={`${CELL} font-semibold`}>{formatMoney(payout.bonus)}</td>
                <td className={`${CELL} font-semibold`}>{formatMoney(payout.extras)}</td>
                <td className={`${CELL} font-semibold`}>{formatMoney(payout.bonuses)}</td>
                <td className={`${CELL} font-bold`}>{formatMoney(payout.total)}</td>
                <td className="print:hidden" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
