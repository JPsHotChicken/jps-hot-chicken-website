import { ExternalLink } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

/**
 * The pay stub itself.
 *
 * `<object>` rather than `<iframe>` for one reason: a browser that cannot show
 * a PDF inline renders the fallback inside it instead of a blank rectangle. Some
 * Android browsers do exactly that, and staff are mostly on phones — a stub they
 * cannot see is the same to them as a stub that was never sent.
 */
export function PayStubViewer({ stubId }: { stubId: string }) {
  const href = `/api/pay-stubs/${stubId}`;

  return (
    <object
      data={`${href}#view=FitH`}
      type="application/pdf"
      aria-label="Your pay stub"
      className="h-[70vh] min-h-96 w-full rounded-xl border border-border bg-background"
    >
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          This phone can&apos;t show the stub on the page.
        </p>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ size: "sm" })}
        >
          <ExternalLink data-icon="inline-start" />
          Open my pay stub
        </a>
      </div>
    </object>
  );
}
