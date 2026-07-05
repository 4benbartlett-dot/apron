import { describe, it, expect } from "vitest";
import { maxIncomingSalary, matchRuleLabel } from "../src/matching";
import { SEASON_2025_26 as C } from "../src/constants/2025-26";
import { SEASON_2026_27 } from "../src/constants/2026-27";

// Art. VII §6(j)(1)(iv): only the $7.5M escalates with the cap.
// 2025-26: 7.5M × 154,647/136,021 = $8,527,011.
const ESC = 8_527_011;

describe("expanded traded-player matching (team below the first apron)", () => {
  it("tier 1: outgoing ≤ $7.5M → 200% + $250k", () => {
    expect(maxIncomingSalary(5_000_000, "over_cap", 0, C).maxIncoming).toBe(
      10_250_000,
    );
  });

  it("200% prong still wins at $7.5M out (crossover is higher now)", () => {
    const r = maxIncomingSalary(7_500_000, "over_cap", 0, C);
    expect(r.maxIncoming).toBe(15_250_000);
    expect(r.rule).toBe("expanded_tier1_200pct");
  });

  it("tier1/tier2 crossover sits at ESC − $250k, both prongs equal there", () => {
    // 2025-26: 8,527,011 − 250,000 = 8,277,011 → both give $16,804,022...
    const at = ESC - 250_000;
    const r = maxIncomingSalary(at, "over_cap", 0, C);
    expect(r.maxIncoming).toBe(at * 2 + 250_000);
    expect(r.maxIncoming).toBe(at + ESC);
  });

  it("middle band: outgoing + escalated $7.5M (NOT flat $7.5M)", () => {
    // $10M out: min(2·10M + 250k, 10M + 8,527,011) = 18,527,011 — the 2023-24
    // "$17.5M" answer would be ~$1.03M too strict this year.
    const r = maxIncomingSalary(10_000_000, "taxpayer", 0, C);
    expect(r.maxIncoming).toBe(10_000_000 + ESC);
    expect(r.rule).toBe("expanded_tier2_flat");
  });

  it("middle band reaches past the old $29M breakpoint (crossovers scale too)", () => {
    // 125% overtakes the middle band at 4×(ESC − 250k) ≈ $33.1M, not $29M.
    const r = maxIncomingSalary(30_000_000, "taxpayer", 0, C);
    expect(r.maxIncoming).toBe(30_000_000 + ESC);
    expect(r.rule).toBe("expanded_tier2_flat");
  });

  it("tier 3: outgoing past ~$33.1M (2025-26) → 125% + $250k", () => {
    const r = maxIncomingSalary(35_000_000, "over_cap", 0, C);
    expect(r.maxIncoming).toBe(44_000_000);
    expect(r.rule).toBe("expanded_tier3_125pct");
  });

  it("the escalated figure derives from the cap ratio each year", () => {
    // 2026-27: 7.5M × 164,961/136,021 = $9,095,709.
    expect(SEASON_2026_27.tradeMatch.escalatedFlatAddOn).toBe(9_095_709);
    const r = maxIncomingSalary(20_000_000, "taxpayer", 0, SEASON_2026_27);
    expect(r.maxIncoming).toBe(29_095_709);
    expect(matchRuleLabel(r.rule, SEASON_2026_27)).toBe(
      "expanded matching, outgoing + $9.1M band",
    );
  });
});

describe("apron teams are limited to 100% (no 110%, no expanded bands)", () => {
  it("first-apron team: dollar-for-dollar", () => {
    const r = maxIncomingSalary(20_000_000, "first_apron", 0, C);
    expect(r.maxIncoming).toBe(20_000_000);
    expect(r.rule).toBe("first_apron_100pct");
  });

  it("second-apron team: dollar-for-dollar", () => {
    const r = maxIncomingSalary(20_000_000, "second_apron", 0, C);
    expect(r.maxIncoming).toBe(20_000_000);
    expect(r.rule).toBe("second_apron_100pct");
  });

  it("a $40M-out first-apron team still cannot exceed 100%", () => {
    // The old-CBA 150% rule and the dead 2023-24 110% rule must NOT apply.
    expect(maxIncomingSalary(40_000_000, "first_apron", 0, C).maxIncoming).toBe(
      40_000_000,
    );
  });
});

describe("under-cap teams absorb into cap room", () => {
  it("takes back outgoing + room + $250k (2023-CBA room allowance, finish <= cap + $250k)", () => {
    const r = maxIncomingSalary(5_000_000, "below_cap", 12_000_000, C);
    expect(r.maxIncoming).toBe(17_250_000);
    expect(r.rule).toBe("cap_room_absorption");
  });

  it("falls back to standard matching if that allows more than room + $250k", () => {
    // $2M room, $30M out: absorption = 30 + 2 + 0.25 = 32.25M; the escalated
    // middle band = 30M + 8,527,011 = 38,527,011, which is larger (and beats
    // 125% + 250k = 37.75M at this outgoing level).
    const r = maxIncomingSalary(30_000_000, "below_cap", 2_000_000, C);
    expect(r.maxIncoming).toBe(30_000_000 + ESC);
    expect(r.rule).toBe("expanded_tier2_flat");
  });
});
