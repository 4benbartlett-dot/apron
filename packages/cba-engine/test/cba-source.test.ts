import { describe, it, expect } from "vitest";
import { SEASON_2025_26 } from "../src/constants/2025-26";
import { SEASON_2026_27 } from "../src/constants/2026-27";
import type { LeagueConstants } from "../src/types";

// Cross-check our announced dollar constants against the 2023 CBA's own
// percentage formulas (Art. VII §§2, 6). The league announces the rounded
// dollar figure each year; these assertions prove our numbers are the ones the
// CBA formulas produce (within nearest-$1,000 rounding). Page numbers are the
// CBA's printed pages, verified against the source PDF.
const CAP_2023_24 = 136_021_000; // Taxpayer MLE escalation denominator.
const near = (actual: number, expected: number, tol = 1_500) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);

function checkAgainstCBA(c: LeagueConstants) {
  // Bi-Annual Exception = 3.32% of the cap (p. 235).
  near(c.biAnnualException, c.salaryCap * 0.0332);
  // Non-Taxpayer MLE = 9.12% of the cap (p. 236).
  near(c.nonTaxpayerMLE, c.salaryCap * 0.0912);
  // Room MLE = 5.678% of the cap (p. 239).
  near(c.roomMLE, c.salaryCap * 0.05678);
  // Taxpayer MLE = $5M × (cap ÷ 2023-24 cap) (p. 237).
  near(c.taxpayerMLE, 5_000_000 * (c.salaryCap / CAP_2023_24));
  // Minimum team salary = 90% of the cap (Art. VII §2).
  near(c.minTeamSalary, c.salaryCap * 0.9);
  // Max-salary tiers = 25% / 30% / 35% of the cap (Art. II §7).
  near(c.maxSalary["0-6"], c.salaryCap * 0.25);
  near(c.maxSalary["7-9"], c.salaryCap * 0.3);
  near(c.maxSalary["10+"], c.salaryCap * 0.35);
}

describe("constants match the CBA's own formulas", () => {
  it("2025-26 exceptions/tiers derive from the cap per the CBA", () => {
    checkAgainstCBA(SEASON_2025_26);
  });
  it("2026-27 exceptions/tiers derive from the cap per the CBA", () => {
    checkAgainstCBA(SEASON_2026_27);
  });
});
