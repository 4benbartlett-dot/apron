import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TEAM_IDS, teamMeta, teamNickname } from "@/lib/league";
import { SITE, teamSheetMeta, teamSlug } from "@/lib/seo";
import sitemap from "@/app/sitemap";

// Bing Webmaster Tools, Nov 14, 2026: "There are too many pages with
// identical titles" and "identical meta descriptions". The thirty team pages
// (/team/BOS and the rest) are client components, which can't export
// metadata, so each one carried the homepage's title and description and no
// canonical URL. A layout beside the page gives each its own.
describe("each team's cap-sheet page has its own title and description", () => {
  const metas = TEAM_IDS.map((id) => ({ id, ...teamSheetMeta(id) }));

  it("thirty titles and thirty descriptions, no two alike", () => {
    expect(new Set(metas.map((m) => m.title)).size).toBe(30);
    expect(new Set(metas.map((m) => m.description)).size).toBe(30);
  });

  it("each names its team, fits a search result, and points at itself", () => {
    for (const m of metas) {
      expect(m.title, m.id).toContain(teamMeta(m.id).name);
      expect(m.title.length, m.title).toBeLessThanOrEqual(70);
      expect(m.description, m.id).toContain(teamMeta(m.id).name);
      expect(m.description.length, m.description).toBeGreaterThan(90);
      expect(m.description.length, m.description).toBeLessThanOrEqual(220);
      expect(m.canonical).toBe(`${SITE}/team/${m.id}`);
    }
  });

  it("and is not the trade-machine page's title for the same team", () => {
    for (const m of metas) {
      expect(m.title).not.toContain("Trade Machine");
      expect(m.title).not.toBe(`${teamNickname(m.id)} Trade Machine — 2026 Cap Sheet, Exceptions & Hard Cap`);
    }
  });

  it("the layout that applies it exists, since the page itself can't", () => {
    const dir = join(__dirname, "..", "app", "team", "[id]");
    expect(readFileSync(join(dir, "page.tsx"), "utf8").startsWith('"use client"')).toBe(true);
    const layout = readFileSync(join(dir, "layout.tsx"), "utf8");
    expect(layout).toMatch(/export async function generateMetadata/);
    expect(layout).toMatch(/teamSheetMeta/);
  });
});

describe("the sitemap", () => {
  const urls = sitemap().map((e) => e.url);

  it("lists every team's cap sheet and every team's trade machine, once each", () => {
    for (const id of TEAM_IDS) {
      expect(urls, id).toContain(`${SITE}/team/${id}`);
      expect(urls, id).toContain(`${SITE}/teams/${teamSlug(id)}/trade-machine`);
    }
    expect(new Set(urls).size).toBe(urls.length);
  });
});

// IndexNow: the site proves a "these pages changed" request is its own by
// serving a key file whose name is the key.
describe("the IndexNow key file", () => {
  const pub = join(__dirname, "..", "public");
  const keys = readdirSync(pub).filter((f) => /^[a-f0-9]{32}\.txt$/.test(f));

  it("is one file, named for the key it contains", () => {
    expect(keys).toHaveLength(1);
    expect(readFileSync(join(pub, keys[0]!), "utf8").trim()).toBe(keys[0]!.replace(/\.txt$/, ""));
  });

  it("has the script that sends the request", () => {
    expect(existsSync(join(__dirname, "..", "..", "..", "packages", "data", "scripts", "indexnow.mjs"))).toBe(true);
  });
});
