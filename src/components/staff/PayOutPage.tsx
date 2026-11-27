"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, FileText, ReceiptText, X } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  addDaysISO,
  checkTotal,
  formatMoney,
  formatPayDate,
  mondayOfISO,
  payWeekOf,
  type CheckAmounts,
} from "@/lib/pay-stubs";
import { formatDateRange, fromISODate, monthGridStart, toISODate } from "@/lib/schedule";

/** One released check of this person's, as the Pay Out page needs it. */
export type MyPayStub = {
  id: string;
  payDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  /** Pay, tips and bonus before taxes, or null when they couldn't be read. */
  amounts: CheckAmounts | null;
};

const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"];
const GRID = "grid grid-cols-[repeat(7,minmax(0,1fr))_3.75rem] gap-1";

/** "Oct 26 – Nov 1, 2026" for the Monday a week starts on. */
const weekLabel = (monday: string) => formatDateRange(monday, addDaysISO(monday, 6));

/** The amounts of every check in a week added up, or null if any couldn't be read. */
function weekAmounts(stubs: MyPayStub[]): CheckAmounts | null {
  if (stubs.length === 0 || stubs.some((stub) => !stub.amounts)) return null;
  return stubs.reduce<CheckAmounts>(
    (sum, stub) => ({
      wages: sum.wages + stub.amounts!.wages,
      tips: sum.tips + stub.amounts!.tips,
      bonus: sum.bonus + stub.amounts!.bonus,
      hours:
        sum.hours === null || stub.amounts!.hours === null ? null : sum.hours + stub.amounts!.hours,
    }),
    { wages: 0, tips: 0, bonus: 0, hours: 0 },
  );
}

/** "$160" — whole dollars, to fit the narrow column beside each week. */
const shortMoney = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function PayOutPage({ payStubs, todayISO }: { payStubs: MyPayStub[]; todayISO: string }) {
  /** Checks by the Monday of the week they pay for. */
  const byWeek = useMemo(() => {
    const weeks = new Map<string, MyPayStub[]>();
    for (const stub of payStubs) {
      const monday = payWeekOf(stub);
      if (!monday) continue;
      weeks.set(monday, [...(weeks.get(monday) ?? []), stub]);
    }
    return weeks;
  }, [payStubs]);

  // Opens on the newest check's week, already selected, so the page shows
  // something useful before anybody taps.
  const newestWeek = payStubs.map(payWeekOf).find(Boolean) ?? null;
  const [selected, setSelected] = useState<string>(newestWeek ?? mondayOfISO(todayISO));
  const [month, setMonth] = useState(() => {
    const date = fromISODate(newestWeek ? addDaysISO(newestWeek, 6) : todayISO);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [open, setOpen] = useState(false);

  const weeks = useMemo(() => {
    const first = toISODate(monthGridStart(month));
    return Array.from({ length: 6 }, (_, row) => addDaysISO(first, row * 7));
  }, [month]);

  const stepMonth = (delta: number) =>
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  const choose = (monday: string) => {
    setSelected(monday);
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-background shadow-sm">
        <header className="border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold">
            <CalendarDays className="size-4 text-brand" />
            Pay calendar
          </h2>
        </header>

        <div className="p-4">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              aria-label="Previous month"
              className="rounded-md p-1.5 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ChevronLeft className="size-4" />
            </button>
            <p aria-live="polite" className="flex-1 text-center font-heading text-sm font-bold">
              {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </p>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              aria-label="Next month"
              className="rounded-md p-1.5 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div aria-hidden className={`mt-3 ${GRID}`}>
            {WEEKDAY_INITIALS.map((initial, index) => (
              <div
                key={`${initial}-${index}`}
                className="pb-1 text-center text-[0.65rem] font-bold text-muted-foreground"
              >
                {initial}
              </div>
            ))}
            <div className="pb-1 text-right text-[0.65rem] font-bold text-muted-foreground">
              Earned
            </div>
          </div>

          <div className="space-y-1">
            {weeks.map((monday) => {
              const stubs = byWeek.get(monday) ?? [];
              const amounts = weekAmounts(stubs);
              const isSelected = monday === selected;
              const days = Array.from({ length: 7 }, (_, index) => addDaysISO(monday, index));

              return (
                // The whole week is one button: a pay check covers a week, so
                // there is no single day to pick.
                <button
                  key={monday}
                  type="button"
                  onClick={() => choose(monday)}
                  aria-pressed={isSelected}
                  aria-haspopup="dialog"
                  aria-label={
                    `Week of ${weekLabel(monday)}` +
                    (amounts
                      ? `, ${formatMoney(checkTotal(amounts))} earned`
                      : stubs.length > 0
                        ? ", check available"
                        : ", no check")
                  }
                  className={`${GRID} w-full rounded-lg py-1 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
                    isSelected ? "bg-brand text-white" : "hover:bg-muted"
                  }`}
                >
                  {days.map((iso) => {
                    const date = fromISODate(iso);
                    const otherMonth = date.getMonth() !== month.getMonth();
                    const isToday = iso === todayISO;
                    return (
                      <span
                        key={iso}
                        className={`mx-auto flex size-9 items-center justify-center rounded-md text-sm ${
                          isSelected
                            ? "font-bold"
                            : otherMonth
                              ? "text-muted-foreground/50"
                              : ""
                        } ${isToday ? (isSelected ? "ring-2 ring-white ring-inset" : "ring-2 ring-blue-600 ring-inset") : ""}`}
                      >
                        {date.getDate()}
                      </span>
                    );
                  })}
                  <span
                    className={`flex items-center justify-end pr-1 font-heading text-xs font-bold ${
                      isSelected ? "text-white" : "text-emerald-700"
                    }`}
                  >
                    {amounts ? (
                      shortMoney(checkTotal(amounts))
                    ) : stubs.length > 0 ? (
                      <ReceiptText className="size-4" />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Tap a week to see what you made. Weeks run Monday to Sunday, like the checks.
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-background shadow-sm">
        <header className="border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold">
            <FileText className="size-4 text-brand" />
            My checks{" "}
            <span className="text-sm font-normal text-muted-foreground">({payStubs.length})</span>
          </h2>
        </header>

        <div className="p-4">
          {payStubs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No checks yet. They show up here once payroll has been sent out.
            </p>
          ) : (
            <ul className="space-y-2">
              {payStubs.map((stub) => {
                const monday = payWeekOf(stub);
                return (
                  <li key={stub.id}>
                    {/* The whole row is the link: one easy target on a phone. */}
                    <Link
                      href={`/staff/pay-stubs/${stub.id}`}
                      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">
                          {monday ? weekLabel(monday) : formatPayDate(stub.payDate)}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Paid {formatPayDate(stub.payDate)}
                        </span>
                      </span>
                      {stub.amounts && (
                        <span className="shrink-0 text-right text-xs leading-tight">
                          <span className="block">
                            <span className="text-muted-foreground">Pay </span>
                            <span className="font-semibold">{formatMoney(stub.amounts.wages)}</span>
                          </span>
                          <span className="block">
                            <span className="text-muted-foreground">Tips </span>
                            <span className="font-semibold">{formatMoney(stub.amounts.tips)}</span>
                          </span>
                        </span>
                      )}
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {open && (
        <WeekPay
          monday={selected}
          stubs={byWeek.get(selected) ?? []}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * What one week paid, opened by tapping it on the calendar. Sits at the bottom
 * of the screen on a phone, where a thumb can reach it, and in the middle on
 * anything wider — the same as a day on My schedule.
 */
function WeekPay({
  monday,
  stubs,
  onClose,
}: {
  monday: string;
  stubs: MyPayStub[];
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const amounts = weekAmounts(stubs);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="week-pay-title"
        tabIndex={-1}
        className="w-full max-w-md rounded-t-2xl border border-border bg-background shadow-xl outline-none sm:rounded-2xl"
      >
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <div className="flex-1">
            <p className="text-xs font-bold tracking-widest text-brand uppercase">Week of</p>
            <h2 id="week-pay-title" className="font-heading text-xl font-bold">
              {weekLabel(monday)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          {stubs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No check for this week.</p>
          ) : amounts ? (
            <>
              <dl className="divide-y divide-border rounded-lg border border-border text-sm">
                <div className="flex items-baseline justify-between px-3 py-2.5">
                  <dt>
                    Pay
                    {amounts.hours !== null && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {amounts.hours.toFixed(2)} hrs
                      </span>
                    )}
                  </dt>
                  <dd className="font-semibold">{formatMoney(amounts.wages)}</dd>
                </div>
                <div className="flex items-baseline justify-between px-3 py-2.5">
                  <dt>Tips</dt>
                  <dd className="font-semibold">{formatMoney(amounts.tips)}</dd>
                </div>
                {amounts.bonus > 0 && (
                  <div className="flex items-baseline justify-between px-3 py-2.5">
                    <dt>Bonus</dt>
                    <dd className="font-semibold">{formatMoney(amounts.bonus)}</dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between bg-muted/60 px-3 py-2.5">
                  <dt className="font-bold">Total earned</dt>
                  <dd className="font-heading text-lg font-bold text-emerald-700">
                    {formatMoney(checkTotal(amounts))}
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-muted-foreground">
                Before taxes. Paid {stubs.map((stub) => formatPayDate(stub.payDate)).join(" and ")}.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              The amounts on this check couldn&apos;t be read here. Open it to see them.
            </p>
          )}

          {stubs.map((stub, index) => (
            <Link
              key={stub.id}
              href={`/staff/pay-stubs/${stub.id}`}
              className={`${buttonVariants()} w-full`}
            >
              <ReceiptText data-icon="inline-start" />
              {stubs.length > 1 ? `See check ${index + 1}` : "See whole check"}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
