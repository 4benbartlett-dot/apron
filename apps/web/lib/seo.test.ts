import { describe, it, expect } from "vitest";
import { SEO_TERMS, termBySlug, teamSlug, teamIdFromSlug, teamSeo } from "@/lib/seo";
import { TERM_SLUGS } from "@/lib/term-slugs";
import { TEAM_IDS } from "@/lib/league";
import { GLOSSARY } from "@/lib/glossary";

// The programmatic SEO surface: /terms/* and /teams/*/trade-machine pages are
// generated from these modules — a broken slug or empty section 404s a page
// Google already indexed.

describe("SEO term pages", () => {
  it("every term has a glossary source, sections, FAQ, and resolvable related links", () => {
    for (const t of SEO_TERMS) {
      expect(GLOSSARY[t.key], t.slug).toBeDefined();
      expect(t.sections.length, t.slug).toBeGreaterThan(0);
      expect(t.faq.length, t.slug).toBeGreaterThan(0);
      for (const r of t.related) expect(termBySlug(r), `${t.slug} → ${r}`).toBeDefined();
    }
  });

  it("slugs are unique and URL-safe", () => {
    const slugs = SEO_TERMS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it("TERM_SLUGS (the client-side link map) matches SEO_TERMS exactly", () => {
    const fromSeo = Object.fromEntries(SEO_TERMS.map((t) => [t.key, t.slug]));
    expect(TERM_SLUGS).toEqual(fromSeo);
  });
});

describe("SEO team pages", () => {
  it("all 30 team slugs round-trip", () => {
    for (const id of TEAM_IDS) {
      const slug = teamSlug(id);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(teamIdFromSlug(slug)).toBe(id);
    }
  });

  it("every team page has salaries, FAQ answers, and honest hard-cap lines", () => {
    for (const id of TEAM_IDS) {
      const t = teamSeo(id);
      expect(t.committed, id).toBeGreaterThan(100_000_000);
      expect(t.topContracts.length, id).toBeGreaterThan(3);
      expect(t.faq.length, id).toBe(4);
      for (const f of t.faq) expect(f.a.length, `${id}: ${f.q}`).toBeGreaterThan(20);
      // If the feed says hard-capped, the page must name the source move.
      if (Number.isFinite(t.hardCap)) expect(t.hardCapSource, id).toBeTruthy();
    }
  });
});
