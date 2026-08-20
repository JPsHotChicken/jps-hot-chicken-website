"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  CircleCheck,
  FileText,
  LoaderCircle,
  LogOut,
  Menu,
  Radio,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { AdminDrawer } from "@/components/admin/AdminDrawer";
import { logout } from "@/app/admin/actions";
import { formatPayDate } from "@/lib/pay-stubs";
import type { BatchDetail, BatchSummary } from "@/lib/pay-stubs-repo";
import type { RosterEntry } from "@/lib/pay-stubs";
import {
  deleteBatchAction,
  releaseBatchAction,
  setPayDateAction,
  unreleaseBatchAction,
} from "@/app/admin/pay-stubs/actions";
import { StubPage } from "./StubPage";

/**
 * Staff pay stubs: upload the accountant's PDF, check who each page belongs to,
 * then release the run to everyone at once.
 *
 * The whole screen is built around the one thing that can go badly wrong here —
 * handing somebody another person's pay. So every page is shown in full rather
 * than summarised, the matching says how sure it is, and Go live is refused
 * while any page is still undecided.
 */
export function PayStubsDashboard({
  batches,
  batch,
  roster,
}: {
  batches: BatchSummary[];
  batch: BatchDetail | null;
  roster: RosterEntry[];
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const unresolved = batch?.stubs.filter((stub) => !stub.employeeId && !stub.skipped) ?? [];
  const live = Boolean(batch?.releasedAt);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/admin/pay-stubs/upload", { method: "POST", body });
      const result = (await response.json()) as { batchId?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "That upload failed.");
      router.push(`/admin/pay-stubs?batch=${result.batchId}`);
      router.refresh();
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  /** Runs a Server Action, surfacing whatever it refuses to do. */
  const run = (action: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (problem) {
        setError((problem as Error).message.replace(/^\[pay-stubs\]\s*/, ""));
      }
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>

          <div className="mr-auto">
            <h1 className="flex items-center gap-2 font-heading text-lg font-bold tracking-tight">
              <FileText className="size-4 text-brand" />
              Staff pay stubs
            </h1>
            <p className="text-xs text-muted-foreground">
              {batch
                ? `${formatPayDate(batch.payDate)} · ${batch.pageCount} page${
                    batch.pageCount === 1 ? "" : "s"
                  }`
                : "Upload the payroll PDF from your accountant"}
            </p>
          </div>

          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 p-4 sm:px-6">
        {/* Upload */}
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <h2 className="font-heading text-sm font-bold tracking-tight">
                Upload a pay run
              </h2>
              <p className="text-xs text-muted-foreground">
                One PDF, a page per person. Pages are split and matched to your staff.
              </p>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              id="payroll-pdf"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button
              type="button"
              size="sm"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? (
                <LoaderCircle data-icon="inline-start" className="animate-spin" />
              ) : (
                <Upload data-icon="inline-start" />
              )}
              {uploading ? "Reading the PDF…" : "Choose PDF"}
            </Button>
          </div>
        </section>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {/* Which pay run is on screen */}
        {batches.length > 1 && (
          <section className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground">Pay run</span>
            {batches.map((option) => (
              <Button
                key={option.id}
                variant={option.id === batch?.id ? "default" : "outline"}
                size="sm"
                onClick={() => router.push(`/admin/pay-stubs?batch=${option.id}`)}
              >
                {formatPayDate(option.payDate)}
                {option.releasedAt && <CircleCheck data-icon="inline-end" className="size-3.5" />}
              </Button>
            ))}
          </section>
        )}

        {!batch && batches.length === 0 && (
          <p className="rounded-xl border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
            No pay runs yet. Upload the PDF your accountant sends and every page will be
            split out and matched to your staff.
          </p>
        )}

        {batch && (
          <>
            {/* The run, and the one button that releases it */}
            <section className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="mr-auto space-y-1">
                  <label
                    htmlFor="pay-date"
                    className="block text-xs font-semibold text-muted-foreground"
                  >
                    Pay date
                  </label>
                  <input
                    id="pay-date"
                    type="date"
                    defaultValue={batch.payDate ?? ""}
                    disabled={live || pending}
                    onChange={(event) =>
                      run(() => setPayDateAction(batch.id, event.target.value))
                    }
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
                  />
                  <p className="text-xs text-muted-foreground">
                    {batch.periodStart && batch.periodEnd
                      ? `Covers ${formatPayDate(batch.periodStart)} – ${formatPayDate(
                          batch.periodEnd,
                        )}`
                      : "Period not printed on the pages"}
                    {" · "}
                    {batch.sourceFilename}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  {live ? (
                    <>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CircleCheck className="size-3.5 text-emerald-600" />
                        Live · released{" "}
                        {new Date(batch.releasedAt!).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => run(() => unreleaseBatchAction(batch.id))}
                      >
                        Take it back
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-muted-foreground">
                        {unresolved.length > 0
                          ? `${unresolved.length} page${
                              unresolved.length === 1 ? "" : "s"
                            } still to settle`
                          : `${batch.assignedCount} to release${
                              batch.skippedCount > 0 ? `, ${batch.skippedCount} set aside` : ""
                            }`}
                      </span>
                      <Button
                        size="sm"
                        disabled={pending || unresolved.length > 0 || batch.assignedCount === 0}
                        onClick={() => run(() => releaseBatchAction(batch.id))}
                      >
                        {pending ? (
                          <LoaderCircle data-icon="inline-start" className="animate-spin" />
                        ) : (
                          <Radio data-icon="inline-start" />
                        )}
                        Go live
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {live && (
                <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  Staff can see their own stub when they sign in. Nobody can reach anybody
                  else&apos;s.
                </p>
              )}
            </section>

            {/* Every page, in full */}
            <section className="grid gap-4 sm:grid-cols-2">
              {batch.stubs.map((stub) => (
                <StubPage
                  key={stub.id}
                  stub={stub}
                  roster={roster}
                  locked={live}
                  onChanged={() => router.refresh()}
                />
              ))}
            </section>

            <section className="flex justify-end pt-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  const label = formatPayDate(batch.payDate);
                  if (
                    !confirm(
                      `Delete the ${label} pay run and all ${batch.pageCount} pages? This cannot be undone.`,
                    )
                  ) {
                    return;
                  }
                  run(async () => {
                    await deleteBatchAction(batch.id);
                    router.push("/admin/pay-stubs");
                  });
                }}
              >
                <Trash2 data-icon="inline-start" />
                Delete this pay run
              </Button>
            </section>
          </>
        )}
      </main>

      <AdminDrawer open={menuOpen} view="payStubs" onOpenChange={setMenuOpen} />
    </div>
  );
}
