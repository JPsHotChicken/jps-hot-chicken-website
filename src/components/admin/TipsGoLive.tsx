"use client";

import { CircleCheck, LoaderCircle, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPerHour, roundRate, type PublishedTipRate } from "@/lib/tips";

type Props = {
  /** What the sheet currently works out to an hour. */
  perHour: number;
  /** What staff can see for this same period, or null if nothing yet. */
  published: PublishedTipRate | null;
  /** Why it can't be sent, in a sentence, or null when it can. */
  blocked: string | null;
  sending: boolean;
  onPublish: () => void;
};

/** "3:40 PM" for today, "Aug 12, 3:40 PM" otherwise. */
function formatSentAt(iso: string): string {
  const when = new Date(iso);
  const time = when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const isToday = new Date().toDateString() === when.toDateString();
  return isToday
    ? time
    : `${when.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

/**
 * Sends this week's tips per hour to every employee's `/staff` page.
 *
 * Only the rate goes — see `lib/tip-rates-repo.ts`. Like the scheduler's Go
 * live, the button has to answer three questions at a glance: has this week
 * been sent at all, is what staff can see still the right figure, and, when it
 * isn't, what they are looking at instead. The last one matters most: a rate
 * that was corrected after it went out is a number people have already done
 * arithmetic with.
 */
export function TipsGoLive({ perHour, published, blocked, sending, onPublish }: Props) {
  const live = published !== null && roundRate(perHour) === published.perHour;

  return (
    <div className="flex flex-col items-end gap-1 print:hidden">
      <Button
        variant={live ? "outline" : "default"}
        size="sm"
        onClick={onPublish}
        disabled={sending || live || blocked !== null}
        title={
          blocked ??
          (live
            ? "Every employee already has this week's rate"
            : "Show this rate on every employee's page")
        }
      >
        {sending ? (
          <LoaderCircle data-icon="inline-start" className="animate-spin" />
        ) : (
          <Radio data-icon="inline-start" />
        )}
        {sending ? "Sending…" : live ? "Live" : published ? "Update" : "Go live"}
      </Button>

      {published && (
        <span className="text-right text-[0.7rem] leading-tight text-muted-foreground">
          {live ? (
            <span className="flex items-center gap-1">
              <CircleCheck className="size-3 text-emerald-600" />
              Live · sent {formatSentAt(published.publishedAt)}
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <span aria-hidden className="size-1.5 rounded-full bg-amber-500" />
              Staff see {formatPerHour(published.perHour)}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
