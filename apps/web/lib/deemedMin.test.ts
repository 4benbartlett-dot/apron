import { describe, it, expect } from "vitest";
import { BASE_CONTRACTS, C, applyMove, deemedMinSalary } from "@/lib/league";

// Art. VII §3(f) + Art. IV §6(h): a 3+ YOS veteran on a ONE-year contract at
// his minimum has a SALARY equal to the 2-YOS minimum — the league reimburses
// his team the rest. Reported by @penguinem30 on launch day; permanent test.
const TWO_YOS = C.minimumSalaries[2]!; // 2,449,421 in 2026-27
const TEN_PLUS = C.minimumSalaries[10]!; // 3,876,529 in 2026-27

const salary2627 = (name: string) => {
  const c = BASE_CONTRACTS.find(
    (x) => x.playerName.toLowerCase() === name && !x.deadMoney,
  );
  return c?.years.find((y) => y.leagueYear === "2026-27")?.salary;
};

describe("deemedMinSalary", () => {
  it("deems a 10+ YOS one-year minimum to the 2-YOS minimum", () => {
    // Known 15-YOS vet id from the experience table via a real signing below;
    // the pure helper is exercised with a synthetic id that defaults to 8 YOS.
    expect(deemedMinSalary("nobody-defaults-to-8-yos", TEN_PLUS, 1)).toBe(TWO_YOS);
  });
  it("multi-year minimum deals book in full (no reimbursement)", () => {
    expect(deemedMinSalary("nobody-defaults-to-8-yos", TEN_PLUS, 2)).toBe(TEN_PLUS);
  });
  it("above-minimum one-year deals are untouched", () => {
    expect(deemedMinSalary("nobody-defaults-to-8-yos", 5_000_000, 1)).toBe(5_000_000);
  });
});

describe("real July 2026 one-year vet minimums book at the deemed number", () => {
  // Face value on these deals is the full 10+/scale minimum ($3,876,529);
  // Spotrac-style cap hit — and ours — must be the 2-YOS $2,449,421.
  // Mike Conley also covers the missing-experience-data path (defaults 8 YOS).
  for (const name of ["andre drummond", "tyus jones", "kyle anderson", "mike conley"]) {
    it(`${name} counts ${TWO_YOS.toLocaleString()} on the sheet`, () => {
      expect(salary2627(name)).toBe(TWO_YOS);
    });
  }
});

describe("sim minimum signings book deemed too", () => {
  it("a GM-signed one-year vet minimum lands at the 2-YOS charge", () => {
    const after = applyMove(BASE_CONTRACTS, {
      kind: "sign",
      label: "Sign Test Vet",
      playerId: "synthetic-vet",
      playerName: "Test Vet",
      teamId: "GSW",
      salary: TEN_PLUS,
      years: 1,
      mechanism: "minimum",
    });
    const c = after.find((x) => x.playerId === "synthetic-vet")!;
    expect(c.years.find((y) => y.leagueYear === "2026-27")!.salary).toBe(TWO_YOS);
  });
});
