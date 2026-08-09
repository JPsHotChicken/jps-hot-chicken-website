import type { Metadata } from "next";

import { siteConfig } from "@/data/site";
import { DeliveryClient } from "./DeliveryClient";

export const metadata: Metadata = {
  title: "Start a Delivery Order",
  description: `Get ${siteConfig.name} delivered via DoorDash or Uber Eats from ${siteConfig.locations
    .map((l) => `${l.city}, ${l.state}`)
    .join(" or ")}.`,
  alternates: { canonical: "/order/delivery" },
};

export default function DeliveryOrderPage() {
  return <DeliveryClient />;
}
