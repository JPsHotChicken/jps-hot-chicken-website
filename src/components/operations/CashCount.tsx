"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  Check,
  Coins,
  Delete,
  ReceiptText,
  RotateCcw,
  Vault,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  BANK_TARGET_CENTS,
  BILLS,
  COINS,
  COUNT_DIGITS,
  DENOMINATIONS,
  MONEY_DIGITS,
  formatCents,
  linesFor,
  pushDigits,
  tallyDrawer,
  valueFromDigits,
  type Counts,
  type Denomination,
  type DenominationLine,
  type DrawerCount,
} from "@/lib/cash-drawer";

/**
 * The drawer count, worked through the way it is at the register.
 *
 * Every control on this screen is a button — there is deliberately not an
 * `<input>` anywhere in the file. It runs on an iPad stood up on the counter,
 * and a real text field would throw the software keyboard over the bottom half
 * of the screen every time somebody went to type a number. So the counting rows
 * sit on the left, the pad sits on the right under whichever hand is not
 * holding the money, and the keyboard never gets a chance to appear.
 */

/** The expected-cash field — the one thing here that is not a count of something. */
const EXPECTED = "expected";

type Field = {
  id: string;
  label: string;
  /** Money fills in cents from the right; a count is whole notes or coins. */
  money: boolean;
};

/** The order the pad's Next key walks: what the POS says, then the drawer itself. */
const FIELDS: Field[] = [
  { id: EXPECTED, label: "Expected cash", money: true },
  ...DENOMINATIONS.map((denomination) => ({
    id: denomination.id,
    label: denomination.label,
    money: false,
  })),
];

export function CashCount() {
  /** What has been typed, per field, as raw digits. Empty means untouched. */
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string>(EXPECTED);
  /** The close-out stays hidden until the count is called done. */
  const [counted, setCounted] = useState(false);
  /** Coin slots ticked off as they get filled. */
  const [packed, setPacked] = useState<Record<string, boolean>>({});
  const [confirmReset, setConfirmReset] = useState(false);

  const counts = useMemo<Counts>(
    () =>
      Object.fromEntries(
        DENOMINATIONS.map((denomination) => [
          denomination.id,
          valueFromDigits(entries[denomination.id] ?? ""),
        ]),
      ),
    [entries],
  );

  const expectedCents = valueFromDigits(entries[EXPECTED] ?? "");
  const tally = useMemo(() => tallyDrawer(counts, expectedCents), [counts, expectedCents]);

  const field = FIELDS.find((one) => one.id === selected) ?? FIELDS[0];
  const digits = entries[selected] ?? "";
  const maxDigits = field.money ? MONEY_DIGITS : COUNT_DIGITS;

  const write = (next: (current: string) => string) =>
    setEntries((current) => ({ ...current, [selected]: next(current[selected] ?? "") }));

  const advance = () => {
    const at = FIELDS.findIndex((one) => one.id === selected);
    if (at < FIELDS.length - 1) setSelected(FIELDS[at + 1].id);
    else setCounted(true);
  };

  const reset = () => {
    setEntries({});
    setPacked({});
    setSelected(EXPECTED);
    setCounted(false);
    setConfirmReset(false);
  };

  return (
    <div className="grid touch-manipulation gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      {/* ------------------------------------------------- left: the counting */}
      <div className="space-y-4">
        <Card>
          <CardHead
            icon={<ReceiptText className="size-4" />}
            title="What the POS expects"
            note="Read it off the drawer report before you touch the cash."
          />
          <EntryRow
            label="Expected"
            display={formatCents(expectedCents)}
            filled={Boolean(entries[EXPECTED])}
            active={selected === EXPECTED}
            onSelect={() => setSelected(EXPECTED)}
          />
        </Card>

        <Card>
          <CardHead
            icon={<Banknote className="size-4" />}
            title="Bills"
            note="Count each stack, tap its row, key the number."
            trailing={formatCents(tally.billCents)}
          />
          <div className="divide-y divide-border">
            {BILLS.map((denomination) => (
              <DenominationRow
                key={denomination.id}
                denomination={denomination}
                digits={entries[denomination.id] ?? ""}
                active={selected === denomination.id}
                onSelect={() => setSelected(denomination.id)}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHead
            icon={<Coins className="size-4" />}
            title="Coins"
            note="How many coins, not how many dollars."
            trailing={formatCents(tally.coinCents)}
          />
          <div className="divide-y divide-border">
            {COINS.map((denomination) => (
              <DenominationRow
                key={denomination.id}
                denomination={denomination}
                digits={entries[denomination.id] ?? ""}
                active={selected === denomination.id}
                onSelect={() => setSelected(denomination.id)}
              />
            ))}
          </div>
        </Card>

        <Totals tally={tally} expectedEntered={Boolean(entries[EXPECTED])} />

        {counted ? (
          <CloseOut counts={counts} tally={tally} packed={packed} setPacked={setPacked} />
        ) : (
          <Button type="button" onClick={() => setCounted(true)} className="h-12 w-full text-base">
            Finish the count
            <ArrowRight data-icon="inline-end" />
          </Button>
        )}

        <div className="flex justify-end pb-4">
          <Button
            type="button"
            variant={confirmReset ? "destructive" : "ghost"}
            size="sm"
            onClick={() => (confirmReset ? reset() : setConfirmReset(true))}
            onBlur={() => setConfirmReset(false)}
          >
            <RotateCcw data-icon="inline-start" />
            {confirmReset ? "Tap again to clear the count" : "Start over"}
          </Button>
        </div>
      </div>

      {/* ------------------------------------------------------ right: the pad */}
      <Keypad
        label={field.label}
        display={field.money ? formatCents(valueFromDigits(digits)) : digits || "0"}
        empty={digits === ""}
        last={selected === FIELDS[FIELDS.length - 1].id}
        onDigit={(key) => write((current) => pushDigits(current, key, maxDigits))}
        onBackspace={() => write((current) => current.slice(0, -1))}
        onClear={() => write(() => "")}
        onNext={advance}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ the pad */

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3"];

type KeypadProps = {
  label: string;
  display: string;
  empty: boolean;
  /** On the last field, Next finishes the count rather than moving on. */
  last: boolean;
  onDigit: (key: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onNext: () => void;
};

function Keypad({
  label,
  display,
  empty,
  last,
  onDigit,
  onBackspace,
  onClear,
  onNext,
}: KeypadProps) {
  return (
    <div className="rounded-xl border border-border bg-background p-3 shadow-sm lg:sticky lg:top-20">
      <div className="rounded-lg bg-muted px-3 py-2">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <p
          className={cn(
            "font-mono text-3xl font-bold tabular-nums",
            empty && "text-muted-foreground/40",
          )}
        >
          {display}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <Key key={key} onPress={() => onDigit(key)}>
            {key}
          </Key>
        ))}
        <Key onPress={() => onDigit("00")}>00</Key>
        <Key onPress={() => onDigit("0")}>0</Key>
        <Key onPress={onBackspace} label="Backspace">
          <Delete className="size-6" />
        </Key>
      </div>

      <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-2">
        <Button type="button" variant="outline" onClick={onClear} className="h-14 px-5 text-base">
          Clear
        </Button>
        <Button type="button" onClick={onNext} className="h-14 text-base">
          {last ? "Done" : "Next"}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </div>
  );
}

function Key({
  children,
  onPress,
  label,
}: {
  children: React.ReactNode;
  onPress: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      className="flex h-14 items-center justify-center rounded-lg border border-border bg-background font-mono text-2xl font-bold tabular-nums transition-colors select-none hover:bg-muted active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------- the furniture */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
      {children}
    </section>
  );
}

function CardHead({
  icon,
  title,
  note,
  trailing,
}: {
  icon: React.ReactNode;
  title: string;
  note?: string;
  trailing?: string;
}) {
  return (
    <div className="flex items-start gap-2 border-b border-border px-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-brand">{icon}</span>
      <div className="min-w-0 flex-1">
        <h2 className="font-heading text-sm font-bold">{title}</h2>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      {trailing && (
        <span className="shrink-0 font-mono text-sm font-bold tabular-nums">{trailing}</span>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- entry rows */

function EntryRow({
  label,
  display,
  filled,
  active,
  onSelect,
  trailing,
}: {
  label: string;
  display: string;
  /** Untouched rows show a faded zero, so a skipped stack is obvious. */
  filled: boolean;
  active: boolean;
  onSelect: () => void;
  trailing?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors select-none",
        active ? "bg-brand/10 ring-2 ring-brand ring-inset" : "hover:bg-muted",
      )}
    >
      <span className="w-20 shrink-0 font-heading text-base font-bold">{label}</span>
      <span
        className={cn(
          "flex-1 text-right font-mono text-2xl font-bold tabular-nums",
          !filled && "text-muted-foreground/40",
        )}
      >
        {display}
      </span>
      {trailing && (
        <span className="w-24 shrink-0 text-right font-mono text-sm tabular-nums text-muted-foreground">
          {trailing}
        </span>
      )}
    </button>
  );
}

function DenominationRow({
  denomination,
  digits,
  active,
  onSelect,
}: {
  denomination: Denomination;
  digits: string;
  active: boolean;
  onSelect: () => void;
}) {
  const count = valueFromDigits(digits);
  return (
    <EntryRow
      label={denomination.label}
      display={String(count)}
      filled={digits !== ""}
      active={active}
      onSelect={onSelect}
      trailing={formatCents(count * denomination.cents)}
    />
  );
}

/* ----------------------------------------------------------------- totals */

function Totals({ tally, expectedEntered }: { tally: DrawerCount; expectedEntered: boolean }) {
  const diff = tally.overShortCents;
  const verdict = !expectedEntered
    ? null
    : diff === 0
      ? { text: "On the money", tone: "bg-emerald-100 text-emerald-900" }
      : diff > 0
        ? { text: `Over by ${formatCents(diff)}`, tone: "bg-amber-100 text-amber-900" }
        : { text: `Short by ${formatCents(-diff)}`, tone: "bg-destructive/10 text-destructive" };

  return (
    <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-base font-bold">Counted in the drawer</h2>
        <span className="font-mono text-3xl font-bold tabular-nums">
          {formatCents(tally.countedCents)}
        </span>
      </div>
      <p className="mt-1 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {formatCents(tally.billCents)} in bills + {formatCents(tally.coinCents)} in coins
      </p>
      {verdict && (
        <p
          className={cn(
            "mt-3 rounded-lg px-3 py-2 text-center font-heading text-sm font-bold",
            verdict.tone,
          )}
        >
          {verdict.text}
          <span className="ml-2 font-normal opacity-80">
            against {formatCents(tally.expectedCents)} expected
          </span>
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- close-out */

/** "47 quarters", "1 quarter" — the coins named the way you would say them. */
function nameCoins(line: DenominationLine): string {
  return line.count === 1
    ? line.denomination.singular
    : line.denomination.label.toLowerCase();
}

function CloseOut({
  counts,
  tally,
  packed,
  setPacked,
}: {
  counts: Counts;
  tally: DrawerCount;
  packed: Record<string, boolean>;
  setPacked: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const { bank } = tally;
  const coinLines = linesFor(counts, COINS);
  const bankLines = linesFor(bank.bills, BILLS);
  const dropLines = linesFor(tally.dropBills, BILLS);

  const billsNote = bank.short
    ? "The drawer never held $200 in bills, so all of it stays put."
    : bank.needCents === 0
      ? "The coins alone are already over $200, so no bills go back."
      : `The coins leave ${formatCents(BANK_TARGET_CENTS - bank.coinCents)} to find, and bills only come in whole dollars.`;

  return (
    <div className="space-y-4">
      {/* --------------------------------------------------- 1. coins back */}
      <Card>
        <CardHead
          icon={<Coins className="size-4" />}
          title="1. Every coin goes back"
          note="Coins never drop. Tap a line once its slot is filled."
          trailing={formatCents(bank.coinCents)}
        />
        {coinLines.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">
            No coins counted, so the till starts on bills alone.
          </p>
        ) : (
          <ol className="divide-y divide-border">
            {coinLines.map((line) => {
              const done = packed[line.denomination.id] ?? false;
              return (
                <li key={line.denomination.id}>
                  <button
                    type="button"
                    aria-pressed={done}
                    onClick={() =>
                      setPacked((current) => ({
                        ...current,
                        [line.denomination.id]: !done,
                      }))
                    }
                    className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors select-none hover:bg-muted"
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-md border",
                        done ? "border-brand bg-brand text-brand-foreground" : "border-border",
                      )}
                    >
                      {done && <Check className="size-4" />}
                    </span>
                    <span className={cn("flex-1 text-sm", done && "text-muted-foreground")}>
                      All <span className="font-mono font-bold tabular-nums">{line.count}</span>{" "}
                      {nameCoins(line)} — {formatCents(line.cents)} — into the{" "}
                      {line.denomination.singular} slot.
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {/* --------------------------------------------------- 2. bills back */}
      <Card>
        <CardHead
          icon={<Banknote className="size-4" />}
          title="2. Bills back on top, up to $200"
          note={billsNote}
          trailing={formatCents(bank.billCents)}
        />
        {bankLines.length > 0 && (
          <ul className="divide-y divide-border">
            {bankLines.map((line) => (
              <li
                key={line.denomination.id}
                className="flex items-center gap-3 px-3 py-2.5 text-sm"
              >
                <span className="font-mono text-lg font-bold tabular-nums">{line.count}</span>
                <span className="text-muted-foreground">×</span>
                <span className="flex-1 font-heading font-bold">{line.denomination.each}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {formatCents(line.cents)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border bg-muted px-3 py-3">
          <p className="flex items-baseline justify-between gap-3">
            <span className="font-heading text-sm font-bold">Till set at</span>
            <span className="font-mono text-2xl font-bold tabular-nums">
              {formatCents(bank.totalCents)}
            </span>
          </p>
          <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
            {formatCents(bank.billCents)} in bills on {formatCents(bank.coinCents)} in coins
          </p>
          <p
            className={cn(
              "mt-2 text-xs",
              bank.short ? "font-semibold text-destructive" : "text-muted-foreground",
            )}
          >
            {bank.short
              ? `Still ${formatCents(BANK_TARGET_CENTS - bank.totalCents)} short of $200 — there is nothing to drop.`
              : bank.overCents < 100
                ? `${formatCents(bank.overCents)} over $200. That is the round-up: the till is always left at or just above $200, never below.`
                : `${formatCents(bank.overCents)} over $200 — nothing left in the drawer makes ${formatCents(bank.needCents)} exactly, so this is as close as the till gets.`}
          </p>
        </div>
      </Card>

      {/* --------------------------------------------------------- 3. drop */}
      <Card>
        <CardHead
          icon={<Vault className="size-4" />}
          title="3. Drop the rest"
          note="Every bill the till did not need. No coins."
        />
        <div className="flex items-baseline justify-between gap-3 px-3 py-3">
          <span className="font-heading text-base font-bold">Drop total</span>
          <span className="font-mono text-4xl font-bold tabular-nums">
            {formatCents(tally.dropCents)}
          </span>
        </div>
        {dropLines.length > 0 ? (
          <ul className="divide-y divide-border border-t border-border">
            {dropLines.map((line) => (
              <li
                key={line.denomination.id}
                className="flex items-center gap-3 px-3 py-2.5 text-sm"
              >
                <span className="font-mono text-lg font-bold tabular-nums">{line.count}</span>
                <span className="text-muted-foreground">×</span>
                <span className="flex-1 font-heading font-bold">{line.denomination.each}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {formatCents(line.cents)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="border-t border-border px-3 py-3 text-sm text-muted-foreground">
            Nothing left over — every bill stayed in the till.
          </p>
        )}
      </Card>
    </div>
  );
}
