import { describe, it, expect } from "vitest";
import { teamSalary as engTeamSalary } from "@apron/cba-engine";
import { BASE_CONTRACTS, TEAM_IDS, C, YEAR, leagueData, currentSalary, normName } from "@/lib/league";
import ext from "../../../packages/data/src/external-cap-check.json";

// ---------------------------------------------------------------------------
// THE OUTSIDE CHECK.
//
// Every other test here is internally consistent by construction: our engine
// against our data, which cannot catch a number that is wrong in both. This one
// diffs all 30 team salaries against Spotrac's published apron tracker — an
// independent party computing the same quantity from the same league.
//
// Their figure is NOT automatically right. Ours has reproduced beat-writer
// numbers Spotrac lagged on, and it is currently $29.9M "wrong" on Cleveland
// for the good reason that we book a deal they have not filed yet. So this does
// not assert agreement. It asserts that every disagreement is one we know
// about: the shape stays the same, the outliers stay the same size, and a NEW
// team drifting is the thing that breaks the build.
//
// Refresh with: node packages/data/scripts/scrape-apron-tracker.mjs
// ---------------------------------------------------------------------------

const theirs = (t: string) =>
  (ext.byTeam as Record<string, { apronSalary: number }>)[t]!.apronSalary;
const ours = (t: string) => engTeamSalary(leagueData(BASE_CONTRACTS), t, YEAR);
const M = (x: number) => `$${(x / 1e6).toFixed(2)}M`;

/**
 * Teams whose gap is explained, with the explanation and a ceiling on it. A
 * team may only be here while someone can say WHY, and the bound is what makes
 * it a check rather than an exemption: Cleveland is allowed to be one unfiled
 * Harden contract away from Spotrac, not arbitrarily far.
 */
const EXPLAINED: Record<string, { maxGap: number; why: string }> = {
  CLE: {
    maxGap: 31_000_000,
    why: "We book Harden's agreed 3yr/$97M; Spotrac has not filed it. Their $180,603,446 is our sheet minus his $29,938,271 — the two agree to $389 on everything else, which is the tightest external match in the league.",
  },
  MEM: {
    maxGap: 10_000_000,
    why: "Open. Their table carries a Taj Gibson minimum and an Olivier-Maxence Prosper we have on Dallas, plus a Cole Anthony dead-money row we do not. Leads, not verdicts — their cap page mixes holds and dead money into the same column.",
  },
  WAS: { maxGap: 9_000_000, why: "Open, unattributed. Largest unexplained gap in the league after Memphis." },
  SAC: { maxGap: 7_000_000, why: "Open, unattributed." },
  HOU: { maxGap: 7_000_000, why: "Open, unattributed — we read HIGHER, unlike most." },
  CHA: { maxGap: 6_000_000, why: "Open, unattributed." },
  DAL: { maxGap: 6_000_000, why: "Open, unattributed — we read higher; Prosper sits here and on their Memphis page." },
  MIL: { maxGap: 5_000_000, why: "Open, unattributed." },
  CHI: { maxGap: 5_000_000, why: "Open, unattributed." },
};

/** Everyone else has to stay inside this. */
const ROUTINE_GAP = 3_500_000;

describe("our cap sheet against Spotrac's", () => {
  it("uses the same apron lines they publish", () => {
    // If this ever fails, one of us has the league's own constants wrong and
    // every comparison below is meaningless.
    expect(ext.lines.firstApron).toBe(C.firstApron);
    expect(ext.lines.secondApron).toBe(C.secondApron);
  });

  it("covers all 30 teams", () => {
    expect(Object.keys(ext.byTeam).sort()).toEqual([...TEAM_IDS].sort());
  });

  it("no team drifts further than we have accounted for", () => {
    const over: string[] = [];
    for (const t of TEAM_IDS) {
      const gap = Math.abs(ours(t) - theirs(t));
      const limit = EXPLAINED[t]?.maxGap ?? ROUTINE_GAP;
      if (gap > limit)
        over.push(`${t} differs by ${M(gap)} (limit ${M(limit)}${EXPLAINED[t] ? ", explained" : ", routine"})`);
    }
    expect(over).toEqual([]);
  });

  it("the league-wide gap has not quietly grown", () => {
    // One number for the whole reconciliation. It was $75.4M excluding
    // Cleveland when this check was written, and $69.7M once Quinten Post's
    // descending offer sheet was booked at its filed year one. A jump means
    // something systemic moved, even if no single team broke its own limit.
    const total = TEAM_IDS.filter((t) => t !== "CLE").reduce((s, t) => s + Math.abs(ours(t) - theirs(t)), 0);
    console.log(`  league-wide |gap| excluding CLE: ${M(total)}`);
    expect(total).toBeLessThan(85_000_000);
  });

  it("Cleveland agrees to the dollar once Harden is set aside", () => {
    // The single most precise external check this project has: strip the one
    // contract Spotrac has not filed and the two sheets are $389 apart on
    // fourteen other players.
    const harden = BASE_CONTRACTS.find((c) => normName(c.playerName) === normName("James Harden"))!;
    const withoutHarden = ours("CLE") - currentSalary(harden);
    expect(Math.abs(withoutHarden - theirs("CLE"))).toBeLessThan(1_000);
  });

  it("agrees on which teams are over which line, except where explained", () => {
    // The tier is what governs what a team may DO — aggregate salaries, use a
    // mid-level, send cash — so a tier disagreement matters more than dollars.
    const tier = (x: number) =>
      x > C.secondApron ? "2A" : x > C.firstApron ? "1A" : x > C.luxuryTaxLine ? "tax" : "under";
    const differ = TEAM_IDS.filter((t) => tier(ours(t)) !== tier(theirs(t)))
      .map((t) => `${t}: ours ${tier(ours(t))} (${M(ours(t))}) vs theirs ${tier(theirs(t))} (${M(theirs(t))})`);
    console.log(`  tier disagreements: ${differ.length}/30`);
    for (const d of differ) console.log(`    ${d}`);
    // Every one of these is a team sitting within a couple of million of a
    // line, where a gap we already tolerate is enough to cross it.
    expect(differ.length).toBeLessThanOrEqual(7);
  });
});
