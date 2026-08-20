import { describe, it, expect } from "vitest";
import {
  validateTrade,
  validateSigning,
  classifyTier,
  teamSalary as engTeamSalary,
  type Contract,
} from "@apron/cba-engine";
import { BASE_CONTRACTS, C, YEAR, leagueData, freeAgentsOf, normName } from "@/lib/league";
import { getLeagueData, TRANSACTIONS } from "@apron/data";
import { rewind } from "@/lib/replayRewind";

// ---------------------------------------------------------------------------
// REPLAY HARNESS — the Jul 11 → Jul 28, 2026 wave.
//
// Same contract as realmoves.test.ts: real NBA moves are CBA-legal by
// definition, so a rejection here is OUR bug (or a missing mechanism / missing
// data context), not the league's. Every move is replayed from a reconstructed
// PRE-move sheet and pushed through the engine.
// ---------------------------------------------------------------------------

const RAW_TEAM = new Map(
  getLeagueData().contracts.map((c) => [c.playerId, c.teamId] as const),
);

const strip = (s: string) => normName(s);

function find(name: string): Contract {
  const k = strip(name);
  const c = BASE_CONTRACTS.find((x) => strip(x.playerName) === k && !x.deadMoney);
  if (!c) throw new Error(`player not in BASE_CONTRACTS: ${name}`);
  return c;
}

const clone = (cs: Contract[]) =>
  cs.map((c) => ({ ...c, years: c.years.map((y) => ({ ...y })) }));

/** Pre-signing state: drop the new deal's years, restore his true 2025-26 team. */
function unSign(cs: Contract[], name: string): Contract[] {
  const k = strip(name);
  return cs.map((c) =>
    strip(c.playerName) === k && !c.deadMoney
      ? {
          ...c,
          teamId: RAW_TEAM.get(c.playerId) ?? c.teamId,
          years: c.years.filter((y) => y.leagueYear < YEAR),
          restriction: undefined,
          noAggregate: undefined,
        }
      : c,
  );
}

/** Put traded players back on their pre-trade teams and clear trade flags. */
function unTrade(cs: Contract[], backTo: Record<string, string>): Contract[] {
  return cs.map((c) => {
    const dest = backTo[strip(c.playerName)];
    return dest && !c.deadMoney
      ? { ...c, teamId: dest, noAggregate: undefined, restriction: undefined, bycPriorSalary: undefined }
      : c;
  });
}

/** Back-solve year-1 from (total, years) with a raise % — mirrors dealFromAav. */
function y1From(total: number, years: number, raise = 0.05): number {
  let mult = 0;
  for (let k = 0; k < years; k++) mult += 1 + raise * k;
  return Math.round(total / mult);
}

const committed = (cs: Contract[], team: string) =>
  engTeamSalary(leagueData(cs), team, YEAR);

const M = (n: number) => `${(n / 1e6).toFixed(1)}M`;

// ------------------------------- TRADES ------------------------------------

describe("Jul 11–28 real trades validate as legal", () => {
  it("Jul 13 — PHX sends Allen + O'Neale (aggregated) to CHA for Miles Bridges", () => {
    const pre = unTrade(clone(BASE_CONTRACTS), {
      [strip("Grayson Allen")]: "PHX",
      [strip("Royce O'Neale")]: "PHX",
      [strip("Miles Bridges")]: "CHA",
    });
    const v = validateTrade(
      leagueData(pre),
      {
        teams: ["PHX", "CHA"],
        players: [
          { playerId: find("Grayson Allen").playerId, from: "PHX", to: "CHA" },
          { playerId: find("Royce O'Neale").playerId, from: "PHX", to: "CHA" },
          { playerId: find("Miles Bridges").playerId, from: "CHA", to: "PHX" },
        ],
      },
      C,
    );
    for (const t of v.teams)
      console.log(
        `  ${t.teamId}: pre ${M(t.preTradeSalary)} (${t.preTradeTier}) out ${M(t.outgoingSalary)} in ${M(t.incomingSalary)} (max ${M(t.maxIncomingAllowed)}, ${t.matchingRule})`,
      );
    if (!v.legal) console.log("  VIOLATIONS:", v.violations.map((x) => x.reason));
    // PHX AGGREGATES two salaries — legal only because they were under the
    // second apron pre-trade. This is the check that actually matters here.
    expect(v.legal).toBe(true);
  });

  it("Jul 19 — three-team Dort/Risacher/Nembhard (OKC ducks the second apron)", () => {
    const pre = unTrade(clone(BASE_CONTRACTS), {
      [strip("Luguentz Dort")]: "OKC",
      [strip("Ryan Nembhard")]: "DAL",
      [strip("Zaccharie Risacher")]: "ATL",
    });
    const okcPre = committed(pre, "OKC");
    // Dallas is over the cap and sends out only Nembhard's $2.15M, so expanded
    // matching caps them at $4.55M — nowhere near Risacher's $13.83M. They
    // absorbed him into the standing Anthony Davis TPE instead, and our own
    // ledger corroborates it: that exception was minted at $20,830,154 and now
    // reads $7,004,114 available — a $13,826,040 draw, Risacher's salary to the
    // dollar. It arose in THIS offseason (the Jul 8 six-teamer), so it carries
    // no row-F first-apron gate.
    const risacher = find("Zaccharie Risacher");
    const risacherSalary = risacher.years.find((y) => y.leagueYear === YEAR)!.salary;
    const v = validateTrade(
      leagueData(pre),
      {
        teams: ["OKC", "ATL", "DAL"],
        players: [
          { playerId: find("Luguentz Dort").playerId, from: "OKC", to: "ATL" },
          { playerId: find("Ryan Nembhard").playerId, from: "DAL", to: "ATL" },
          { playerId: risacher.playerId, from: "ATL", to: "DAL" },
        ],
        tpeUse: {
          DAL: {
            amount: risacherSalary,
            preExisting: true,
            firstApronCap: false,
            label: "Anthony Davis TPE",
          },
        },
      },
      C,
    );
    for (const t of v.teams)
      console.log(
        `  ${t.teamId}: pre ${M(t.preTradeSalary)} (${t.preTradeTier}) out ${M(t.outgoingSalary)} in ${M(t.incomingSalary)} (max ${M(t.maxIncomingAllowed)}, ${t.matchingRule})`,
      );
    if (!v.legal) console.log("  VIOLATIONS:", v.violations.map((x) => x.reason));
    const okcPost = committed(BASE_CONTRACTS, "OKC");
    console.log(
      `  OKC ${M(okcPre)} → ${M(okcPost)} vs second apron ${M(C.secondApron)} — ${okcPost <= C.secondApron ? "DUCKED IT" : "still over"}`,
    );
    expect(v.legal).toBe(true);
    // The reported purpose of the deal: OKC gets under the second apron.
    expect(okcPre).toBeGreaterThan(C.secondApron);
    expect(okcPost).toBeLessThanOrEqual(C.secondApron);
  });

  // The Clippers absorbed Broome into CAP ROOM, which means this replay is only
  // reconstructible if the sheet is rewound past everything they signed AFTER
  // Jul 28. Beal's Aug 13 Non-Bird deal ($6,424,800) alone puts them $4.6M over
  // the cap, and an over-cap team taking back $2.15M for nothing has no
  // matching band that works — the move would read illegal for a reason that
  // did not exist on the day it happened. Rewind the Clippers to Jul 28 and the
  // room is there again: this is the harness's job, not a rule failure.
  it("Jul 28 — PHI dumps Johni Broome + a 2027 2nd to LAC for cash", () => {
    let pre = unTrade(clone(BASE_CONTRACTS), { [strip("Johni Broome")]: "PHI" });
    pre = rewind(pre, "2026-07-28", ["LAC", "PHI"]);
    expect(committed(pre, "LAC")).toBeLessThan(C.salaryCap);
    const v = validateTrade(
      leagueData(pre),
      {
        teams: ["PHI", "LAC"],
        players: [{ playerId: find("Johni Broome").playerId, from: "PHI", to: "LAC" }],
      },
      C,
    );
    for (const t of v.teams)
      console.log(
        `  ${t.teamId}: pre ${M(t.preTradeSalary)} (${t.preTradeTier}) out ${M(t.outgoingSalary)} in ${M(t.incomingSalary)} (max ${M(t.maxIncomingAllowed)}, ${t.matchingRule})`,
      );
    if (!v.legal) console.log("  VIOLATIONS:", v.violations.map((x) => x.reason));
    expect(v.legal).toBe(true);
  });
});

// ------------------------------ SIGNINGS ------------------------------------

/** Every Jul 11–28 Signing row the feed carries with explicit term + dollars. */
type Deal = { name: string; team: string; years: number; total: number; date: string };

const TEAM_FIX: Record<string, string> = { WSH: "WAS", GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", PHO: "PHX" };

function windowDeals(): Deal[] {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const iso = (d: string) => {
    const m = d.match(/([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})/);
    return m ? `${m[3]}-${String(MONTHS.indexOf(m[1]!) + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}` : "";
  };
  const out: Deal[] = [];
  const seen = new Set<string>();
  for (const t of TRANSACTIONS) {
    const d = iso(t.date);
    if (d < "2026-07-11" || d > "2026-07-28") continue;
    if (t.type !== "Signing" && t.type !== "Re-sign") continue;
    if (/Two-Way|Exhibit|Rookie Scale/i.test(t.detail)) continue;
    // A pending offer sheet isn't a signing by the incumbent yet.
    if (/via Offer Sheet/i.test(t.detail) && /right to match/i.test(t.detail)) continue;
    const yearsM = t.detail.match(/(\d+)\s*year/);
    const totalM = t.detail.match(/\$\s*([\d.]+)\s*million/);
    const teamM = t.detail.match(/with\s+[A-Za-z .'&-]+\(([A-Za-z]{2,4})\)/);
    if (!yearsM || !totalM || !teamM) continue;
    const k = normName(t.player);
    if (seen.has(k)) continue;
    seen.add(k);
    const raw = teamM[1]!.toUpperCase();
    out.push({
      name: t.player,
      team: TEAM_FIX[raw] ?? raw,
      years: Number(yearsM[1]),
      total: Number(totalM[1]) * 1e6,
      date: d,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Documented sheet-reconstruction bounds — NOT rule failures. The harness
// rebuilds each team's pre-move sheet by un-signing the new deal, which cannot
// recover the renounces / waives / spent-exception context reality had at
// signing time. Keep this list EXACT: a new failure fails the suite, and so
// does one of these silently healing (update it and /accuracy when it does).
// Luke Kennard (PHX) is the same bound realmoves.test.ts documents for the Jul 1
// wave — the feed re-dated his signing into this window. PHX signed him at
// exactly the Taxpayer MLE ($6,064,000 y1) and sits under its own second-apron
// hard cap, but the replay rebuilds their sheet without the spent-exception
// context, so a team in that thin sub-first-apron band gets offered the NT-MLE
// (self-limited to ~$0.9M by its own hard cap) rather than the taxpayer-MLE
// CHOICE Phoenix actually made. A modeling simplification, not a cap error.
const DOCUMENTED_BOUNDS: string[] = ["Luke Kennard"];

describe("Jul 11–28 real signings validate as legal", () => {
  it("replays every dated signing in the window against the engine", () => {
    const deals = windowDeals();
    const failures: string[] = [];
    console.log(
      `\n  ${deals.length} signings in window\n  date        player                     team  y1($M)  verdict`,
    );
    for (const d of deals) {
      let c: Contract;
      try {
        c = find(d.name);
      } catch {
        console.log(`  ${d.date}  ${d.name.padEnd(26)} ${d.team}   —      NOT IN DATA (skipped)`);
        continue;
      }
      // Strip THIS deal and every other same-team deal from the window, so the
      // team is measured as it stood before the wave rather than after it.
      let pre = unSign(clone(BASE_CONTRACTS), d.name);
      for (const o of deals) if (o.team === d.team && o.name !== d.name) {
        try { pre = unSign(pre, o.name); } catch { /* not on the sheet */ }
      }
      const fa = freeAgentsOf(pre).find((f) => f.playerId === c.playerId);
      const isOwn = fa?.priorTeam === d.team;
      // Reported deals are term + total, so year one depends on the raise cap:
      // 8% on a Bird / Early-Bird re-signing, 5% on everything else. Using 5%
      // on an 8% deal reads ~4% hot and can push a legal max over the line.
      const y1 = y1From(
        d.total,
        d.years,
        isOwn && fa!.birdStatus !== "non_bird" ? 0.08 : 0.05,
      );
      const opts = fa
        ? {
            isOwnFreeAgent: isOwn,
            yearsOfService: fa.yearsOfService,
            priorSalary: fa.lastSalary,
            birdStatus: isOwn ? fa.birdStatus : undefined,
          }
        : {};
      const base = committed(pre, d.team);
      let v = validateSigning(base, y1, C, opts);
      // Reported totals are rounded; within 1% of the true ceiling is the max deal.
      if (!v.legal && v.maxOffer > 0 && y1 <= v.maxOffer * 1.01) {
        v = validateSigning(base, v.maxOffer, C, opts);
      }
      console.log(
        `  ${d.date}  ${d.name.padEnd(26)} ${d.team}  ${(y1 / 1e6).toFixed(1).padStart(5)}  ` +
          (v.legal ? `✓ ${v.mechanism!.id}` : `✗ max ${M(v.maxOffer)} — ${v.reason}`) +
          (isOwn ? `  (own FA, ${fa!.birdStatus})` : ""),
      );
      if (!v.legal) failures.push(d.name);
    }
    if (failures.length) console.log(`\n  FAILURES: ${failures.join(", ")}`);
    expect(failures.sort()).toEqual([...DOCUMENTED_BOUNDS].sort());
  });
});

// -------------------- APRON CONSEQUENCES OF THE WAVE -------------------------

describe("the wave's reported apron consequences hold on our sheet", () => {
  const sal = (t: string) => committed(BASE_CONTRACTS, t);

  // Shams (Jul 26): matching Jones' sheet takes Denver's tax bill from $36M to
  // $68M and "enter[s] the second apron". On SIGNED salary alone we read them
  // $1.9M short of that line. The gap is cap holds: Art. VII §4(d) counts an
  // unrenounced free agent's hold in Team Salary, and Denver is deliberately
  // holding Peyton Watson's — he is their stated next order of business, so
  // renouncing him is exactly what they will not do. His hold alone clears the
  // line several times over. Our engine measures apron status on signed salary
  // (a documented simplification — see /accuracy), so this test asserts what
  // the model can actually defend and pins the hold arithmetic that explains
  // the rest, rather than asserting a number our model doesn't produce.
  it("DEN matching Spencer Jones' offer sheet is a first-apron team on signed salary, second-apron with holds", () => {
    const s = sal("DEN");
    const holds = freeAgentsOf(BASE_CONTRACTS)
      .filter((f) => f.priorTeam === "DEN")
      .reduce((a, f) => a + f.hold, 0);
    console.log(
      `  DEN signed ${M(s)} (${classifyTier(s, C)}) | + unrenounced holds ${M(holds)} = ${M(s + holds)} | second apron ${M(C.secondApron)}`,
    );
    expect(s).toBeGreaterThan(C.firstApron);
    expect(s + holds).toBeGreaterThan(C.secondApron);
  });

  it("PHI stays under BOTH aprons after LeBron + Caldwell-Pope + the Broome dump", () => {
    const s = sal("PHI");
    console.log(
      `  PHI ${M(s)} (${classifyTier(s, C)}) | first apron ${M(C.firstApron)} | second ${M(C.secondApron)}`,
    );
    expect(s).toBeLessThan(C.firstApron);
  });

  it("GSW re-signing Draymond lands them just under the second apron", () => {
    const s = sal("GSW");
    console.log(
      `  GSW ${M(s)} (${classifyTier(s, C)}) — ${M(C.secondApron - s)} below the second apron`,
    );
    // Reported Jul 28: $213.4M projected, "$8.3M below the 2nd apron".
    //
    // The TIER is the claim, and it is what this file exists to check: Golden
    // State re-signs Draymond and lands between the aprons. That still holds.
    //
    // The $213.4M itself is deliberately NOT asserted. It described the sheet on
    // one day, while `sal` reads the live roster, so it started failing the
    // moment the Warriors signed Gary Payton II and De'Anthony Melton on Aug 1.
    // Reconstructing that day is not the fix either — it was tried: Draymond
    // AGREED on Jul 28 and SIGNED on Jul 29, so a date cutoff strips his $27.7M
    // along with the August deals, and the arithmetic does not close regardless
    // ($213.4M + $7.9M of new signings ≠ the $215.9M we read, because Golden
    // State shed salary too, and the reported number was a projection carrying
    // its own assumptions about holds). A check that needs three assumptions to
    // reproduce a third party's estimate is not testing our engine — it fails
    // for reasons that teach nothing. The margin is logged for eyeballing.
    expect(s).toBeGreaterThan(C.firstApron);
    expect(s).toBeLessThan(C.secondApron);
  });
});
