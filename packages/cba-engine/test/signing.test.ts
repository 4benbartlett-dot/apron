import { describe, it, expect } from "vitest";
import { validateSigning, spendingPower } from "../src/signing";
import { SEASON_2026_27 as C } from "../src/constants/2026-27";

describe("official 2026-27 constants", () => {
  it("has the official cap and thresholds", () => {
    expect(C.official).toBe(true);
    expect(C.salaryCap).toBe(164_961_000);
    expect(C.firstApron).toBe(209_015_000);
    expect(C.secondApron).toBe(221_686_000);
    expect(C.nonTaxpayerMLE).toBe(15_044_000);
    expect(C.taxpayerMLE).toBe(6_064_000);
  });
});

describe("spendingPower gates mechanisms by apron tier", () => {
  it("under-cap team gets cap space + room MLE", () => {
    const ids = spendingPower(140_000_000, C).mechanisms.map((m) => m.id);
    expect(ids).toContain("cap_room");
    expect(ids).toContain("room_mle");
    expect(ids).not.toContain("ntmle");
  });
  it("over-cap (below apron) team gets the Non-Tax MLE + BAE, and the Taxpayer MLE for a deal that carries it over the first apron", () => {
    const ids = spendingPower(190_000_000, C).mechanisms.map((m) => m.id);
    expect(ids).toContain("ntmle");
    expect(ids).toContain("bae");
    // Art. VII §6(f)(1): the Taxpayer MLE may be used "provided that the
    // Team's Apron Team Salary immediately following the Team's use of such
    // Exception exceeds the First Apron Level" — a landing condition, not a
    // starting one. It is on the list; validateSigning applies the condition.
    expect(ids).toContain("tpmle");
    // $190M + $6.06M stays under the first apron, so the Taxpayer MLE is not
    // usable here — the Non-Tax MLE is the mechanism.
    expect(validateSigning(190_000_000, 6_000_000, C).mechanism?.id).toBe("ntmle");
  });
  it("first-apron team gets only the Taxpayer MLE", () => {
    const ids = spendingPower(212_000_000, C).mechanisms.map((m) => m.id);
    expect(ids).toContain("tpmle");
    expect(ids).not.toContain("ntmle");
  });
  it("second-apron team gets the minimum only", () => {
    const ids = spendingPower(225_000_000, C).mechanisms.map((m) => m.id);
    expect(ids).toEqual(["minimum"]);
  });
});

describe("validateSigning picks the right exception", () => {
  it("under-cap team signs into cap space", () => {
    const v = validateSigning(140_000_000, 20_000_000, C);
    expect(v.legal).toBe(true);
    expect(v.mechanism?.id).toBe("cap_room");
  });

  it("over-cap team uses the Non-Tax MLE and is hard-capped at the first apron", () => {
    const v = validateSigning(190_000_000, 12_000_000, C);
    expect(v.legal).toBe(true);
    expect(v.mechanism?.id).toBe("ntmle");
    expect(v.hardCap).toBe("first_apron");
  });

  it("over-cap team signs a MINIMUM player via the Minimum, not the MLE", () => {
    // Regression: the picker ranked the Non-Tax MLE ahead of the Minimum, so a
    // minimum free agent signed over the cap wrongly burned the MLE and
    // hard-capped the team at the first apron. The Minimum covers it — use it,
    // with no hard cap (this is the Kadary Richmond report).
    const v = validateSigning(190_000_000, C.minimumSalaries[1]!, C, { yearsOfService: 1 });
    expect(v.legal).toBe(true);
    expect(v.mechanism?.id).toBe("minimum");
    expect(v.hardCap).toBe(null);
  });

  it("keeps the NT-MLE + BAE when FA holds (not signed salary) push a team over the cap", () => {
    // Regression: signed salary $160M is UNDER the $165M cap, but $20M of kept
    // FA holds push cap salary over it. Apron salary (holds excluded) stays
    // below the cap, so tier reads "below_cap" — yet this is an over-the-cap
    // NON-taxpayer, entitled to the full Non-Taxpayer MLE + BAE, not just the
    // minimum. The engine used to offer only the minimum here.
    const opts = { apronSalary: 160_000_000 };
    const ids = spendingPower(180_000_000, C, opts).mechanisms.map((m) => m.id);
    expect(ids).toContain("ntmle");
    expect(ids).toContain("bae");
    const v = validateSigning(180_000_000, 10_000_000, C, opts);
    expect(v.legal).toBe(true);
    expect(v.mechanism?.id).toBe("ntmle");
    expect(v.hardCap).toBe("first_apron");
  });

  it("Non-Tax MLE cannot be used if it would breach the first-apron hard cap; the Taxpayer MLE can, and hard-caps at the second", () => {
    // $205M team is only ~$4M below the first apron.
    const v = validateSigning(205_000_000, 10_000_000, C);
    expect(v.legal).toBe(false);
    // The most it can pay is the full Taxpayer MLE: $205M + $6.06M lands over
    // the first apron, which is what §6(f)(1) requires, and under the second.
    expect(v.maxOffer).toBe(C.taxpayerMLE);
    expect(v.maxOfferMechanism?.id).toBe("tpmle");
    const t = validateSigning(205_000_000, 6_000_000, C);
    expect(t.legal).toBe(true);
    expect(t.mechanism?.id).toBe("tpmle");
    expect(t.hardCap).toBe("second_apron");
    // Minnesota, Sep 3 2026: $209.0M, under the first apron by $15K, signs
    // Kuminga for $6,064,000 — the Non-Tax MLE would breach its own hard cap,
    // the Taxpayer MLE lands the team over the first apron as required.
    const k = validateSigning(209_000_000, 6_064_000, C);
    expect(k.legal).toBe(true);
    expect(k.mechanism?.id).toBe("tpmle");
    // A Taxpayer MLE deal that would NOT clear the first apron is not allowed;
    // that team has the Non-Tax MLE instead.
    expect(validateSigning(195_000_000, 6_000_000, C).mechanism?.id).toBe("ntmle");
  });

  it("first-apron team is limited to the Taxpayer MLE", () => {
    expect(validateSigning(212_000_000, 5_000_000, C).mechanism?.id).toBe("tpmle");
    expect(validateSigning(212_000_000, 9_000_000, C).legal).toBe(false);
  });

  it("second-apron team can only sign minimums", () => {
    expect(validateSigning(225_000_000, 3_000_000, C).mechanism?.id).toBe("minimum");
    expect(validateSigning(225_000_000, 8_000_000, C).legal).toBe(false);
  });

  it("own free agent can be re-signed over the cap via Bird rights", () => {
    const v = validateSigning(212_000_000, 40_000_000, C, { isOwnFreeAgent: true });
    expect(v.legal).toBe(true);
    expect(v.mechanism?.id).toBe("bird");
  });

  it("each mechanism carries its CBA max contract length", () => {
    const seasons = (teamSalary: number, ask: number, opts = {}) =>
      validateSigning(teamSalary, ask, C, opts).mechanism?.maxSeasons;
    expect(seasons(225_000_000, 2_000_000)).toBe(2); // 2A team → minimum, 2yr max
    expect(seasons(212_000_000, 5_000_000)).toBe(2); // first-apron → Taxpayer MLE, 2yr (§6(f)(1))
    expect(seasons(190_000_000, 12_000_000)).toBe(4); // over-cap → Non-Tax MLE, 4yr
    expect(seasons(212_000_000, 40_000_000, { isOwnFreeAgent: true })).toBe(5); // Bird, 5yr
  });
});

describe("minimum exception is player-specific (not everyone gets the 10+ figure)", () => {
  // Second-apron team: the minimum is the only outside tool, so the minimum
  // ceiling is what decides legality here.
  const OVER_2A = 240_000_000;

  it("an 8-YOS outside FA cannot sign for the 10+ minimum", () => {
    const v = validateSigning(OVER_2A, C.minimumSalaries[10]!, C, {
      yearsOfService: 8,
      apronSalary: OVER_2A,
    });
    expect(v.legal).toBe(false);
  });

  it("the same 8-YOS FA signs at HIS minimum", () => {
    const v = validateSigning(OVER_2A, C.minimumSalaries[8]!, C, {
      yearsOfService: 8,
      apronSalary: OVER_2A,
    });
    expect(v.legal).toBe(true);
    expect(v.mechanism?.id).toBe("minimum");
  });

  it("a 10+ YOS FA still gets the top figure", () => {
    const v = validateSigning(OVER_2A, C.minimumSalaries[10]!, C, {
      yearsOfService: 14,
      apronSalary: OVER_2A,
    });
    expect(v.legal).toBe(true);
    expect(v.mechanism?.id).toBe("minimum");
  });
});
