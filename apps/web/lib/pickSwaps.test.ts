import { describe, it, expect } from "vitest";
import { applyMove, pickSwapValue, pickValue, BASE_CONTRACTS, type Move } from "@/lib/league";

// User-created pick swaps (Unit 2 of the draft-pick system). A swap is a RIGHT:
// the favored team takes the more favorable of two same-year firsts. We do not
// project which team finishes better, so the value is a symmetric fraction of an
// average pick — and ownership never changes (Stepien coverage is preserved).

describe("pick-swap value calibration", () => {
  it("sits on the pickValue scale, below the underlying pick, symmetric", () => {
    const y = 2028;
    const a = pickValue(y, 1, "WAS"); // rebuilder → higher pick value
    const b = pickValue(y, 1, "OKC"); // contender → lower pick value
    const swap = pickSwapValue(y, 1, "WAS", "OKC");
    expect(swap).toBeGreaterThan(0);
    // A swap right is worth less than owning either underlying first outright.
    expect(swap).toBeLessThan(Math.max(a, b));
    // Team order doesn't change a swap's value (we don't project records).
    expect(pickSwapValue(y, 1, "OKC", "WAS")).toBe(swap);
    // ~35% of the average of the two picks, to 0.1 precision.
    expect(swap).toBeCloseTo(Math.round(((a + b) / 2) * 0.35 * 10) / 10, 5);
  });

  it("a second-round swap is worth less than a first-round swap", () => {
    expect(pickSwapValue(2028, 2, "WAS", "OKC")).toBeLessThan(
      pickSwapValue(2028, 1, "WAS", "OKC"),
    );
  });

  it("further-out swaps mean-revert toward each other (less spread)", () => {
    const near = pickSwapValue(2027, 1, "WAS", "OKC");
    const far = pickSwapValue(2032, 1, "WAS", "OKC");
    expect(far).toBeLessThanOrEqual(near);
  });
});

describe("applyMove — swaps are rights, not transfers", () => {
  it("a swaps-only trade leaves every contract's team untouched", () => {
    const move: Move = {
      kind: "trade",
      label: "swap only",
      players: [],
      pickSwaps: [{ year: 2028, round: 1, favoredTo: "OKC", otherTeam: "HOU" }],
    };
    const after = applyMove(BASE_CONTRACTS, move);
    expect(after.map((c) => c.teamId)).toEqual(BASE_CONTRACTS.map((c) => c.teamId));
  });

  it("players still move when a swap rides along in the same trade", () => {
    const someone = BASE_CONTRACTS.find((c) => c.teamId === "HOU")!;
    const move: Move = {
      kind: "trade",
      label: "player + swap",
      players: [{ playerId: someone.playerId, to: "OKC" }],
      pickSwaps: [{ year: 2029, round: 1, favoredTo: "OKC", otherTeam: "HOU" }],
    };
    const after = applyMove(BASE_CONTRACTS, move);
    expect(after.find((c) => c.playerId === someone.playerId)!.teamId).toBe("OKC");
  });
});
