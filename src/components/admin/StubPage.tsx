"use client";

import { useState, useTransition } from "react";
import { CircleAlert, ExternalLink, EyeOff, Sparkles, UserCheck } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MatchSource, RosterEntry } from "@/lib/pay-stubs";
import type { StubRow } from "@/lib/pay-stubs-repo";
import { assignStubAction, skipStubAction } from "@/app/admin/pay-stubs/actions";

/** What the badge says about where an assignment came from. */
const MATCH_LABEL: Record<MatchSource, { text: string; className: string }> = {
  alias: { text: "Known name", className: "bg-emerald-100 text-emerald-900" },
  exact: { text: "Name matched", className: "bg-emerald-100 text-emerald-900" },
  fuzzy: { text: "Best guess — check it", className: "bg-amber-100 text-amber-900" },
  none: { text: "Needs assigning", className: "bg-red-100 text-red-900" },
};

/**
 * One page of the pay run: the page itself, and who it goes to.
 *
 * The page is shown rather than described because that is the only way the
 * owner can actually check a match — the name printed on it is the evidence,
 * and reading it off the page beats trusting what was parsed out of it.
 */
export function StubPage({
  stub,
  roster,
  locked,
  onChanged,
}: {
  stub: StubRow;
  roster: RosterEntry[];
  /** A released run is settled; nothing on it can be reassigned. */
  locked: boolean;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const badge = MATCH_LABEL[stub.skipped ? "none" : stub.match];

  const run = (action: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        onChanged();
      } catch (problem) {
        setError((problem as Error).message.replace(/^\[pay-stubs\]\s*/, ""));
      }
    });
  };

  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-card",
        stub.skipped && "opacity-60",
        !stub.employeeId && !stub.skipped ? "border-red-300" : "border-border",
      )}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="font-heading text-xs font-bold text-muted-foreground">
          Page {stub.pageNumber}
        </span>
        <span className="mr-auto truncate text-sm font-semibold" title={stub.payrollName ?? ""}>
          {stub.payrollName ?? "No name found on this page"}
        </span>
        {!locked && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              stub.skipped ? "bg-neutral-200 text-neutral-700" : badge.className,
            )}
          >
            {stub.skipped ? "Set aside" : badge.text}
          </span>
        )}
      </header>

      {/* The page itself */}
      <div className="relative aspect-[8.5/11] w-full bg-neutral-100">
        <iframe
          src={`/api/pay-stubs/${stub.id}#toolbar=0&navpanes=0&view=Fit`}
          title={`Pay stub page ${stub.pageNumber}${
            stub.payrollName ? ` — ${stub.payrollName}` : ""
          }`}
          className="size-full"
        />
      </div>

      <footer className="space-y-2 border-t border-border p-3">
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`assign-${stub.id}`}>
            Who page {stub.pageNumber} belongs to
          </label>
          <select
            id={`assign-${stub.id}`}
            value={stub.employeeId ?? ""}
            disabled={locked || pending || stub.skipped}
            onChange={(event) => run(() => assignStubAction(stub.id, event.target.value || null))}
            className={cn(
              "min-w-0 flex-1 rounded-lg border bg-background px-2.5 py-1.5 text-sm disabled:opacity-60",
              stub.employeeId ? "border-border" : "border-red-300",
            )}
          >
            <option value="">— nobody yet —</option>
            {roster.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
            {/* Somebody who has left the roster still holds their old page. */}
            {stub.employeeId && !roster.some((person) => person.id === stub.employeeId) && (
              <option value={stub.employeeId}>{stub.employeeName ?? "Former staff"}</option>
            )}
          </select>

          <a
            href={`/api/pay-stubs/${stub.id}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open page ${stub.pageNumber} full size`}
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          >
            <ExternalLink />
          </a>
        </div>

        {!locked && (
          <div className="flex items-center gap-2 text-xs">
            {stub.employeeId ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <UserCheck className="size-3.5 text-emerald-600" />
                Goes to {stub.employeeName}
                {stub.match === "alias" && stub.payrollName && (
                  <span className="flex items-center gap-1 text-[11px]">
                    <Sparkles className="size-3" />
                    remembered
                  </span>
                )}
              </span>
            ) : (
              !stub.skipped && (
                <span className="flex items-center gap-1.5 text-red-700">
                  <CircleAlert className="size-3.5" />
                  Pick who this is, or set it aside
                </span>
              )
            )}

            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={pending}
              onClick={() => run(() => skipStubAction(stub.id, !stub.skipped))}
            >
              <EyeOff data-icon="inline-start" />
              {stub.skipped ? "Bring back" : "Set aside"}
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </footer>
    </article>
  );
}
