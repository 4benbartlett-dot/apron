import { describe, it, expect } from "vitest";
import {
  validateTrade,
  validateSigning,
  validateSignAndTrade,
  maxIncomingSalary,
  classifyTier,
  teamSalary as engTeamSalary,
  type Contract,
} from "@apron/cba-engine";
import { BASE_CONTRACTS, C, YEAR, leagueData, freeAgentsOf, normName } from "@/lib/league";
import { TRANSACTIONS } from "@apron/data";
import { rewind } from "@/lib/replayRewind";

// ---------------------------------------------------------------------------
// REPLAY HARNESS — the Jul 29 → Aug 20, 2026 window: a quiet stretch of
// minimums and a Non-Bird re-sign, then two days that reshaped Cleveland.
//
// Same contract as realmoves.test.ts and movesJul28.test.ts: real NBA moves are
// CBA-legal by definition, so a rejection here is OUR bug, not the league's.
// ---------------------------------------------------------------------------

const strip = (s: string) => normName(s);

function find(name: string): Contract {
  const k = strip(name);
  const c = BASE_CONTRACTS.find((x) => strip(x.playerName) === k && !x.deadMoney);
  if (!c) throw new Error(`player not in BASE_CONTRACTS: ${name}`);
  return c;
}

const clone = (cs: Contract[]) =>
  cs.map((c) => ({ ...c, years: c.years.map((y) => ({ ...y })) }));

/** Put traded players back on their pre-trade teams and clear trade flags. */
function unTrade(cs: Contract[], backTo: Record<string, string>): Contract[] {
  return cs.map((c) => {
    const dest = backTo[strip(c.playerName)];
    return dest && !c.deadMoney
      ? { ...c, teamId: dest, noAggregate: undefined, restriction: undefined, bycPriorSalary: undefined }
      : c;
  });
}

/** Pre-signing state: drop the new deal's years, restore his 2025-26 team. */
const RAW_TEAM = new Map(BASE_CONTRACTS.map((c) => [c.playerId, c.teamId] as const));
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

/** Back-solve year-1 from (total, years) with a raise % — mirrors dealFromAav. */
function y1From(total: number, years: number, raise = 0.05): number {
  let mult = 0;
  for (let k = 0; k < years; k++) mult += 1 + raise * k;
  return Math.round(total / mult);
}

const committed = (cs: Contract[], team: string) =>
  engTeamSalary(leagueData(cs), team, YEAR);

const M = (n: number) => `${(n / 1e6).toFixed(1)}M`;

// -------------------------------- TRADES -----------------------------------

describe("the August trade validates as legal", () => {
  // Aug 14: Cleveland sends Dennis Schröder ($14,809,200) and cash to Charlotte
  // for Tre Mann ($8,000,000). Two things have to hold at once: Charlotte's
  // side is a 200%-band absorption of nearly twice what it sends out, and the
  // cash is only legal because Cleveland is under the second apron — Art. VII
  // §8(a)(2) bars a second-apron team from sending cash in a trade at all.
  it("Aug 14 — CLE sends Schröder + cash to CHA for Tre Mann", () => {
    // Cleveland has since taken on Peyton Watson and James Harden, either of
    // which alone clears the second apron — rewind before asking what tier
    // they were in when they sent the cash.
    const pre = rewind(
      unTrade(clone(BASE_CONTRACTS), {
        [strip("Tre Mann")]: "CHA",
        [strip("Dennis Schröder")]: "CLE",
      }),
      "2026-08-14",
      ["CLE", "CHA"],
    );
    const v = validateTrade(
      leagueData(pre),
      {
        teams: ["CLE", "CHA"],
        players: [
          { playerId: find("Tre Mann").playerId, from: "CHA", to: "CLE" },
          { playerId: find("Dennis Schröder").playerId, from: "CLE", to: "CHA" },
        ],
        cash: [{ from: "CLE", to: "CHA", amount: 1_000_000 }],
      },
      C,
    );
    for (const t of v.teams)
      console.log(
        `  ${t.teamId}: pre ${M(t.preTradeSalary)} (${t.preTradeTier}) out ${M(t.outgoingSalary)} in ${M(t.incomingSalary)} (max ${M(t.maxIncomingAllowed)}, ${t.matchingRule})`,
      );
    if (!v.legal) console.log("  VIOLATIONS:", v.violations.map((x) => x.reason));
    expect(v.legal).toBe(true);
    // The cash is the part that needs Cleveland's tier, not just its matching.
    expect(committed(pre, "CLE")).toBeLessThan(C.secondApron);
  });
});

// ------------------------------- SIGNINGS ----------------------------------

type Deal = { name: string; team: string; years: number; total: number; date: string };

const TEAM_FIX: Record<string, string> = { WSH: "WAS", GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", PHO: "PHX", LA: "LAC" };

/** Every Jul 29 – Aug 20 Signing row the feed carries with term + dollars. */
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
    if (d < "2026-07-29" || d > "2026-08-20") continue;
    if (t.type !== "Signing" && t.type !== "Re-sign") continue;
    if (/Two-Way|Exhibit|Rookie Scale/i.test(t.detail)) continue;
    if (/via Offer Sheet/i.test(t.detail) && /right to match/i.test(t.detail)) continue;
    // A sign-and-trade is not a free-agent signing by the team on the row: the
    // signing team uses Bird rights and hands him straight to the acquirer, who
    // faces the §8(e)(1)(vii) room-or-match test instead. Replaying Watson here
    // would ask whether DENVER could sign a $20.5M free agent while over the
    // first apron — a question the deal never poses. See the S&T block below.
    if (/Sign-and-Trade/i.test(t.detail)) continue;
    // An extension adds future years to a contract that already covers 2026-27
    // — it is not a free-agent signing and has no exception to clear.
    if (/extension/i.test(t.detail)) continue;
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

// Same documented-bounds contract as the Jul 11–28 replay: this list is for
// sheet-reconstruction limits, NOT rule failures, and it must stay EXACT — a
// new failure fails the suite, and so does one of these silently healing.
const DOCUMENTED_BOUNDS: string[] = [];

describe("Jul 29 – Aug 20 real signings validate as legal", () => {
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
      let pre = unSign(clone(BASE_CONTRACTS), d.name);
      for (const o of deals) if (o.team === d.team && o.name !== d.name) {
        try { pre = unSign(pre, o.name); } catch { /* not on the sheet */ }
      }
      const fa = freeAgentsOf(pre).find((f) => f.playerId === c.playerId);
      const isOwn = fa?.priorTeam === d.team;
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

// ---------------------- WHAT THE AUGUST DEALS SPENT -------------------------

describe("what the August deals actually spent", () => {
  // Bradley Beal's 2yr/$13.17M with the Clippers reads like a mid-level deal and
  // is not one: year one is 120% of his $5,354,000 Clipper salary to the dollar,
  // which is the Non-Bird ceiling and nothing else. It matters because L.A. has
  // $1,385,463 of non-taxpayer mid-level left after Hachimura and a first-apron
  // hard cap riding on it — booking Beal against that exception would both
  // overspend it and be arithmetically impossible.
  it("Beal is a Non-Bird re-sign, not mid-level money", () => {
    const beal = find("Bradley Beal");
    const y1 = beal.years.find((y) => y.leagueYear === YEAR)!.salary;
    expect(beal.teamId).toBe("LAC");
    expect(y1).toBe(Math.round(5_354_000 * 1.2));
    expect(y1).toBeGreaterThan(C.taxpayerMLE);
    expect(y1).toBeGreaterThan(C.biAnnualException);
    console.log(`  Beal y1 ${M(y1)} = 120% of $5,354,000; TP-MLE ${M(C.taxpayerMLE)}, BAE ${M(C.biAnnualException)}`);
  });

  // Phoenix waived Highsmith on Aug 12 and signed him back on Aug 17 at the
  // 6-YOS minimum ($3,066,143). Nothing in the CBA makes a team wait to re-sign
  // a player it waived — the 30-day clocks are trade freezes (Art. VII §8(d)) —
  // and the only thing that moves is the cap charge: a ONE-year minimum for a
  // 3+ YOS veteran counts at the 2-YOS figure under Art. VII §3(f). For a team
  // under a second-apron hard cap, that gap is the whole point of the move.
  it("Highsmith's minimum re-sign is charged at the 2-YOS figure", () => {
    const h = find("Haywood Highsmith");
    expect(h.teamId).toBe("PHX");
    expect(h.years.find((y) => y.leagueYear === YEAR)!.salary).toBe(C.minimumSalaries[2]);
    expect(committed(BASE_CONTRACTS, "PHX")).toBeLessThanOrEqual(C.secondApron);
  });

  // Three of the window's four outside signings are minimum-scale deals to
  // veterans whose service time is the only thing setting the number: Walker
  // (7 YOS, overseas in 2025-26 so the clock stopped), Watford (5), Highsmith
  // (6). All three land on the sheet at the same deemed 2-YOS charge.
  it("the window's veteran minimums all book at the deemed figure", () => {
    for (const [name, team] of [
      ["Lonnie Walker IV", "DEN"],
      ["Trendon Watford", "NOP"],
      ["Haywood Highsmith", "PHX"],
    ] as const) {
      const c = find(name);
      expect(c.teamId, name).toBe(team);
      expect(c.years.find((y) => y.leagueYear === YEAR)!.salary, name).toBe(C.minimumSalaries[2]);
    }
  });

  // Westbrook (Aug 12) and Lowry (Jul 2) both retired mid-offseason. A retired
  // player is not a cheap free agent — he is gone, and his cap hold with him.
  it("the summer's retirements leave the sim entirely", () => {
    for (const name of ["Russell Westbrook", "Kyle Lowry"]) {
      const k = strip(name);
      expect(BASE_CONTRACTS.filter((c) => strip(c.playerName) === k), name).toEqual([]);
      const held = freeAgentsOf(BASE_CONTRACTS).filter((f) => strip(f.playerName) === k);
      expect(held, `${name} still has a cap hold`).toEqual([]);
    }
  });
});

// ------------------- THE FIVE-TEAM DEAL AND WHAT IT COST --------------------

// S&T acquirer legality = apron ceiling (validateSignAndTrade) AND room-or-
// matching per CBA §8(e)(1)(vii) — the same check realmoves.test.ts runs on the
// July sign-and-trades.
function acquirerLegal(committedSalary: number, incoming: number, outgoing = 0) {
  const st = validateSignAndTrade(committedSalary - outgoing, incoming, C);
  const match = maxIncomingSalary(
    outgoing,
    classifyTier(committedSalary, C),
    C.salaryCap - committedSalary,
    C,
  );
  return { legal: st.legal && incoming <= match.maxIncoming + 1, st, match };
}

describe("Aug 19-20 — the five-team Watson deal and the Harden re-sign", () => {
  const PRE = "2026-08-18";

  it("Cleveland can acquire Watson by sign-and-trade at all", () => {
    // Denver signs him on Bird rights (4y/$88M, y1 $20,465,116) and hands him
    // over; Cleveland faces the room-or-match test, and the deal only works
    // because Cleveland is SHEDDING Strus, Schröder and Mann in the same
    // transaction. Measured against the outgoing salary, not against nothing.
    const pre = rewind(clone(BASE_CONTRACTS), PRE, ["CLE", "DEN", "LAC", "WAS", "CHA"]);
    const watson = find("Peyton Watson");
    const y1 = watson.years.find((y) => y.leagueYear === YEAR)!.salary;
    const out = ["Max Strus", "Dennis Schröder", "Tre Mann"].reduce((sum, n) => {
      const c = pre.find((x) => strip(x.playerName) === strip(n) && x.teamId === "CLE" && !x.deadMoney);
      return sum + (c?.years.find((y) => y.leagueYear === YEAR)?.salary ?? 0);
    }, 0);
    const cle = committed(pre, "CLE");
    const v = acquirerLegal(cle, y1, out);
    console.log(
      `  Watson y1 ${M(y1)} | CLE pre ${M(cle)} (${classifyTier(cle, C)}) out ${M(out)}, room-or-match max ${M(v.match.maxIncoming)} → ${v.legal ? "LEGAL" : "ILLEGAL"}`,
    );
    expect(v.legal).toBe(true);
    // And the acquisition is what hard-caps them for the rest of the year.
    expect(v.st.hardCap).toBe("first_apron");
  });

  it("Cleveland's post-trade room is the $28.4M three outlets reported", () => {
    // Hoops Rumors, Keith Smith (Spotrac) and Yossi Gozlan (The Third Apron) all
    // published $28.4MM of first-apron room once the trade was official. Our
    // sheet reaches it independently, from contracts — the single best external
    // check this project has on a live cap number.
    const preHarden = rewind(clone(BASE_CONTRACTS), "2026-08-19", ["CLE"]);
    const room = C.firstApron - committed(preHarden, "CLE");
    console.log(`  CLE post-trade ${M(committed(preHarden, "CLE"))} → room ${M(room)} vs reported $28.4M`);
    expect(Math.abs(room - 28_400_000)).toBeLessThan(100_000);
  });

  it("Harden's 3yr/$97M is the deal that does not fit yet", () => {
    // Booked at the 8% Bird raise, y1 is $29,938,272 — which Gozlan describes
    // from the other direction as "a max starting salary just shy of $30
    // million." It exceeds the room, and that is the actual state of the
    // world, not a modeling error: the contract is agreed, not filed, and the
    // clearing move (stretching Whitmore) has not happened. The engine agrees
    // the SIGNING mechanism is fine — Bird rights cover it — so what blocks it
    // is purely the hard cap the Watson trade created a day earlier.
    const harden = find("James Harden");
    const y1 = harden.years.find((y) => y.leagueYear === YEAR)!.salary;
    expect(harden.teamId).toBe("CLE");
    expect(y1).toBe(29_938_271); // 97,000,000 / 3.24, rounded
    const preHarden = rewind(clone(BASE_CONTRACTS), "2026-08-19", ["CLE"]);
    const room = C.firstApron - committed(preHarden, "CLE");
    expect(y1).toBeGreaterThan(room);
    console.log(`  Harden y1 ${M(y1)} vs room ${M(room)} — short by ${M(y1 - room)}`);
  });

  it("the deal moved Cleveland more than any team this offseason", () => {
    // Watson and Harden in, Strus/Schröder/Mann out. Whatever the filing lag,
    // the roster question is settled, and the projection is what the site is
    // actually for.
    const before = rewind(clone(BASE_CONTRACTS), PRE, ["CLE"]);
    const nowRoster = BASE_CONTRACTS.filter((c) => c.teamId === "CLE" && !c.deadMoney).map((c) => c.playerName);
    for (const n of ["Peyton Watson", "James Harden", "Cam Whitmore"]) expect(nowRoster).toContain(n);
    for (const n of ["Max Strus", "Dennis Schröder"]) expect(nowRoster).not.toContain(n);
    const wasRoster = before.filter((c) => c.teamId === "CLE" && !c.deadMoney).map((c) => c.playerName);
    expect(wasRoster).toContain("Max Strus");
    expect(wasRoster).not.toContain("Peyton Watson");
  });
});
