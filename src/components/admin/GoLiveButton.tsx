"use client";

import { CircleCheck, LoaderCircle, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";

export type PublishState = {
  publishedAt: string | null;
  hasUnpublishedChanges: boolean;
};

type Props = {
  state: PublishState;
  publishing: boolean;
  onPublish: () => void;
};

/** "3:40 PM" for today, "Aug 12, 3:40 PM" otherwise. */
function formatPublishedAt(iso: string): string {
  const when = new Date(iso);
  const time = when.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const isToday = new Date().toDateString() === when.toDateString();
  return isToday
    ? time
    : `${when.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

/**
 * Publishes the visible week to everyone's `/staff` view.
 *
 * The button has to answer three different questions at a glance: has this week
 * been sent out at all, has it changed since, and is it currently up to date.
 * Staff never see the working grid, so "nothing published" and "published but
 * stale" are meaningfully different states, not cosmetic ones.
 */
export function GoLiveButton({ state, publishing, onPublish }: Props) {
  const { publishedAt, hasUnpublishedChanges } = state;
  const upToDate = publishedAt !== null && !hasUnpublishedChanges;

  return (
    <div className="flex items-center gap-2">
      {publishedAt && (
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {hasUnpublishedChanges ? (
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-amber-500" />
              Edited since {formatPublishedAt(publishedAt)}
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <CircleCheck className="size-3.5 text-emerald-600" />
              Live · sent {formatPublishedAt(publishedAt)}
            </span>
          )}
        </span>
      )}

      <Button
        variant={upToDate ? "outline" : "default"}
        size="sm"
        onClick={onPublish}
        disabled={publishing || upToDate}
        title={
          upToDate
            ? "Every employee already has this week"
            : "Send this week to every employee's schedule"
        }
      >
        {publishing ? (
          <LoaderCircle data-icon="inline-start" className="animate-spin" />
        ) : (
          <Radio data-icon="inline-start" />
        )}
        {publishing
          ? "Sending…"
          : publishedAt === null
            ? "Go live"
            : hasUnpublishedChanges
              ? "Push changes"
              : "Live"}
      </Button>
    </div>
  );
}
