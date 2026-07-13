import type { MetadataRoute } from "next";
import { siteConfig } from "@/data/site";

// Every indexable route. /careers/apply is intentionally absent (noindex).
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const routes: { path: string; priority: number; changeFrequency: "weekly" | "monthly" }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/locations", priority: 0.8, changeFrequency: "monthly" },
    ...siteConfig.locations.map((loc) => ({
      path: `/locations/${loc.slug}`,
      priority: 0.9,
      changeFrequency: "weekly" as const,
    })),
    { path: "/order", priority: 0.8, changeFrequency: "monthly" },
    { path: "/order/pickup", priority: 0.6, changeFrequency: "monthly" },
    { path: "/order/delivery", priority: 0.6, changeFrequency: "monthly" },
    ...siteConfig.locations.map((loc) => ({
      path: `/order/${loc.slug}`,
      priority: 0.7,
      changeFrequency: "monthly" as const,
    })),
    { path: "/about", priority: 0.6, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.7, changeFrequency: "monthly" },
    { path: "/careers", priority: 0.5, changeFrequency: "monthly" },
  ];

  return routes.map((route) => ({
    url: new URL(route.path, siteConfig.url).toString(),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
