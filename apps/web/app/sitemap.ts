import type { MetadataRoute } from "next";
import { TEAM_IDS } from "@/lib/league";
import { SEO_TERMS, teamSlug, SITE } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const page = (
    path: string,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] = "weekly",
  ) => ({ url: `${SITE}${path}`, lastModified: now, changeFrequency, priority });

  return [
    page("/", 1, "daily"),
    page("/glossary", 0.8),
    page("/terms", 0.8),
    page("/teams", 0.8, "daily"),
    page("/accuracy", 0.7),
    page("/guide", 0.6),
    page("/league", 0.6, "daily"),
    page("/standings", 0.6, "daily"),
    page("/transactions", 0.6, "daily"),
    page("/draft", 0.5),
    page("/deadlines", 0.5),
    ...SEO_TERMS.map((t) => page(`/terms/${t.slug}`, 0.7)),
    ...TEAM_IDS.map((id) => page(`/teams/${teamSlug(id)}/trade-machine`, 0.7, "daily")),
  ];
}
