"use server";

import { assertISODate, requireAdmin } from "@/lib/admin-guard";
import { getPublishedTipRate, publishTipRate } from "@/lib/tip-rates-repo";
import { MAX_TIP_RATE, roundRate, type PublishedTipRate } from "@/lib/tips";

/**
 * Sending the labor summary's hourly rate out to staff, and reading back what
 * they can currently see.
 *
 * These are the only two things on that page that touch the database. The sheet
 * itself — names, hours, wages, what each person is handed — never leaves the
 * owner's browser, and nothing here would let it.
 */

/** A rate off the sheet, kept sane before it is stored. */
function assertRate(value: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("The hourly rate must be a number.");
  }
  if (value <= 0) throw new Error("There is no rate to send yet.");
  if (value > MAX_TIP_RATE) throw new Error(`A rate over $${MAX_TIP_RATE} an hour can't be right.`);
  return roundRate(value);
}

/** What staff can see for one period, or null where nothing has been sent. */
export async function publishedTipRateAction(periodStart: string): Promise<PublishedTipRate | null> {
  await requireAdmin();
  return getPublishedTipRate(assertISODate(periodStart, "Period start"));
}

/**
 * Put a week's tips per hour in front of every employee.
 *
 * Publishing the same period again overwrites it, so a corrected sheet is sent
 * the same way the first one was. The stored rate comes back so the button can
 * say what is live without asking again.
 */
export async function publishTipRateAction(input: {
  periodStart: string;
  periodEnd: string;
  perHour: number;
}): Promise<PublishedTipRate> {
  await requireAdmin();

  const periodStart = assertISODate(input.periodStart, "Period start");
  const periodEnd = assertISODate(input.periodEnd, "Period end");
  if (periodEnd < periodStart) throw new Error("The period can't end before it starts.");

  const perHour = assertRate(input.perHour);
  const publishedAt = await publishTipRate({ periodStart, periodEnd, perHour });

  return { periodStart, periodEnd, perHour, publishedAt };
}
