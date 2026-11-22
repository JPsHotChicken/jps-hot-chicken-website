import type { MetadataRoute } from "next";
import { siteConfig } from "@/data/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Staff-only areas — nothing here belongs in search results.
        disallow: ["/admin", "/operations"],
      },
      // Named explicitly so the choice is on the record, not implied by "*".
      // Search and AI-answer crawlers: Google, Bing, ChatGPT search, Claude,
      // Perplexity. AI training crawlers (GPTBot, ClaudeBot, Google-Extended,
      // CCBot) are allowed too — the owner's decision, 2026-11-21.
      {
        userAgent: [
          "Googlebot",
          "Bingbot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "Claude-SearchBot",
          "Claude-User",
          "PerplexityBot",
          "Perplexity-User",
          "GPTBot",
          "ClaudeBot",
          "Google-Extended",
          "CCBot",
        ],
        allow: "/",
        disallow: ["/admin", "/operations"],
      },
    ],
    sitemap: new URL("/sitemap.xml", siteConfig.url).toString(),
    host: siteConfig.url,
  };
}
