import { Database } from "lucide-react";

/**
 * Shown instead of the dashboard when the Supabase environment variables are
 * missing. Without them every query would throw, so this says plainly what is
 * missing rather than presenting an error page.
 */
export function SetupNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-6">
      <div className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-sm">
        <h1 className="flex items-center gap-2 font-heading text-lg font-bold">
          <Database className="size-5 text-brand" />
          One more step
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The schedule maker stores its data in Supabase, and the connection isn&apos;t configured
          yet. Add both of these and restart:
        </p>

        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="font-mono text-xs font-bold">SUPABASE_URL</dt>
            <dd className="text-muted-foreground">
              Project Settings → Data API → Project URL.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-xs font-bold">SUPABASE_SERVICE_ROLE_KEY</dt>
            <dd className="text-muted-foreground">
              Project Settings → API Keys → <code>service_role</code>. This key bypasses every
              access rule, so it belongs in the server environment only — never in the browser and
              never committed.
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-xs text-muted-foreground">
          Locally these go in <code className="font-mono">.env.local</code>; on Vercel, in Project
          Settings → Environment Variables.
        </p>
      </div>
    </div>
  );
}
