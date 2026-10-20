import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

// AI search and answer crawlers, named so their access never rides on the
// wildcard alone. A named group replaces "*" for that bot, so each gets the
// same allow/disallow lines.
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "Google-Extended",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "Applebot-Extended",
  "Bingbot",
];

const access = { allow: ["/", "/api/og"], disallow: ["/api/", "/admin"] };

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", ...access },
      { userAgent: AI_CRAWLERS, ...access },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
