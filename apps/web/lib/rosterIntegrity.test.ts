import { describe, it, expect } from "vitest";
import { BASE_CONTRACTS, currentSalary, deadMoneyOf, freeAgentsOf, normName, C, applyMove, type Move } from "@/lib/league";

// Launch-week community reports, permanent. @tomer_langer: Claxton still on
// the Nets page after the Randle three-teamer (the trade prose says "Nicolas",
// the sheet says "Nic" — the name-variant fallback covers that class).
// @Rizk_Taker: Cameron Carr on the Knicks after his rights moved on draft
// night (draft-rights trades hit ROOKIES_2026, not the veteran sheet).

const teamOf = (name: string) => {
  const rows = BASE_CONTRACTS.filter((c) => c.playerName === name && !c.deadMoney);
  expect(rows.length, `${name} should appear exactly once`).toBe(1);
  return rows[0]!.teamId;
};

describe("Randle–Claxton multi-team + the later Gueye trade", () => {
  it("lands every leg", () => {
    expect(teamOf("Julius Randle")).toBe("BKN");
    expect(teamOf("Nic Claxton")).toBe("CHI"); // prose calls him "Nicolas"
    // Mouhamadou Gueye then moved on: a Jul 10 four-teamer sent him CHI → CHA.
    expect(teamOf("Mouhamadou Gueye")).toBe("CHA");
    // The OTHER Gueye stays put — the surname fallback must not cross-match.
    expect(teamOf("Mouhamed Gueye")).toBe("ATL");
  });
});

describe("draft-night rights trades (Jun 24 four-teamer)", () => {
  it("rookies land on their post-trade teams", () => {
    expect(teamOf("Cameron Carr")).toBe("LAL");
    expect(teamOf("Sergio de Larrea")).toBe("DAL");
    expect(teamOf("Koa Peat")).toBe("PHX");
    // Ajinca's DRAFT RIGHTS moved to NYK but he's an unsigned stash — no
    // contract, so he correctly appears on no cap sheet.
    expect(BASE_CONTRACTS.filter((c) => c.playerName === "Melvin Ajinca")).toHaveLength(0);
  });
});

describe("Jul 6 moves (same-day ingest)", () => {
  it("the Giannis blockbuster, Hachimura, and the pending Post offer sheet", () => {
    expect(teamOf("Giannis Antetokounmpo")).toBe("MIA");
    expect(teamOf("Bobby Portis")).toBe("MIA");
    expect(teamOf("Tyler Herro")).toBe("MIL");
    expect(teamOf("Kel'el Ware")).toBe("MIL");
    expect(teamOf("Rui Hachimura")).toBe("LAC");
    // Post's offer sheet resolved Jul 7: Golden State declined to match Memphis'
    // 3yr/$30M sheet, so he joins the Grizzlies — no lingering GSW cap hold.
    const post = BASE_CONTRACTS.filter((c) => c.playerName === "Quinten Post" && !c.deadMoney);
    expect(post.length).toBeGreaterThan(0);
    expect(post.every((c) => c.teamId === "MEM")).toBe(true);
  });
});

describe("phantom holds (@Ianberlin23's Saric report — the mid-season-waive class)", () => {
  it("players waived during 2025-26 generate no free-agent hold", () => {
    const pool = new Set(freeAgentsOf(BASE_CONTRACTS).map((f) => f.playerName));
    // DET absorbed Saric into the Schroder TPE Feb 3, waived him Feb 9 —
    // he signed in Turkey. The feed window opens Jun 8, so without the
    // curated waived list he'd sit on DET's books as a $10.3M hold.
    for (const name of ["Dario Saric", "Cam Thomas", "Kobe Bufkin", "Chris Boucher", "Eric Gordon", "Cole Anthony"]) {
      expect(pool.has(name), `${name} should NOT be in the FA pool`).toBe(false);
    }
  });

  it("Kuminga's ATL hold is Non-Bird (feed override), not full Bird", () => {
    const fa = freeAgentsOf(BASE_CONTRACTS).find((f) => f.playerName === "Jonathan Kuminga");
    expect(fa?.birdStatus).toBe("non_bird");
    expect(fa!.hold).toBe(Math.round(fa!.lastSalary * 1.2));
  });

  it("rookie-scale RFAs get the Art. VII §4(d)(1)(ii) 300% hold (Duren class)", () => {
    const duren = freeAgentsOf(BASE_CONTRACTS).find((f) => f.playerName === "Jalen Duren");
    if (duren) {
      // below the estimated average salary → 300%
      expect(duren.hold).toBe(Math.round(Math.min(C.maxSalary["10+"], duren.lastSalary * 3)));
    }
  });
});

describe("waive charges match real guarantees", () => {
  it("DeRozan's SAC dead money is the $10M guarantee, not the $25.74M listed salary", () => {
    const rows = BASE_CONTRACTS.filter((c) => c.playerName === "DeMar DeRozan" && c.deadMoney);
    expect(rows).toHaveLength(1);
    const y = rows[0]!.years.find((yy) => yy.leagueYear === "2026-27");
    expect(y?.salary).toBe(10_000_000);
  });

  it("Isaac's stated $8M ORL dead cap survives his re-signing (ACTIVE_LATER class)", () => {
    const dead = BASE_CONTRACTS.filter((c) => c.playerName === "Jonathan Isaac" && c.deadMoney);
    expect(dead).toHaveLength(1);
    expect(dead[0]!.teamId).toBe("ORL");
    expect(dead[0]!.years[0]?.salary).toBe(8_000_000);
    // ...while his NEW minimum deal books on the active row.
    const active = BASE_CONTRACTS.filter((c) => c.playerName === "Jonathan Isaac" && !c.deadMoney);
    expect(active).toHaveLength(1);
    expect(currentSalary(active[0]!)).toBeGreaterThan(0);
  });
});

describe("officially-filed deals (Jul 6) book once, with filed terms", () => {
  it("Ron Harper Jr.'s 4y/$13.5M books on BOS via the curated stub", () => {
    const rows = BASE_CONTRACTS.filter((c) => c.playerName === "Ron Harper Jr." && !c.deadMoney);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.teamId).toBe("BOS");
    const y1 = currentSalary(rows[0]!);
    expect(y1).toBeGreaterThan(3_000_000);
    expect(y1).toBeLessThan(3_300_000);
  });
});

describe("roster invariants (league-wide)", () => {
  it("no active player appears on two teams or twice anywhere — by id AND name", () => {
    const seenId = new Map<string, string>();
    const seenName = new Map<string, string>();
    for (const c of BASE_CONTRACTS) {
      if (c.deadMoney || currentSalary(c) === 0) continue;
      expect(seenId.get(c.playerId), `${c.playerName} on ${seenId.get(c.playerId)} AND ${c.teamId}`).toBeUndefined();
      seenId.set(c.playerId, c.teamId);
      // Name-level too: the rookie dual-row failure mode is same player,
      // two ids — the id check alone would sail past it.
      const k = normName(c.playerName);
      expect(seenName.get(k), `${c.playerName} duplicated: ${seenName.get(k)} AND ${c.teamId} (${c.playerId})`).toBeUndefined();
      seenName.set(k, c.teamId);
    }
  });
});

// Reported Jul 28: signing DeMar DeRozan put him on the signing team's books as
// DEAD MONEY rather than as a player, and Sacramento's real dead-money charge
// disappeared at the same time. A waived free agent exists on the sheet only as
// his old team's charge — he has no live contract row — and the sign path was
// matching that row by id and rewriting it in place, carrying `deadMoney: true`
// along with it. Whole class of bug: every player in roster-corrections'
// `waivedFreeAgents`.
describe("signing a waived free agent (the DeRozan report)", () => {
  const waived = BASE_CONTRACTS.filter((c) => c.deadMoney && currentSalary(c) > 0);

  it("mints a live contract and leaves the old team's dead money alone", () => {
    for (const dead of waived) {
      // Only players who are actually signable free agents — a stretched
      // charge whose player is rostered elsewhere isn't this case.
      const fa = freeAgentsOf(BASE_CONTRACTS).find((f) => f.playerId === dead.playerId);
      if (!fa) continue;
      const target = dead.teamId === "GSW" ? "BOS" : "GSW";
      const after = applyMove(BASE_CONTRACTS, {
        kind: "sign", label: "t", playerId: dead.playerId, playerName: dead.playerName,
        teamId: target, salary: C.minimumSalaries[10]!, years: 1, mechanism: "minimum",
      } as unknown as Move);
      const rows = after.filter((c) => c.playerId === dead.playerId);
      const live = rows.filter((c) => !c.deadMoney);
      const charge = rows.filter((c) => c.deadMoney);
      expect(live, `${dead.playerName}: should have exactly one live row`).toHaveLength(1);
      expect(live[0]!.teamId, dead.playerName).toBe(target);
      expect(charge, `${dead.playerName}: old team keeps its charge`).toHaveLength(1);
      expect(charge[0]!.teamId, dead.playerName).toBe(dead.teamId);
      expect(currentSalary(charge[0]!), dead.playerName).toBe(currentSalary(dead));
    }
  });
});
