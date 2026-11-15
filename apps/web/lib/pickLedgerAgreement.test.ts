import { describe, it, expect } from "vitest";
import { DRAFT_PICKS, PICK_RIGHTS, ACQUIRED_PICKS, hasAcquiredFirst, firstEncumbranceOf, TRADEABLE_DRAFT_YEARS } from "@apron/data";
import { SIM_DATE, lockedFirstEncumbrance } from "@/lib/league";
import { ruleOnBaseTrade } from "@/lib/verdict";
import { encodeTradeParam, summarizeTrade } from "@/lib/trade-share";

// Two files describe who owns which pick. draft-picks.json is the RealGM
// ledger as scraped, prose and all; pick-rights-2026.json is the structured
// version the board, the Stepien check and the team pages read. A re-pull
// rewrites the first and nothing rewrote the second, so by Nov 9 2026 the
// board still had Dallas holding Chicago's 2027 second (Oklahoma City's since
// Jul 19), Detroit holding Minnesota's 2030 second (Oklahoma City's since
// Jul 6, Sacramento's since Nov 8), and Denver without the Cleveland first it
// got on Aug 20. This is the check that would have said so each time.

const CITY: Record<string, string> = {
  Atlanta: "ATL", Boston: "BOS", Brooklyn: "BKN", Charlotte: "CHA", Chicago: "CHI", Cleveland: "CLE",
  Dallas: "DAL", Denver: "DEN", Detroit: "DET", "Golden State": "GSW", Houston: "HOU", Indiana: "IND",
  "L.A. Clippers": "LAC", "L.A. Lakers": "LAL", Memphis: "MEM", Miami: "MIA", Milwaukee: "MIL",
  Minnesota: "MIN", "New Orleans": "NOP", "New York": "NYK", "Oklahoma City": "OKC", Orlando: "ORL",
  Philadelphia: "PHI", Phoenix: "PHX", Portland: "POR", Sacramento: "SAC", "San Antonio": "SAS",
  Toronto: "TOR", Utah: "UTA", Washington: "WAS",
};

/** "Utah's 2028 2nd round pick to Sacramento (via Oklahoma City) [..]": one
 * team's pick, to one team, nothing conditional about it. Anything with a
 * protection, a favorability clause, a swap or an onward option is left out;
 * those are the structured ledger's judgment calls, not a yes-or-no fact. */
const CLEAN = /^(.+?)(?:'s|') (\d{4}) (1st|2nd) round pick to (.+?)(?: \(via [^)]*\))? \[/;
const CONDITIONAL = /protected|favorable|swap|\bif\b|conveyable|extinguished|may convey|forfeited/i;

/** RealGM's clean outright picks: `ORIGIN|YEAR|ROUND` → holder. */
function scraped(): Map<string, string> {
  const out = new Map<string, string>();
  for (const picks of Object.values(DRAFT_PICKS)) {
    for (const p of picks.incoming ?? []) {
      const m = CLEAN.exec(p.detail);
      if (!m || CONDITIONAL.test(p.detail)) continue;
      const origin = CITY[m[1]!], holder = CITY[m[4]!];
      if (!origin || !holder) continue;
      out.set(`${origin}|${m[2]}|${m[3] === "1st" ? 1 : 2}`, holder);
    }
  }
  return out;
}

/** The structured ledger's clean outright holdings: id → every team holding it. */
function structured(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [team, r] of Object.entries(PICK_RIGHTS)) {
    for (const h of r.holdings) {
      if (h.kind !== "outright" || h.protection || h.favorable || h.overlapsPrior || h.forfeited) continue;
      if (!h.origin || !(h.origin in PICK_RIGHTS) || h.origin === team) continue;
      const id = `${h.origin}|${h.year}|${h.round}`;
      out.set(id, [...(out.get(id) ?? []), team]);
    }
  }
  return out;
}

describe("the structured pick ledger against the scraped one", () => {
  it("parses a real share of RealGM's ledger", () => {
    expect(scraped().size).toBeGreaterThan(70);
  });

  it("every pick RealGM lists as one team's outright is held by that team, and only that team", () => {
    const rights = structured();
    const off: string[] = [];
    for (const [id, holder] of scraped()) {
      const held = rights.get(id);
      if (!held) off.push(`${id}: RealGM has it with ${holder}; the structured ledger has no clean holder`);
      else if (held.length !== 1 || held[0] !== holder) off.push(`${id}: RealGM has it with ${holder}; the structured ledger says ${held.join(" and ")}`);
    }
    expect(off).toEqual([]);
  });

  it("no pick is cleanly held by two teams", () => {
    expect([...structured()].filter(([, teams]) => teams.length > 1).map(([id, teams]) => `${id}: ${teams.join(", ")}`)).toEqual([]);
  });

  it("the Nov 8 Clifford trade moved both seconds to Sacramento", () => {
    const owner = (id: string) => ACQUIRED_PICKS.find((p) => p.id === id)?.team;
    expect(owner("UTA|2028|2")).toBe("SAC");
    expect(owner("MIN|2030|2")).toBe("SAC");
  });

  it("the summer's trades the ledger had missed are on the board", () => {
    const owner = (id: string) => ACQUIRED_PICKS.find((p) => p.id === id)?.team;
    expect(owner("CHI|2027|2")).toBe("OKC"); // Atlanta-Dallas-Oklahoma City, Jul 19
    expect(owner("DET|2031|2")).toBe("OKC"); // Detroit-Oklahoma City, Jul 6
    expect(owner("HOU|2029|2")).toBe("MEM"); // six-team trade, Jul 8
    expect(owner("LAL|2029|2")).toBe("MEM");
    expect(owner("SAC|2032|2")).toBe("DEN"); // five-team trade, Aug 20
    expect(owner("CLE|2031|1")).toBe("DEN");
    expect(hasAcquiredFirst("DEN", 2031)).toBe(true);
  });

  it("the Clippers' 2028 first is no longer Philadelphia's to count on", () => {
    // Boston-Philadelphia, Jul 6: it conveys to Boston at 17-30.
    expect(ACQUIRED_PICKS.some((p) => p.id === "LAC|2028|1")).toBe(false);
    expect(hasAcquiredFirst("PHI", 2028)).toBe(false);
  });
});

// The Stepien check asks one question of each team's own first: gone, or
// still theirs? The answer was read off RealGM's headline by pattern, and on
// the Nov 9, 2026 re-pull RealGM reworded Boston's 2028 row. A swap with San
// Antonio, which leaves Boston holding a first, stopped matching and was read
// as a first traded away. Boston's 2029 first really is gone (Portland), so
// the two made a standing violation, and for five days every shared Boston
// trade came back BLOCKED, including a two-for-one with no picks in it. A fan
// post proposing Keyonte George to Boston is what showed it.
describe("what a team's own first is, in both ledgers", () => {
  const RANK: Record<string, number> = { forfeited: 4, owed: 3, protected: 2, swap: 1 };
  /** The structured ledger's word for a year: its most restrictive leg, with
   * a frozen pick counted as the team's own. */
  const structured = (team: string, year: number) => {
    const legs = (PICK_RIGHTS[team]?.ownFirstObligations ?? []).filter((o) => o.year === year && o.status !== "frozen");
    return legs.sort((a, b) => RANK[b.status]! - RANK[a.status]!)[0]?.status ?? "kept";
  };

  it("agree on every team and every tradeable draft", () => {
    const off: string[] = [];
    for (const team of Object.keys(PICK_RIGHTS)) {
      for (const year of TRADEABLE_DRAFT_YEARS) {
        const ours = firstEncumbranceOf(team, year)?.status ?? "kept";
        if (ours !== structured(team, year)) off.push(`${team} ${year}: Stepien reads ${ours}, the ledger says ${structured(team, year)}`);
      }
    }
    expect(off).toEqual([]);
  });

  it("Boston's 2028 first is a swap, so Boston still has a first that year", () => {
    expect(firstEncumbranceOf("BOS", 2028)).toMatchObject({ status: "swap", counterparty: "San Antonio" });
    expect(lockedFirstEncumbrance("BOS", 2028)).toBeUndefined();
    expect(lockedFirstEncumbrance("BOS", 2029)?.status).toBe("owed");
  });

  it("so a Boston trade with no picks in it is not a Stepien violation", () => {
    const players = [
      { playerId: "georgke01", from: "UTA", to: "BOS" },
      { playerId: "walshjo01", from: "BOS", to: "UTA" },
      { playerId: "gonzahu01", from: "BOS", to: "UTA" },
    ];
    const r = ruleOnBaseTrade({ teams: ["BOS", "UTA"], players, picks: [], date: SIM_DATE });
    expect(r.stepien).toEqual([]);
    expect(summarizeTrade(encodeTradeParam(["BOS", "UTA"], players))!.legal).toBe(r.legal);
  });

  it("but Boston still can't trade that 2028 first, with 2029 already Portland's", () => {
    const r = ruleOnBaseTrade({ teams: ["BOS", "UTA"], players: [], picks: [{ id: "BOS|2028|1", from: "BOS", to: "UTA" }], date: SIM_DATE });
    expect(r.stepien[0]).toMatchObject({ team: "BOS", pair: [2028, 2029], offendingYear: 2028 });
  });

  it("Minnesota's 2030 is a swap too, and New Orleans' protected 2027 first is not theirs to trade", () => {
    expect(firstEncumbranceOf("MIN", 2030)?.status).toBe("swap");
    expect(lockedFirstEncumbrance("NOP", 2027)).toMatchObject({ status: "protected", counterparty: "Atlanta" });
  });

  it("no team starts the day already in violation", () => {
    for (const team of Object.keys(PICK_RIGHTS)) {
      const other = team === "UTA" ? "BOS" : "UTA";
      const r = ruleOnBaseTrade({ teams: [team, other].sort(), players: [], picks: [], date: SIM_DATE });
      expect(r.stepien.filter((f) => f.team === team), team).toEqual([]);
    }
  });
});
