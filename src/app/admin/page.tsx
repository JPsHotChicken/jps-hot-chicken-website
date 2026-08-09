import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { Scheduler } from "@/components/admin/Scheduler";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  // `proxy.ts` already redirects signed-out visitors, but the dashboard checks
  // again so the page can never render off the back of a forged cookie.
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  return <Scheduler />;
}
