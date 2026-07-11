import { describe, it, expect } from "vitest";
import { BASE_CONTRACTS, C, YEAR, experienceOf, deemedMinSalary } from "@/lib/league";

/**
 * CBA Art. VII §3(f): a 3+ YOS veteran on a 1-year minimum contract counts
 * against his team's cap at the TWO-year minimum (the league reimburses the
 * difference), while being paid his full minimum. This must hold for REAL vet
 * mins pulled from the contracts feed, not only for user-made signings.
 */
const TWO_YOS_MIN = C.minimumSalaries[2]!;

function forwardYears(c: (typeof BASE_CONTRACTS)[number]) {
  return c.years.filter((y) => y.leagueYear >= YEAR);
}

describe("deemed veteran minimums (Art. VII §3(f))", () => {
  it("deems a real 1-year vet min to the 2-YOS floor for cap", () => {
    // Jordan Clarkson signed a real 1-year minimum with NYK as a 12-year vet;
    // his cap number must be the 2-YOS floor ($2.449M), NOT his full min.
    const clarkson = BASE_CONTRACTS.find((c) => c.playerName === "Jordan Clarkson");
    expect(clarkson, "Jordan Clarkson should be on the working sheet").toBeTruthy();
    const y1 = forwardYears(clarkson!)[0];
    expect(y1?.salary).toBe(TWO_YOS_MIN);
    expect(experienceOf(clarkson!.playerId)).toBeGreaterThanOrEqual(3);
  });

  it("leaves an above-minimum 1-year deal alone", () => {
    // Javonte Green signed for $3.944M — above his minimum — so it is NOT a vet
    // min and must be booked at full value, not deemed down.
    const green = BASE_CONTRACTS.find((c) => c.playerName === "Javonte Green");
    if (green) {
      const y1 = forwardYears(green)[0];
      expect(y1?.salary).toBeGreaterThan(TWO_YOS_MIN);
    }
  });

  it("holds league-wide: no active 1-year vet min is booked above the 2-YOS floor", () => {
    const offenders: string[] = [];
    for (const c of BASE_CONTRACTS) {
      if (c.deadMoney) continue;
      const fwd = forwardYears(c);
      if (fwd.length !== 1) continue;
      const yr = fwd[0]!;
      // If deeming WOULD change the booked salary, the final pass failed to
      // apply — that's an un-deemed real vet min slipping through.
      const deemed = deemedMinSalary(c.playerId, yr.salary, 1);
      if (deemed !== yr.salary) offenders.push(`${c.playerName} (${c.teamId}) booked $${yr.salary}, should be $${deemed}`);
    }
    expect(offenders, offenders.join("; ")).toEqual([]);
  });
});
