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
    // Mouhamadou Gueye then moved on twice: a Jul 10 four-teamer sent him
    // CHI → CHA, and Charlotte waived him on Jul 30. He is off the roster
    // entirely — his $2,411,090 was non-guaranteed (Star Tribune), so Charlotte
    // owes nothing and carries a $0 dead row rather than a salary. Asserting
    // the WAIVE is the stronger check: for a month he stayed live on Charlotte
    // because ACTIVE_LATER had no date in it and his earlier trade counted as
    // "later" than his own release.
    expect(BASE_CONTRACTS.filter((c) => c.playerName === "Mouhamadou Gueye" && !c.deadMoney)).toHaveLength(0);
    // The OTHER Gueye stays put — the surname fallback must not cross-match,
    // and a bad match here would have waived Atlanta's man instead.
    expect(teamOf("Mouhamed Gueye")).toBe("ATL");
    expect(currentSalary(BASE_CONTRACTS.find((c) => c.playerName === "Mouhamed Gueye")!)).toBeGreaterThan(0);
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

  it("Kuminga's ATL hold is gone: he signed in Minnesota on the taxpayer MLE (Aug 26)", () => {
    // Until Aug 26 this pinned his Non-Bird hold on Atlanta (120% of prior
    // salary, per the feed override). He then took 2yr/$12,431,200 from
    // Minnesota, y1 $6,064,000 — the taxpayer mid-level to the dollar — so
    // the hold is gone and the contract is on the Wolves.
    expect(freeAgentsOf(BASE_CONTRACTS).some((f) => f.playerName === "Jonathan Kuminga")).toBe(false);
    const c = BASE_CONTRACTS.find((x) => x.playerName === "Jonathan Kuminga")!;
    expect(c.teamId).toBe("MIN");
    expect(c.years.find((y) => y.leagueYear === "2026-27")?.salary).toBe(C.taxpayerMLE);
  });

  it("a second-rounder on a two-way carries no cap salary (the Hopkins class)", () => {
    // Bryce Hopkins (#49, DEN) signed a two-way on Aug 26 and was booked at
    // the $1,358,152 rookie minimum for six days because any Signing row
    // counted as "has a deal". Thirteen more from the second round were in
    // the same state since July — Nick Martinelli, Jaron Pierre Jr., Tobi
    // Lawal, Izaiyah Nelson among them — none of them on his team's Spotrac
    // page. A two-way is off the cap and lands on the team it is WITH, which
    // for a traded pick is not the team that drafted him.
    for (const [name, team] of [
      ["Bryce Hopkins", "DEN"],
      ["Nick Martinelli", "LAC"], // drafted NYK, two-way with the Clippers
      ["Izaiyah Nelson", "ORL"], // drafted WAS, two-way with the Magic
      ["Jaron Pierre Jr.", "NOP"],
    ] as const) {
      const rows = BASE_CONTRACTS.filter((c) => c.playerName === name);
      expect(rows, name).toHaveLength(1);
      expect(rows[0]!.teamId, name).toBe(team);
      expect(rows[0]!.signedUsing, name).toBe("Two-Way");
      expect(rows[0]!.years.find((y) => y.leagueYear === "2026-27")?.salary ?? 0, name).toBe(0);
    }
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
  it("DeRozan's SAC dead money is the $10M guarantee, stretched to $3.33M a season", () => {
    // $10M of the $25.74M was guaranteed (ESPN/Marks), and at the Aug 31
    // deadline Sacramento stretched it — $3,333,333 in each of 2026-27,
    // 2027-28 and 2028-29 (Hoops Rumors, Aug 28), which takes them under the
    // tax line. Spotrac rewrote its Jul 6 waive row to "via Stretch
    // Provision"; that row supplies the stretch, the curated one the amount.
    const rows = BASE_CONTRACTS.filter((c) => c.playerName === "DeMar DeRozan" && c.deadMoney);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.teamId).toBe("SAC");
    expect(rows[0]!.years.map((y) => y.salary)).toEqual([3_333_333, 3_333_333, 3_333_333]);
  });

  it("Valanciunas' $2M DEN guarantee is stretched to $667K a season", () => {
    // Denver stretched the $2,000,000 guarantee at the deadline (Hoops
    // Rumors, Aug 27): $666,667 a year for three seasons, a $1,333,333 cut
    // to 2026-27 team salary — and Spotrac's Nuggets figure fell by exactly that.
    const rows = BASE_CONTRACTS.filter((c) => c.playerName.startsWith("Jonas Valan") && c.deadMoney);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.teamId).toBe("DEN");
    expect(rows[0]!.years.map((y) => y.salary)).toEqual([666_667, 666_667, 666_667]);
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
