import { describe, it, expect } from "vitest";
import {
  BASE_CONTRACTS,
  allocateRotation,
  applyMove,
  rosterOf,
  eligiblePositions,
  secondaryPositionsOf,
  impactScoreOf,
} from "@/lib/league";

const rosterAfterTrade = (playerId: string, to: string) => {
  const from = BASE_CONTRACTS.find((c) => c.playerId === playerId)!.teamId;
  const contracts = applyMove(BASE_CONTRACTS, {
    kind: "trade",
    label: "test",
    players: [{ playerId, to }],
  } as never);
  return { contracts, from };
};

describe("projected rotation — lockout fixes", () => {
  it("a sat-out-last-season veteran (Kyrie) gets minutes on his OWN team", () => {
    const dal = rosterOf(BASE_CONTRACTS, "DAL");
    const rot = allocateRotation(dal);
    const held = Object.values(rot.byPos)
      .flat()
      .filter((s) => s.playerId === "irvinky01")
      .reduce((m, s) => m + s.minutes, 0);
    expect(held).toBeGreaterThan(0);
  });

  it("trading FOR Kyrie puts him in the new team's rotation", () => {
    const { contracts } = rosterAfterTrade("irvinky01", "CLE");
    const rot = allocateRotation(rosterOf(contracts, "CLE"));
    const held = Object.values(rot.byPos)
      .flat()
      .filter((s) => s.playerId === "irvinky01")
      .reduce((m, s) => m + s.minutes, 0);
    expect(held).toBeGreaterThan(0);
    expect(rot.benched.some((b) => b.playerId === "irvinky01")).toBe(false);
  });

  it("fairness: nobody is benched while a strictly worse player holds minutes at his spot", () => {
    for (const team of ["LAL", "CLE", "DAL", "GSW", "NYK", "OKC"]) {
      const rot = allocateRotation(rosterOf(BASE_CONTRACTS, team));
      for (const b of rot.benched) {
        const elig = eligiblePositions(b.playerId);
        for (const pos of elig) {
          for (const s of rot.byPos[pos] ?? []) {
            // a benched player may not be clearly better (>1 av) than a holder
            // at a spot he can play
            expect(b.av).toBeLessThanOrEqual(s.av + 1);
          }
        }
      }
    }
  });

  it("LeBron's secondary is PF (never SG); sat-out stars have a secondary", () => {
    expect(secondaryPositionsOf("jamesle01")).toEqual(["PF"]);
    expect(secondaryPositionsOf("doncilu01")).toEqual(["SG"]);
    expect(secondaryPositionsOf("irvinky01")).toEqual(["SG"]);
  });

  it("total allocated minutes never exceed the 240-a-night budget", () => {
    const rot = allocateRotation(rosterOf(BASE_CONTRACTS, "LAL"));
    const total = Object.values(rot.byPos).flat().reduce((m, s) => m + s.minutes, 0);
    expect(total).toBeLessThanOrEqual(240 * 82 + 1);
  });

  it("impact pill still reads starter-grade for the fallback players", () => {
    const kyrie = BASE_CONTRACTS.find((c) => c.playerId === "irvinky01")!;
    expect(impactScoreOf(kyrie)).toBeGreaterThanOrEqual(50);
  });
});
