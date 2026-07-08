import { describe, it, expect } from "vitest";
import {
  secondApronDraftPickStatus,
  validateRegularSeasonWaiverSigning,
  validateTrade,
  validateSignAndTrade,
} from "../src/index";
import { SEASON_2025_26 as C } from "../src/constants/2025-26";
import { contract, filler, league } from "./_fixtures";
import type { Trade } from "../src/types";

describe("base-year compensation reduces the sending team's outgoing value", () => {
  it("BYC outgoing value = max(50% of current salary, prior salary)", () => {
    const byc = contract("byc", "AAA", 30_000_000); // current 30M
    byc.bycPriorSalary = 10_000_000; // -> outgoing value = max(15M, 10M) = 15M
    const data = league([
      filler("AAA", 150_000_000),
      byc,
      filler("BBB", 150_000_000),
      contract("b1", "BBB", 15_000_000),
    ]);
    const trade: Trade = {
      teams: ["AAA", "BBB"],
      players: [
        { playerId: "byc", from: "AAA", to: "BBB" },
        { playerId: "b1", from: "BBB", to: "AAA" },
      ],
    };
    const aaa = validateTrade(data, trade, C).teams.find((t) => t.teamId === "AAA")!;
    expect(aaa.outgoingSalary).toBe(15_000_000); // BYC value, not $30M
  });
});

describe("sign-and-trade acquisition", () => {
  it("LEGAL below the first apron; hard-capped at the first apron", () => {
    const v = validateSignAndTrade(180_000_000, 10_000_000, C, { seasons: 3 }); // post $190M < 1A $195.945M
    expect(v.legal).toBe(true);
    expect(v.hardCap).toBe("first_apron");
  });
  it("ILLEGAL if it would push the acquirer over the first apron", () => {
    expect(validateSignAndTrade(190_000_000, 10_000_000, C).legal).toBe(false);
  });
  it("ILLEGAL for a team over the second apron", () => {
    const v = validateSignAndTrade(210_000_000, 5_000_000, C);
    expect(v.legal).toBe(false);
    expect(v.reason).toMatch(/second apron/i);
  });
  it("ILLEGAL if the new S&T contract is shorter than 3 non-option seasons or longer than 4 total seasons", () => {
    expect(validateSignAndTrade(160_000_000, 10_000_000, C, { seasons: 2 }).legal).toBe(false);
    expect(validateSignAndTrade(160_000_000, 10_000_000, C, { seasons: 3, optionYears: 1 }).legal).toBe(false);
    expect(validateSignAndTrade(160_000_000, 10_000_000, C, { seasons: 5 }).legal).toBe(false);
    expect(validateSignAndTrade(160_000_000, 10_000_000, C, { seasons: 4 }).legal).toBe(true);
  });
  it("ILLEGAL for barred S&T structures: NT-MLE/Room-MLE, unprotected first year, post-opening-night, or wrong prior roster", () => {
    const base = { seasons: 3 };
    expect(validateSignAndTrade(160_000_000, 10_000_000, C, { ...base, signedUsing: "non_taxpayer_mle" }).legal).toBe(false);
    expect(validateSignAndTrade(160_000_000, 10_000_000, C, { ...base, signedUsing: "room_mle" }).legal).toBe(false);
    expect(validateSignAndTrade(160_000_000, 10_000_000, C, { ...base, firstSeasonFullyProtected: false }).legal).toBe(false);
    expect(validateSignAndTrade(160_000_000, 10_000_000, C, { ...base, beforeRegularSeason: false }).legal).toBe(false);
    expect(validateSignAndTrade(160_000_000, 10_000_000, C, { ...base, finishedPriorSeasonWithPriorTeam: false }).legal).toBe(false);
  });
  it("caps 5th-Year/Higher-Max S&T salary plus unlikely bonuses at 25% of the cap when that fact is supplied", () => {
    const max = C.salaryCap * 0.25;
    expect(validateSignAndTrade(140_000_000, max, C, { seasons: 3, fifthYearEligibleHigherMax: true }).legal).toBe(true);
    const v = validateSignAndTrade(140_000_000, max + 2, C, { seasons: 3, fifthYearEligibleHigherMax: true });
    expect(v.legal).toBe(false);
    expect(v.reason).toMatch(/25%/);
  });
  it("optionally enforces the acquiring team's strict room for salary plus unlikely bonuses", () => {
    const v = validateSignAndTrade(120_000_000, 18_000_000, C, {
      seasons: 3,
      firstYearUnlikelyBonuses: 2_000_000,
      roomAvailable: 19_000_000,
    });
    expect(v.legal).toBe(false);
    expect(v.reason).toMatch(/room/i);
  });
});

describe("regular-season waiver-market signing row D", () => {
  it("hard-caps a team at the first apron when the terminated contract was above the NT-MLE", () => {
    const v = validateRegularSeasonWaiverSigning(
      {
        teamApronSalaryBeforeSigning: 180_000_000,
        signingSalary: 2_000_000,
        terminatedContractSalary: C.nonTaxpayerMLE + 1_000_000,
        terminatedDuringRegularSeason: true,
      },
      C,
    );
    expect(v.legal).toBe(true);
    expect(v.hardCap).toBe("first_apron");
  });
  it("blocks that row-D signing if the team would finish above the first apron", () => {
    const v = validateRegularSeasonWaiverSigning(
      {
        teamApronSalaryBeforeSigning: C.firstApron - 1_000_000,
        signingSalary: 2_000_000,
        terminatedContractSalary: C.nonTaxpayerMLE + 1_000_000,
        terminatedDuringRegularSeason: true,
      },
      C,
    );
    expect(v.legal).toBe(false);
    expect(v.reason).toMatch(/first-apron transaction/);
  });
  it("does not trigger row D when the prior salary was at or below the NT-MLE", () => {
    const v = validateRegularSeasonWaiverSigning(
      {
        teamApronSalaryBeforeSigning: C.firstApron + 10_000_000,
        signingSalary: 2_000_000,
        terminatedContractSalary: C.nonTaxpayerMLE,
        terminatedDuringRegularSeason: true,
      },
      C,
    );
    expect(v.legal).toBe(true);
    expect(v.hardCap).toBeNull();
  });
});

describe("second-apron frozen pick and draft-pick penalty", () => {
  it("matches the CBA example: 2024-25 second-apron status freezes the 2032 first", () => {
    const status = secondApronDraftPickStatus({
      triggerSalaryCapYearStart: 2024,
      secondApronSalaryCapYearStarts: [2024],
      knownFollowUpSalaryCapYearStarts: [2025],
    });
    expect(status.frozenDraftYear).toBe(2032);
    expect(status.tradeProhibited).toBe(true);
    expect(status.draftPickPenalty).toBe(false);
  });
  it("penalizes the frozen pick after two repeat second-apron seasons in the four-year window", () => {
    const status = secondApronDraftPickStatus({
      triggerSalaryCapYearStart: 2024,
      secondApronSalaryCapYearStarts: [2024, 2025, 2028],
    });
    expect(status.frozenDraftYear).toBe(2032);
    expect(status.repeatSecondApronYears).toEqual([2025, 2028]);
    expect(status.draftPickPenalty).toBe(true);
    expect(status.tradeProhibited).toBe(true);
  });
  it("releases the frozen pick after the third known non-second-apron follow-up season", () => {
    const status = secondApronDraftPickStatus({
      triggerSalaryCapYearStart: 2024,
      secondApronSalaryCapYearStarts: [2024],
      knownFollowUpSalaryCapYearStarts: [2025, 2026, 2027],
    });
    expect(status.releasableAfterRegularSeasonSalaryCapYearStart).toBe(2027);
    expect(status.tradeProhibited).toBe(false);
  });
});
