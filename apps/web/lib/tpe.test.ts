import { describe, it, expect } from "vitest";
import { TRADE_EXCEPTIONS } from "@apron/data";
import { BASE_CONTRACTS, C, tpeLedger, fitTpePlan, sessionHardCaps, type Move } from "@/lib/league";

// Traded-player exceptions v1 — the Kevin O'Connor feature. Real ledger is
// dual-source (Spotrac × SalarySwish); room teams lose theirs per §6(n)(2).

const salary = (name: string) =>
  BASE_CONTRACTS.find((c) => c.playerName.toLowerCase().includes(name) && !c.deadMoney)!;

describe("TPE ledger", () => {
  it("carries the real dual-source exceptions", () => {
    expect(TRADE_EXCEPTIONS.length).toBeGreaterThan(50);
    const ledger = tpeLedger([]);
    // CHA's LaMelo TPE is the league's biggest and CHA is not a room team.
    expect(ledger.CHA?.[0]?.amount).toBeGreaterThan(40_000_000);
    expect(ledger.CHA?.[0]?.preExisting).toBe(true);
  });

  it("flags row-F cap by ARISE date, not just standing status (§6(j)(1)(i))", () => {
    const cha = tpeLedger([]).CHA ?? [];
    // LaMelo's $40.8M TPE arose in the 2026 offseason (expires ~late June
    // 2027) — standing, but its first-apron hard cap doesn't attach until
    // after the 2026-27 Regular Season, so it is NOT row-F capped now.
    const lamelo = cha.find((s) => s.label.includes("LaMelo"))!;
    expect(lamelo.amount).toBeGreaterThan(40_000_000);
    expect(lamelo.preExisting).toBe(true);
    expect(lamelo.firstApronCap).toBe(false);
    // Collin Sexton's TPE arose in the 2025-26 Regular Season (expires
    // Feb 2027) — row-F capped now.
    const sexton = cha.find((s) => s.label.includes("Sexton"))!;
    expect(sexton.preExisting).toBe(true);
    expect(sexton.firstApronCap).toBe(true);
  });

  it("room teams lost their TPEs with the room (§6(n)(2))", () => {
    // LAL/CHI/BKN operated under the cap — their scraped TPEs are dead.
    const ledger = tpeLedger([]);
    for (const t of ["LAL", "CHI", "BKN"]) expect(ledger[t]).toBeUndefined();
    // And the raw data really did carry rows for at least one of them.
    expect(TRADE_EXCEPTIONS.some((r) => ["LAL", "CHI", "BKN"].includes(r.team))).toBe(true);
  });

  it("an uneven session trade mints a same-offseason TPE", () => {
    const curry = salary("stephen curry");
    const uneven: Move = {
      kind: "trade",
      label: "t",
      players: [{ playerId: curry.playerId, to: "WAS" }],
    } as Move;
    const minted = tpeLedger([uneven]).GSW?.find((s) => !s.preExisting);
    expect(minted).toBeDefined();
    expect(minted!.amount).toBeGreaterThan(50_000_000); // Curry-sized
    expect(minted!.label).toContain("Curry");
  });

  it("consumption comes off the ledger largest-first", () => {
    const before = tpeLedger([]).CHA![0]!.amount;
    const spend: Move = {
      kind: "trade",
      label: "t",
      players: [{ playerId: salary("stephen curry").playerId, to: "CHA" }],
      tpeUse: { CHA: { amount: 10_000_000, preExisting: true } },
    } as Move;
    const after = tpeLedger([spend]).CHA![0]!.amount;
    expect(before - after).toBe(10_000_000);
  });
});

describe("TPE auto-fit", () => {
  it("legalizes a failing leg by absorbing the largest incoming player", () => {
    const plan = fitTpePlan(
      [{ teamId: "CHA", incomingSalary: 30_000_000, maxIncomingAllowed: 5_000_000, postTradeSalary: 197_000_000 }],
      { CHA: [{ playerId: "a", salary: 28_000_000 }, { playerId: "b", salary: 2_000_000 }] },
      tpeLedger([]),
    );
    expect(plan?.CHA?.amount).toBe(28_000_000);
    expect(plan?.CHA?.preExisting).toBe(true);
  });

  it("returns nothing when no TPE can cover the gap", () => {
    const plan = fitTpePlan(
      [{ teamId: "DEN", incomingSalary: 60_000_000, maxIncomingAllowed: 5_000_000, postTradeSalary: 200_000_000 }],
      { DEN: [{ playerId: "a", salary: 60_000_000 }] },
      tpeLedger([]),
    );
    expect(plan).toBeUndefined();
  });
});

describe("row F hard cap persists from TPE trades", () => {
  // A one-sided absorb: CHA takes a player fully into the TPE (no matching, no
  // expanded formula), so the ONLY possible hard cap is row F itself.
  const absorbInto = (use: {
    amount: number;
    preExisting: boolean;
    firstApronCap?: boolean;
  }): Move =>
    ({
      kind: "trade",
      label: "t",
      players: [{ playerId: salary("gui santos").playerId, to: "CHA" }],
      tpeUse: { CHA: use },
    }) as Move;

  it("using a pre-existing TPE freezes the first apron for the session", () => {
    // Legacy plan (no firstApronCap) falls back to preExisting → capped.
    expect(sessionHardCaps([absorbInto({ amount: 4_000_000, preExisting: true })]).CHA).toBe(
      C.firstApron,
    );
  });

  it("a Regular-Season-arisen TPE (firstApronCap) hard-caps at the first apron", () => {
    const caps = sessionHardCaps([
      absorbInto({ amount: 4_000_000, preExisting: true, firstApronCap: true }),
    ]);
    expect(caps.CHA).toBe(C.firstApron);
  });

  it("an offseason-arisen TPE (LaMelo-style) does NOT hard-cap now (row F(ii))", () => {
    // firstApronCap:false — arose this offseason, so no first-apron cap until
    // after the 2026-27 Regular Season, even though it's a standing TPE.
    const caps = sessionHardCaps([
      absorbInto({ amount: 40_000_000, preExisting: true, firstApronCap: false }),
    ]);
    expect(caps.CHA).toBeUndefined();
  });

  it("offseason TPEs are usable above the first apron (row F(ii) — no gate)", () => {
    // Real CHA ledger: LaMelo's $40.8M is offseason-arisen. A team finishing
    // over the first apron may still use it (a Regular-Season TPE could not).
    const plan = fitTpePlan(
      [
        {
          teamId: "CHA",
          incomingSalary: 30_000_000,
          maxIncomingAllowed: 250_000,
          postTradeSalary: C.firstApron + 5_000_000,
        },
      ],
      { CHA: [{ playerId: "a", salary: 30_000_000 }] },
      tpeLedger([]),
    );
    expect(plan?.CHA?.label).toContain("LaMelo");
    expect(plan?.CHA?.firstApronCap).toBe(false);
  });
});

describe("Codex review holes (regression tests)", () => {
  it("consumption hits the PRE-trade ledger, not a TPE the same trade mints", () => {
    // CHA absorbs $10M via the pre-existing LaMelo TPE while ALSO sending out
    // a big salary for nothing back — which mints a fresh same-session TPE.
    // The mint must arrive full-size; the spend must come off LaMelo's.
    const big = BASE_CONTRACTS.find(
      (c) => c.teamId === "CHA" && !c.deadMoney && (c.years.find((y) => y.leagueYear === "2026-27")?.salary ?? 0) > 15_000_000,
    )!;
    const bigSalary = big.years.find((y) => y.leagueYear === "2026-27")!.salary;
    const before = tpeLedger([]).CHA!.find((s) => s.preExisting)!.amount;
    const mv: Move = {
      kind: "trade",
      label: "t",
      players: [{ playerId: big.playerId, to: "POR" }],
      tpeUse: { CHA: { amount: 10_000_000, preExisting: true } },
    } as Move;
    const after = tpeLedger([mv]).CHA!;
    const pre = after.find((s) => s.preExisting)!;
    const minted = after.find((s) => !s.preExisting)!;
    expect(before - pre.amount).toBe(10_000_000); // spend hit the old TPE
    expect(minted.amount).toBe(bigSalary); // the mint is untouched
  });

  it("row F steers the fit to a same-offseason TPE when post > first apron", () => {
    const ledger = {
      HOT: [
        { team: "HOT", amount: 30_000_000, label: "Big old TPE", preExisting: true, firstApronCap: true, expires: "2027-01-01" },
        { team: "HOT", amount: 12_000_000, label: "Fresh TPE", preExisting: false, firstApronCap: false, expires: "2027-07-05" },
      ],
    };
    const plan = fitTpePlan(
      [{ teamId: "HOT", incomingSalary: 11_000_000, maxIncomingAllowed: 250_000, postTradeSalary: 215_000_000 }],
      { HOT: [{ playerId: "a", salary: 11_000_000 }] },
      ledger,
    );
    expect(plan?.HOT?.preExisting).toBe(false); // pre-existing barred above 1A
    expect(plan?.HOT?.label).toBe("Fresh TPE");
  });

  it("session cap-room usage kills pre-existing TPEs (§6(n)(2))", () => {
    const roomSign: Move = {
      kind: "sign",
      label: "s",
      playerId: "x",
      playerName: "X",
      teamId: "CHA",
      salary: 20_000_000,
      years: 2,
      mechanism: "cap_room",
    } as Move;
    expect(tpeLedger([])?.CHA?.length).toBeGreaterThan(0);
    expect(tpeLedger([roomSign])?.CHA).toBeUndefined();
  });
});
