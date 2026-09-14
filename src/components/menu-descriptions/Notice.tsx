"use client";

import { Info, TriangleAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";

export type NoticeState = { tone: "error" | "info"; message: string } | null;

/** A dismissible line above a form: what went wrong, or what a save also did. */
export function Notice({ notice, onDismiss }: { notice: NoticeState; onDismiss: () => void }) {
  if (!notice) return null;
  const isError = notice.tone === "error";
  const Icon = isError ? TriangleAlert : Info;

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
        isError
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-amber-300 bg-amber-50 text-amber-950"
      }`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <p className="flex-1">{notice.message}</p>
      <Button variant="ghost" size="icon-xs" aria-label="Dismiss" onClick={onDismiss}>
        <X />
      </Button>
    </div>
  );
}
