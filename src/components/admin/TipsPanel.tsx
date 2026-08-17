"use client";

import { Coins, Gift, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FIELD_CLASS, LABEL_CLASS } from "./field";
import {
  HOURS_BASES,
  HOURS_BASIS_LABELS,
  formatHours,
  formatMoney,
  type HoursBasis,
  type Payout,
} from "@/lib/tips";

type Props = {
  payout: Payout;
  period: string;
  basis: HoursBasis;
  tips: string;
  bonus: string;
  onBasis: (basis: HoursBasis) => void;
  onTips: (value: string) => void;
  onBonus: (value: string) => void;
};

/** One figure in the summary. */
function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">
        {label}
        {hint && <span className="block text-[0.7rem]">{hint}</span>}
      </span>
      <span className="font-mono text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/**
 * The two pots of money, and what they come to per person.
 *
 * They are kept apart because they are shared out differently: tips are earned
 * by the hour, so a double shift is worth two of a half one, while the bonus is
 * the owner's own money and goes out in equal parts.
 */
export function TipsPanel({
  payout,
  period,
  basis,
  tips,
  bonus,
  onBasis,
  onTips,
  onBonus,
}: Props) {
  return (
    <div className="rounded-xl border border-border bg-background shadow-sm">
      <header className="border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <Coins className="size-4 text-brand" />
          The pot
        </h2>
        {period && <p className="mt-0.5 text-xs text-muted-foreground">{period}</p>}
      </header>

      <div className="space-y-4 p-4">
        <div className="print:hidden">
          <label className={LABEL_CLASS} htmlFor="tips-total">
            Tips from the report
          </label>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <input
              id="tips-total"
              value={tips}
              onChange={(event) => onTips(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={`pl-6 font-mono tabular-nums ${FIELD_CLASS}`}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Split by the hour, so a longer shift earns more.
          </p>
        </div>

        <div className="print:hidden">
          <label className={`${LABEL_CLASS} flex items-center gap-1.5`} htmlFor="tips-bonus">
            <Gift className="size-3" />
            Bonus pool
          </label>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <input
              id="tips-bonus"
              value={bonus}
              onChange={(event) => onBonus(event.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={`pl-6 font-mono tabular-nums ${FIELD_CLASS}`}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Extra on top of the tips, split evenly — everyone gets the same, however long they
            were on.
          </p>
        </div>

        <div className="print:hidden">
          <span className={LABEL_CLASS}>Hours to split by</span>
          <div className="mt-1 flex gap-1.5">
            {HOURS_BASES.map((option) => (
              <Button
                key={option}
                variant={basis === option ? "secondary" : "outline"}
                size="sm"
                aria-pressed={basis === option}
                onClick={() => onBasis(option)}
              >
                {HOURS_BASIS_LABELS[option]}
              </Button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {basis === "payable"
              ? "Unpaid breaks taken off, the way the clock counts them."
              : "Clock-in to clock-out, breaks and all."}
          </p>
        </div>

        <div className="space-y-1.5 border-t border-border pt-3">
          <Figure label="People being paid" value={String(payout.people)} />
          <Figure label="Hours between them" value={formatHours(payout.hours)} />
          <Figure
            label="Tips per hour"
            value={payout.perHour > 0 ? `${formatMoney(payout.perHour)}/hr` : "—"}
          />
          <Figure
            label="Bonus per person"
            value={payout.perPerson > 0 ? formatMoney(payout.perPerson) : "—"}
          />
          {payout.extras > 0 && (
            <Figure label="Individual bonuses" value={formatMoney(payout.extras)} />
          )}
          <div className="flex items-baseline justify-between gap-2 border-t border-border pt-1.5">
            <span className="text-sm font-semibold">Handing out</span>
            <span className="font-mono text-base font-bold tabular-nums">
              {formatMoney(payout.total)}
            </span>
          </div>
        </div>

        {payout.unallocated !== 0 && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {formatMoney(payout.unallocated)} has nowhere to go
              {payout.people === 0
                ? " — nobody is ticked."
                : payout.hours === 0
                  ? " — nobody on the sheet has any hours, so the tips can't be split by hour."
                  : "."}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
