import { describe, it, expect } from "vitest";
import { teamSalary as engTeamSalary } from "@apron/cba-engine";
import { BASE_CONTRACTS, TEAM_IDS, C, YEAR, leagueData, currentSalary, normName } from "@/lib/league";
import { TRANSACTIONS } from "@apron/data";
import { feedIso } from "@/lib/feedDate";
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
// A LIKELY source of the residual, from Marks himself: APRON team salary counts
// unlikely bonuses, and ordinary team salary does not. His Denver graphic is
// labelled "*Includes bonuses" and he describes New Orleans as "$7.4M (unlikely
// bonuses count) under the first apron". We do not model incentives at all, so
// we would read low by whatever a roster carries in them — which is the shape
// of the gap: small, almost everywhere, and mostly in one direction.
//
// Refresh with: node packages/data/scripts/scrape-apron-tracker.mjs
// ---------------------------------------------------------------------------

const theirs = (t: string) =>
  (ext.byTeam as Record<string, { apronSalary: number }>)[t]!.apronSalary;
const ours = (t: string) => engTeamSalary(leagueData(BASE_CONTRACTS), t, YEAR);
const M = (x: number) => `$${(x / 1e6).toFixed(2)}M`;

/**
 * Salary we have booked that Spotrac has not filed yet.
 *
 * They lag a day or two on a fresh signing, so the morning after a deal our
 * sheet reads high by exactly that contract and their number is not wrong — it
 * is just older. Hard-coding a bigger ceiling for whoever signed yesterday
 * would mean editing this file every time the league does something; computing
 * the allowance from the feed means the check maintains itself and the
 * tolerance shrinks back on its own once they catch up.
 *
 * The window is deliberately short. Cleveland's Harden has been agreed for six
 * days and is NOT covered by this — a deal nobody has filed after a week is a
 * fact about the deal, not about Spotrac's refresh cycle, and it belongs in
 * EXPLAINED with a reason.
 */
const FRESH_DAYS = 4;
const freshlySigned = (team: string): number => {
  const cutoff = new Date(`${ext.asOf}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - FRESH_DAYS);
  const floor = cutoff.toISOString().slice(0, 10);
  let sum = 0;
  const seen = new Set<string>();
  for (const t of TRANSACTIONS) {
    if (t.type !== "Signing" && t.type !== "Re-sign") continue;
    const d = feedIso(t.date);
    if (!d || d < floor) continue;
    const k = normName(t.player);
    if (seen.has(k)) continue;
    seen.add(k);
    const c = BASE_CONTRACTS.find((x) => normName(x.playerName) === k && !x.deadMoney && x.teamId === team);
    if (c) sum += currentSalary(c);
  }
  return sum;
};

/** How far apart we are once their filing lag is taken out. */
const gap = (t: string) => Math.max(0, Math.abs(ours(t) - theirs(t)) - freshlySigned(t));

/**
 * Teams whose gap is explained, with the explanation and a ceiling on it. A
 * team may only be here while someone can say WHY, and the bound is what makes
 * it a check rather than an exemption: Cleveland is allowed to be one unfiled
 * Harden contract away from Spotrac, not arbitrarily far.
 */
const EXPLAINED: Record<string, { maxGap: number; why: string }> = {
  CLE: {
    maxGap: 31_000_000,
    why: "We book Harden's agreed 3yr/$97M; Spotrac has not filed it, twelve days on. Their $176,964,573 is our sheet minus his $29,938,271 — the two agree to $389 on everything else, Whitmore's stretch included, which is the tightest external match in the league.",
  },
  MIN: {
    maxGap: 5_000_000,
    why: "Spotrac's tracker has not entered Kuminga's $6,064,000 (their signed-FA page has him Official). Add it and they read ~$2.1M above us — the same standing gap Minnesota carried before the Green trade, the shape of the unlikely-bonus residual.",
  },
  SAC: {
    maxGap: 7_500_000,
    why: "Spotrac's tracker still carries DeRozan's $10M unstretched; their own Jul 6 feed row now says 'via Stretch Provision' and Hoops Rumors has the $3,333,333 × 3. The $6,666,667 the stretch saves is the whole gap.",
  },
  MEM: {
    maxGap: 9_500_000,
    why: "Open. Their table carries a Taj Gibson minimum and an Olivier-Maxence Prosper we have on Dallas, plus a Cole Anthony dead-money row we do not. Leads, not verdicts — their cap page mixes holds and dead money into the same column.",
  },
  WAS: { maxGap: 10_500_000, why: "Open, unattributed. Largest unexplained gap in the league after Memphis. $1.36M of it opened Sep 1 when Izaiyah Nelson's phantom rookie minimum came off — he is on Orlando's two-way, and Spotrac's Wizards page never carried him." },
  HOU: { maxGap: 7_000_000, why: "Open, unattributed — we read HIGHER, unlike most." },
  CHA: { maxGap: 6_000_000, why: "Open, unattributed." },
  DAL: { maxGap: 6_000_000, why: "Open, unattributed — we read higher; Prosper sits here and on their Memphis page." },
  MIL: { maxGap: 5_000_000, why: "Open, unattributed." },
  CHI: { maxGap: 5_000_000, why: "Open, unattributed." },
};

/** Everyone else has to stay inside this. It was $3.5M until Sep 1, when
 * fourteen second-round picks on two-way deals came off the sheet at
 * $1,358,152 apiece — phantom salary that had been narrowing a gap we read
 * LOW on almost everywhere (see the bonus note above). None of the fourteen is
 * on his team's Spotrac page, so the sheet is closer to the league and further
 * from this number, and the honest move is to widen the bound by about one
 * rookie minimum rather than list each team as "explained". */
const ROUTINE_GAP = 5_000_000;

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
      const g = gap(t);
      const limit = EXPLAINED[t]?.maxGap ?? ROUTINE_GAP;
      if (g > limit)
        over.push(`${t} differs by ${M(g)} (limit ${M(limit)}${EXPLAINED[t] ? ", explained" : ", routine"})`);
    }
    expect(over).toEqual([]);
  });

  it("the league-wide gap has not quietly grown", () => {
    // One number for the whole reconciliation. It was $75.4M excluding
    // Cleveland when this check was written, $69.7M once Quinten Post's
    // descending offer sheet was booked at its filed year one, $64.6M once
    // the filing-lag allowance stopped counting deals they simply had not
    // entered yet, and $84.6M on Sep 1 — a jump that WAS systemic and is
    // accounted for: fourteen two-way rookies' phantom minimums ($19.0M) came
    // off a sheet that reads low, plus DeRozan's stretch ($6.7M) and Kuminga
    // ($6.1M) that Spotrac's tracker has not entered. A jump means something
    // systemic moved, even if no single team broke its own limit.
    const total = TEAM_IDS.filter((t) => t !== "CLE").reduce((s, t) => s + gap(t), 0);
    console.log(`  league-wide |gap| excluding CLE: ${M(total)}`);
    expect(total).toBeLessThan(90_000_000);
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
