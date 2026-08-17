import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { TipsPayout } from "@/components/admin/TipsPayout";

export const metadata: Metadata = {
  title: "Tips payout",
  robots: { index: false, follow: false },
};

/**
 * The tips payout page.
 *
 * Unlike the rest of the dashboard there is nothing to load: a payout is built
 * from two reports the owner has just downloaded, read in the browser, and
 * handed out in cash the same night. Hourly wages are the one thing neither
 * report supplies, and they are typed on the sheet and kept in the browser with
 * the rest of the draft. So this page is only the gate — see `TipsPayout` for
 * the sheet itself, and `lib/tips.ts` for the arithmetic.
 *
 * It needs no Supabase, which means it keeps working on a day the database
 * doesn't.
 */
export default async function TipsPage() {
  // `proxy.ts` already redirects signed-out visitors; checking again here means
  // the page can never render off the back of a forged cookie.
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  return <TipsPayout />;
}
