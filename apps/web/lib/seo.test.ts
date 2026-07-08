import { describe, it, expect } from "vitest";
import { SEO_TERMS, termBySlug, teamSlug, teamIdFromSlug, teamSeo } from "@/lib/seo";
import { TERM_SLUGS } from "@/lib/term-slugs";
import { TEAM_IDS, C } from "@/lib/league";
import { maxIncomingSalary } from "@apron/cba-engine";
import { GLOSSARY } from "@/lib/glossary";
import { shortPlayerName } from "@/lib/names";

// The programmatic SEO surface: /terms/* and /teams/*/trade-machine pages are
// generated from these modules — a broken slug or empty section 404s a page
// Google already indexed.

describe("SEO term pages", () => {
  it("compact player labels keep name suffixes attached", () => {
    expect(shortPlayerName("Trey Murphy III")).toBe("Murphy III");
    expect(shortPlayerName("Kelly Oubre Jr.")).toBe("Oubre Jr.");
    expect(shortPlayerName("Moses Moody")).toBe("Moody");
  });

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

describe("salary-matching term matches the engine (no phantom 125% apron band)", () => {
  it("engine caps both aprons at strict 100% (dollar-for-dollar)", () => {
    const out = 20_000_000;
    expect(maxIncomingSalary(out, "first_apron", 0, C).maxIncoming).toBe(out);
    expect(maxIncomingSalary(out, "second_apron", 0, C).maxIncoming).toBe(out);
    // The 125% band belongs to below-apron (over-the-cap) teams on big salaries.
    expect(maxIncomingSalary(out, "over_the_cap", 0, C).maxIncoming).toBeGreaterThan(out);
  });

  it("the displayed matching bands never grant an apron team more than 100%", () => {
    const bands = termBySlug("salary-matching")!.sections.find((s) => /matching bands/i.test(s.heading))!.rows!;
    const apronRow = bands.find((r) => /apron/i.test(r.label));
    expect(apronRow, "an apron row must exist").toBeTruthy();
    // No apron row may claim an expanded (>100%) percentage.
    expect(apronRow!.value).toMatch(/100%/);
    expect(apronRow!.value).not.toMatch(/125%|200%/);
    // Conversely, no expanded band (125%/200%) may be labeled as an apron rule.
    for (const r of bands) if (/125%|200%/.test(r.value)) expect(r.label, r.value).not.toMatch(/apron/i);
  });
});
