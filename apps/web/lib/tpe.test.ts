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
      [{ teamId: "CHA", incomingSalary: 30_000_000, maxIncomingAllowed: 5_000_000 }],
      { CHA: [{ playerId: "a", salary: 28_000_000 }, { playerId: "b", salary: 2_000_000 }] },
      tpeLedger([]),
    );
    expect(plan?.CHA?.amount).toBe(28_000_000);
    expect(plan?.CHA?.preExisting).toBe(true);
  });

  it("returns nothing when no TPE can cover the gap", () => {
    const plan = fitTpePlan(
      [{ teamId: "DEN", incomingSalary: 60_000_000, maxIncomingAllowed: 5_000_000 }],
      { DEN: [{ playerId: "a", salary: 60_000_000 }] },
      tpeLedger([]),
    );
    expect(plan).toBeUndefined();
  });
});

describe("row F hard cap persists from TPE trades", () => {
  it("using a pre-existing TPE freezes the first apron for the session", () => {
    const mv: Move = {
      kind: "trade",
      label: "t",
      players: [{ playerId: salary("gui santos").playerId, to: "CHA" }],
      tpeUse: { CHA: { amount: 4_000_000, preExisting: true } },
    } as Move;
    expect(sessionHardCaps([mv]).CHA).toBe(C.firstApron);
  });
});
