import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { loadLatestOrder, loadTruckBase } from "@/lib/truck-repo";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { SetupNotice } from "@/components/admin/SetupNotice";
import { TruckOrder } from "@/components/admin/TruckOrder";

export const metadata: Metadata = {
  title: "Truck order",
  robots: { index: false, follow: false },
};

// Live data for one owner — a cached order sheet would be worse than useless.
export const dynamic = "force-dynamic";

export default async function TruckOrderPage() {
  // `proxy.ts` already redirects signed-out visitors; checking again here means
  // the page can never render off the back of a forged cookie.
  const cookieStore = await cookies();
  if (!(await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value))) {
    redirect("/admin/login");
  }

  if (!isSupabaseConfigured()) return <SetupNotice />;

  // The page opens on the most recent order; the rest are a click away in the
  // history panel and are read on demand.
  const [base, order] = await Promise.all([loadTruckBase(), loadLatestOrder()]);

  return <TruckOrder items={base.items} orders={base.orders} order={order} />;
}
