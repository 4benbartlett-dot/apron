import { describe, it, expect } from "vitest";
import { teamSalary as engTeamSalary, apronTeamSalary } from "@apron/cba-engine";
import { BASE_CONTRACTS, TEAM_IDS, C, YEAR, leagueData, currentSalary, normName, ADOPTED_FILINGS } from "@/lib/league";
import { TRANSACTIONS } from "@apron/data";
import { feedIso } from "@/lib/feedDate";
import ext from "../../../packages/data/src/external-cap-check.json";
import pages from "../../../packages/data/src/external-roster-check.json";

// ---------------------------------------------------------------------------
// THE OUTSIDE CHECK.
//
// Every other test here is internally consistent by construction: our engine
// against our data, which cannot catch a number that is wrong in both. This one
// diffs all 30 teams against Spotrac — an independent party computing the same
// quantities from the same league — twice over:
//
//   1. SALARY: our team salary against their active roster plus dead money.
//   2. APRON:  the engine's Apron Team Salary (Art. VII §2(e)) against the
//      figure their apron tracker prints. Their number decomposes exactly, on
//      every page we have read, as active + dead + unlikely incentives + the
//      §2(d)(1)(i)(F) addback for a 0/1-YOS free agent on a minimum. Ours is
//      built from the same parts, so the two agree wherever the salary does.
//
// Sep 22 2026: for two months this file bounded gaps it could only describe
// (Cleveland $31M for an unfiled Harden, "open, unattributed" on six teams,
// $63M league-wide). Pulling every team's cap table instead of the tracker's
// totals turned each gap into named rows — a back-solved raise shape, an
// incentive the sheet folded into salary, a two-way carrying phantom salary,
// a non-guaranteed option year the sheet omitted — and the sheet now books
// them. What is left is listed below, each with the reason it is left.
//
// Their figure is still not automatically right: Hyland's one-year minimum is
// deemed at the two-year figure under §3(f) here and not there, and their
// Lillard set-off is an arithmetic this sheet does not model. The point is
// that every disagreement is a sentence, not a bound.
//
// Refresh with: node packages/data/scripts/scrape-apron-tracker.mjs (totals)
//               node packages/data/scripts/scrape-external-rosters.mjs (pages)
// ---------------------------------------------------------------------------

type Page = { active: { name: string; cap: number; unlikely: number }[]; dead: { name: string; cap: number }[]; summary: { apronTotal: number } };
const page = (t: string) => (pages.byTeam as Record<string, Page>)[t]!;
const theirApron = (t: string) => (ext.byTeam as Record<string, { apronSalary: number }>)[t]!.apronSalary;
const theirSalary = (t: string) => {
  const p = page(t);
  return p.active.reduce((s, r) => s + r.cap, 0) + p.dead.reduce((s, r) => s + r.cap, 0);
};
const lg = leagueData(BASE_CONTRACTS);
const ourSalary = (t: string) => engTeamSalary(lg, t, YEAR);
const ourApron = (t: string) => apronTeamSalary(lg, t, C);
const M = (x: number) => `$${(x / 1e6).toFixed(2)}M`;

/**
 * Salary we have booked that Spotrac has not filed yet. They lag a few days on
 * a fresh signing; the morning after a deal our sheet reads high by exactly
 * that contract and their number is not wrong, just older.
 */
const FRESH_DAYS = 7;
const freshlySigned = (team: string): number => {
  const cutoff = new Date(`${pages.asOf}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - FRESH_DAYS);
  const floor = cutoff.toISOString().slice(0, 10);
  let sum = 0;
  const seen = new Set<string>();
  for (const t of TRANSACTIONS) {
    if (t.type !== "Signing" && t.type !== "Re-sign") continue;
    if (/extension/i.test(t.detail)) continue;
    const d = feedIso(t.date);
    if (!d || d < floor) continue;
    const k = normName(t.player);
    if (seen.has(k)) continue;
    seen.add(k);
    const onPage = page(team).active.some((r) => normName(r.name) === k);
    if (onPage) continue;
    const c = BASE_CONTRACTS.find((x) => normName(x.playerName) === k && !x.deadMoney && x.teamId === team);
    if (c) sum += currentSalary(c);
  }
  return sum;
};

/** How far apart we are once their filing lag is taken out. */
const gap = (t: string) => Math.max(0, Math.abs(ourSalary(t) - theirSalary(t)) - freshlySigned(t));

/**
 * Teams whose gap is explained, with the explanation and a ceiling on it. A
 * team may only be here while someone can say WHY, and the bound is what makes
 * it a check rather than an exemption.
 */
const EXPLAINED: Record<string, { maxGap: number; why: string }> = {
  MIL: {
    maxGap: 1_250_000,
    why: "Lillard's stretched dead money reads $22,516,603 a season here and $21,311,053 on Spotrac's Milwaukee page: they apply a set-off for the salary he signed for in Portland, an arithmetic this sheet does not model. The $1,205,550 is that set-off by their reckoning.",
  },
  MIN: {
    maxGap: 400_000,
    why: "Bones Hyland's one-year veteran minimum ($2,845,883 at 5 YOS, Hoops Rumors: 'one-year league minimum deal') is deemed at the two-year figure, $2,449,421, under Art. VII §3(f) here — the same rule Spotrac applies to Kyle Anderson, Tyus Jones and DeRozan on its own pages and, for whatever reason, not to him.",
  },
};

/** Everyone else has to agree to within rounding: a feed row that says
 * "$2.15 million" for a $2,150,917 salary is the size of what is left. */
const ROUTINE_GAP = 1_000;

describe("our cap sheet against Spotrac's", () => {
  it("uses the same apron lines they publish", () => {
    // If this ever fails, one of us has the league's own constants wrong and
    // every comparison below is meaningless.
    expect(ext.lines.firstApron).toBe(C.firstApron);
    expect(ext.lines.secondApron).toBe(C.secondApron);
  });

  it("covers all 30 teams, on both the tracker and the pages", () => {
    expect(Object.keys(ext.byTeam).sort()).toEqual([...TEAM_IDS].sort());
    expect(Object.keys(pages.byTeam).sort()).toEqual([...TEAM_IDS].sort());
    for (const t of TEAM_IDS) expect(page(t).summary.apronTotal, t).toBe(theirApron(t));
  });

  it("no team's salary drifts further than we have accounted for", () => {
    const over: string[] = [];
    for (const t of TEAM_IDS) {
      const g = gap(t);
      const limit = EXPLAINED[t]?.maxGap ?? ROUTINE_GAP;
      if (g > limit) over.push(`${t} differs by ${M(g)} (limit ${M(limit)}${EXPLAINED[t] ? ", explained" : ", routine"})`);
    }
    expect(over).toEqual([]);
  });

  it("the engine's apron salary reproduces their apron figure wherever the salary agrees", () => {
    // The apron figure is salary plus the add-backs. If salary agrees and the
    // apron does not, an incentive or an addback is missing — a data gap on
    // one side or the other, never a rounding.
    const off: string[] = [];
    for (const t of TEAM_IDS) {
      const salaryGap = ourSalary(t) - theirSalary(t) - (ourSalary(t) > theirSalary(t) ? freshlySigned(t) : 0);
      const apronGap = ourApron(t) - theirApron(t) - (ourApron(t) > theirApron(t) ? freshlySigned(t) : 0);
      if (Math.abs(apronGap - salaryGap) > ROUTINE_GAP) off.push(`${t}: salary off by ${M(salaryGap)}, apron off by ${M(apronGap)}`);
    }
    expect(off).toEqual([]);
  });

  it("the league-wide gap has not quietly grown", () => {
    // One number for the whole reconciliation. $75.4M when this check was
    // written, $63.0M on Sep 21 with Cleveland set aside, and $4.1M on Sep 22
    // once every team's page had been read — Lillard's set-off, Hyland's
    // deemed minimum, Gill's unfiled minimum and four rounding dollars.
    const total = TEAM_IDS.reduce((s, t) => s + gap(t), 0);
    console.log(`  league-wide |gap|: ${M(total)}`);
    expect(total).toBeLessThan(2_000_000);
  });

  it("agrees on which teams are over which line", () => {
    // The tier is what governs what a team may DO — aggregate salaries, use a
    // mid-level, send cash — so a tier disagreement matters more than dollars.
    // Measured on apron salary, which is what the aprons are measured on.
    const tier = (x: number) =>
      x > C.secondApron ? "2A" : x > C.firstApron ? "1A" : x > C.luxuryTaxLine ? "tax" : "under";
    const differ = TEAM_IDS.filter((t) => tier(ourApron(t)) !== tier(theirApron(t)))
      .map((t) => `${t}: ours ${tier(ourApron(t))} (${M(ourApron(t))}) vs theirs ${tier(theirApron(t))} (${M(theirApron(t))})`);
    console.log(`  tier disagreements: ${differ.length}/30`);
    for (const d of differ) console.log(`    ${d}`);
    expect(differ).toEqual([]);
  });

  it("every filed figure the sheet adopted is one Spotrac lists on the same team", () => {
    // applyFiledSalaries replaces a back-solved first year with the filed one.
    // Each replacement is logged; here the log is checked against the pages
    // it came from, and the count is pinned so a silent widening of the rule
    // shows up as a number.
    for (const a of ADOPTED_FILINGS) {
      const row = page(a.team).active.find((r) => normName(r.name) === normName(a.player) || r.cap === a.to);
      expect(row, `${a.player} on ${a.team}`).toBeDefined();
      expect(row!.cap).toBe(a.to);
    }
    console.log(`  adopted filings: ${ADOPTED_FILINGS.length}`);
    expect(ADOPTED_FILINGS.length).toBeGreaterThan(40);
    expect(ADOPTED_FILINGS.length).toBeLessThan(80);
  });
});
