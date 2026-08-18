import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { loadApplicationsPage } from "@/lib/applications-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { Applications } from "@/components/admin/Applications";
import { SetupNotice } from "@/components/admin/SetupNotice";

export const metadata: Metadata = {
  title: "Applications",
  robots: { index: false, follow: false },
};

// Applications arrive on their own, so a cached page would be showing an
// out-of-date list of who has applied — the one thing this page is for.
export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  // `proxy.ts` already redirects signed-out visitors; checking again here means
  // the page can never render off the back of a forged cookie.
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { applications, interviews, snippets } = await loadApplicationsPage();

  return (
    <Applications applications={applications} interviews={interviews} snippets={snippets} />
  );
}
