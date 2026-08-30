import "server-only";

import { getDb } from "@/lib/supabase/server";
import { type PublishedTipRate } from "@/lib/tips";

/**
 * The one figure the labor summary sends out.
 *
 * Everything else on that page — who was on, their hours, their wages, what
 * each of them was handed — is worked out in the owner's browser and stays
 * there. What crosses into the database is the rate and the dates it covers,
 * because that is the only part of a payout that belongs to everybody: the hour
 * you worked earned the same as the hour anybody else worked, and the sheet
 * that proves it is nobody else's business.
 *
 * One row per period, keyed on the day it starts. Running the report again for
 * the same week replaces the number rather than adding a second one.
 */

function fail(context: string, error: { message: string } | null): never {
  throw new Error(`[tip-rates] ${context}: ${error?.message ?? "unknown error"}`);
}

type Row = {
  period_start: string;
  period_end: string;
  per_hour: number;
  published_at: string;
};

const toRate = (row: Row): PublishedTipRate => ({
  periodStart: row.period_start,
  periodEnd: row.period_end,
  // `numeric` comes back as a number here, but a string is what Postgres would
  // send for a wider one — coercing costs nothing and can't surprise us later.
  perHour: Number(row.per_hour),
  publishedAt: row.published_at,
});

const COLUMNS = "period_start, period_end, per_hour, published_at";

/**
 * Send a rate out to staff, or correct one already sent.
 *
 * The period is the key, so a re-run of the same week overwrites — which is
 * what a correction is. Returns when it went live, for the button to say so.
 */
export async function publishTipRate(rate: {
  periodStart: string;
  periodEnd: string;
  perHour: number;
}): Promise<string> {
  const publishedAt = new Date().toISOString();
  const { error } = await getDb().from("published_tip_rates").upsert(
    {
      period_start: rate.periodStart,
      period_end: rate.periodEnd,
      per_hour: rate.perHour,
      published_at: publishedAt,
    },
    { onConflict: "period_start" },
  );

  if (error) fail("publishing a tips rate", error);
  return publishedAt;
}

/** What staff can currently see for one period, or null if nothing yet. */
export async function getPublishedTipRate(periodStart: string): Promise<PublishedTipRate | null> {
  const { data, error } = await getDb()
    .from("published_tip_rates")
    .select(COLUMNS)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (error) fail("reading a published tips rate", error);
  return data ? toRate(data) : null;
}

/** How many weeks staff can page back through. Around two years of them. */
const HISTORY_LIMIT = 104;

/**
 * Every rate that has been sent out, oldest first.
 *
 * The list is short — one row a week — so the whole history is handed to the
 * page at once and paging back through it costs nothing.
 */
export async function listPublishedTipRates(): Promise<PublishedTipRate[]> {
  const { data, error } = await getDb()
    .from("published_tip_rates")
    .select(COLUMNS)
    // Newest first for the limit, so it is the oldest that falls off the end.
    .order("period_start", { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) fail("listing published tips rates", error);
  return data.map(toRate).reverse();
}
