import type { MetadataRoute } from "next";
import { siteConfig } from "@/data/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Staff-only dashboard — nothing here belongs in search results.
      disallow: "/admin",
    },
    sitemap: new URL("/sitemap.xml", siteConfig.url).toString(),
    host: siteConfig.url,
  };
}
