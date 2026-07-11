import { describe, it, expect } from "vitest";
import { applyMove, YEAR, type Move } from "@/lib/league";
import type { Contract } from "@apron/cba-engine";

const c = (
  playerId: string,
  teamId: string,
  salary: number,
  leagueYear = "2025-26",
): Contract => ({
  playerId,
  playerName: playerId,
  teamId,
  years: [{ leagueYear, salary, guarantee: "full" }],
});
const yr = (out: Contract[], id: string, ly: string) =>
  out.find((x) => x.playerId === id)?.years.find((y) => y.leagueYear === ly);

describe("applyMove: sign", () => {
  it("generates multi-year rows with 5% raises and keeps past seasons", () => {
    const move: Move = { kind: "sign", label: "", playerId: "p", playerName: "p", teamId: "BOS", salary: 10_000_000, years: 3 };
    const out = applyMove([c("p", "BOS", 8_000_000)], move);
    expect(yr(out, "p", YEAR)?.salary).toBe(10_000_000);
    expect(yr(out, "p", "2027-28")?.salary).toBe(10_500_000); // +5%
    expect(yr(out, "p", "2028-29")?.salary).toBe(11_000_000);
    expect(yr(out, "p", "2025-26")?.salary).toBe(8_000_000); // past season kept
  });
  it("flags base-year comp only on a >20% raise that keeps the team over the cap", () => {
    // Big raise but tiny team salary (below cap) -> NOT base-year.
    const belowCap = applyMove([c("p", "BOS", 5_000_000)], { kind: "sign", label: "", playerId: "p", playerName: "p", teamId: "BOS", salary: 20_000_000, years: 1 });
    expect(belowCap.find((x) => x.playerId === "p")?.bycPriorSalary).toBeUndefined();
  });
});

describe("applyMove: sign_trade enforces the 3-year minimum", () => {
  it("builds at least 3 seasons with 8% raises", () => {
    const out = applyMove([c("fa2", "OLD", 20_000_000)], {
      kind: "sign_trade",
      label: "",
      playerId: "fa2",
      playerName: "fa2",
      toTeam: "NEW",
      salary: 10_000_000,
      years: 1, // below the CBA floor — must be raised to 3
      fromTeam: "OLD",
    });
    const p = out.find((x) => x.playerId === "fa2")!;
    const future = p.years.filter((y) => y.leagueYear >= YEAR);
    expect(future.length).toBe(3);
    expect(future[1]!.salary).toBe(10_800_000); // +8%
  });
});

describe("applyMove: extension trade freeze (CBA §8(f)(i))", () => {
  const base = (): Contract => ({ playerId: "x2", playerName: "x2", teamId: "BOS", years: [{ leagueYear: YEAR, salary: 20_000_000, guarantee: "full" }] });
  it("freezes when the extension exceeds extend-and-trade limits (>120% raise)", () => {
    const out = applyMove([base()], { kind: "extend", label: "", playerId: "x2", playerName: "x2", salary: 30_000_000, years: 2 });
    expect(out[0]!.restriction).toMatch(/extended/i);
  });
  it("freezes when the extended contract covers 5+ seasons", () => {
    const out = applyMove([base()], { kind: "extend", label: "", playerId: "x2", playerName: "x2", salary: 21_000_000, years: 4 });
    expect(out[0]!.restriction).toMatch(/extended/i);
  });
  it("does NOT freeze a modest extension within extend-and-trade limits", () => {
    const out = applyMove([base()], { kind: "extend", label: "", playerId: "x2", playerName: "x2", salary: 22_000_000, years: 2 });
    expect(out[0]!.restriction).toBeUndefined();
  });
});

describe("applyMove: extend", () => {
  it("appends extension years after the current last year with 8% raises", () => {
    const p: Contract = { playerId: "x", playerName: "x", teamId: "BOS", years: [{ leagueYear: YEAR, salary: 20_000_000, guarantee: "full" }] };
    const out = applyMove([p], { kind: "extend", label: "", playerId: "x", playerName: "x", salary: 25_000_000, years: 2 });
    expect(yr(out, "x", "2027-28")?.salary).toBe(25_000_000);
    expect(yr(out, "x", "2028-29")?.salary).toBe(27_000_000); // +8%
    expect(yr(out, "x", YEAR)?.salary).toBe(20_000_000); // current year untouched
  });
});

describe("applyMove: renounce is a no-op on contracts (never waives)", () => {
  it("leaves the player's salary intact", () => {
    const out = applyMove([c("y", "BOS", 5_000_000, YEAR)], { kind: "renounce", label: "", playerId: "y", playerName: "y", team: "BOS" });
    expect(yr(out, "y", YEAR)?.salary).toBe(5_000_000);
  });
});

describe("applyMove: waive creates dead money and clears trade-derived flags", () => {
  it("keeps guaranteed money on the books as dead money, flags cleared", () => {
    const p: Contract = { ...c("z", "BOS", 5_000_000, YEAR), noAggregate: true, restriction: "x", bycPriorSalary: 3_000_000 };
    const out = applyMove([p], { kind: "waive", label: "", playerId: "z" });
    // Still owed — the charge just moves from the roster to dead money.
    expect(out[0]!.deadMoney).toBe(true);
    expect(yr(out, "z", YEAR)?.salary).toBe(5_000_000);
    expect(out[0]!.noAggregate).toBeUndefined();
    expect(out[0]!.restriction).toBeUndefined();
    expect(out[0]!.bycPriorSalary).toBeUndefined();
  });
  it("stretches the guaranteed money over 2N+1 years when asked (Art. VII §7)", () => {
    const out = applyMove([c("z", "BOS", 6_000_000, YEAR)], { kind: "waive", label: "", playerId: "z", stretch: true });
    expect(out[0]!.deadMoney).toBe(true);
    expect(out[0]!.years).toHaveLength(3); // 2 × 1 + 1
    expect(yr(out, "z", YEAR)?.salary).toBe(2_000_000); // $6M / 3
  });
  it("a fully non-guaranteed contract is a clean cut — no dead money", () => {
    const ng: Contract = { playerId: "n", playerName: "n", teamId: "BOS", years: [{ leagueYear: YEAR, salary: 2_000_000, guarantee: "non_guaranteed" }] };
    const out = applyMove([ng], { kind: "waive", label: "", playerId: "n" });
    expect(out).toHaveLength(0);
  });
});

describe("applyMove: sign_trade with a return package", () => {
  it("adds the FA to the acquirer and sends the return players to the old team", () => {
    const fa = c("fa", "OLD", 20_000_000); // a real FA (2025-26 only)
    const back = { ...c("r1", "NEW", 15_000_000, YEAR), bycPriorSalary: 5_000_000 };
    const out = applyMove([fa, back], {
      kind: "sign_trade",
      label: "",
      playerId: "fa",
      playerName: "fa",
      toTeam: "NEW",
      salary: 20_000_000,
      fromTeam: "OLD",
      returnPlayers: ["r1"],
    });
    const signed = out.find((x) => x.playerId === "fa")!;
    expect(signed.teamId).toBe("NEW");
    expect(yr(out, "fa", YEAR)?.salary).toBe(20_000_000);
    expect(signed.restriction).toBeTruthy(); // S&T acquisition is trade-restricted
    const ret = out.find((x) => x.playerId === "r1")!;
    expect(ret.teamId).toBe("OLD");
    expect(ret.noAggregate).toBe(true);
    expect(ret.bycPriorSalary).toBeUndefined();
  });
});

describe("applyMove: trade", () => {
  it("moves the player, sets noAggregate, and clears base-year comp", () => {
    const p: Contract = { ...c("t", "BOS", 5_000_000, YEAR), bycPriorSalary: 3_000_000 };
    const out = applyMove([p], { kind: "trade", label: "", players: [{ playerId: "t", to: "LAL" }] });
    expect(out[0]!.teamId).toBe("LAL");
    expect(out[0]!.noAggregate).toBe(true);
    expect(out[0]!.bycPriorSalary).toBeUndefined();
  });
});
