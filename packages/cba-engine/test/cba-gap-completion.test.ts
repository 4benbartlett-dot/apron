import { describe, expect, it } from "vitest";
import {
  apronTeamSalary,
  capSheet,
  designatedVeteranMaxPct,
  meetsHigherMaxCriteria,
  validateSecondRoundPickException,
  validateTrade,
  validateTwoWayContract,
} from "../src";
import { SEASON_2025_26 as C25 } from "../src/constants/2025-26";
import { SEASON_2026_27 as C26 } from "../src/constants/2026-27";
import { contract, filler, league } from "./_fixtures";
import type { Contract, Trade } from "../src";

describe("Art. VII §2(e) Apron Team Salary", () => {
  it("adds excluded performance bonuses and the 0/1-YOS free-agent minimum addback", () => {
    const rookieFa: Contract = {
      ...contract("rookie-fa", "AAA", 1_000_000, "2026-27"),
      yearsOfService: 0,
      signedAsFreeAgent: true,
      years: [
        {
          leagueYear: "2026-27",
          salary: 1_000_000,
          guarantee: "full",
          excludedPerformanceBonus: 400_000,
        },
      ],
    };
    const data = league([filler("AAA", 100_000_000, "2026-27"), rookieFa], "2026-27");
    const expected =
      100_000_000 +
      1_000_000 +
      400_000 +
      ((C26.minimumSalaries[2] ?? 0) - 1_000_000);

    expect(apronTeamSalary(data, "AAA", C26)).toBe(expected);
    expect(capSheet(data, "AAA", C26).apronSalary).toBe(expected);
  });

  it("applies team-level §2(e) inclusions and exclusions explicitly", () => {
    const data = league([filler("AAA", 100_000_000, "2026-27")], "2026-27");
    expect(
      apronTeamSalary(data, "AAA", C26, {
        freeAgentAmounts: 20_000_000,
        requiredTenderAmounts: 3_000_000,
        incompleteRosterCharges: 2_000_000,
        section4lExcludedAmounts: 4_000_000,
      }),
    ).toBe(85_000_000);
  });
});

describe("trade matching edge cases wired to salary values", () => {
  it("BYC uses reduced matching value but removes the full cap salary from the sender", () => {
    const byc: Contract = { ...contract("byc", "AAA", 30_000_000), bycPriorSalary: 10_000_000 };
    const data = league([
      filler("AAA", 170_000_000),
      byc,
      filler("BBB", 150_000_000),
      contract("incoming", "BBB", 20_000_000),
    ]);
    const v = validateTrade(
      data,
      {
        teams: ["AAA", "BBB"],
        players: [
          { playerId: "byc", from: "AAA", to: "BBB" },
          { playerId: "incoming", from: "BBB", to: "AAA" },
        ],
      },
      C25,
    );
    const aaa = v.teams.find((t) => t.teamId === "AAA")!;
    expect(aaa.outgoingSalary).toBe(15_000_000);
    expect(aaa.outgoingCapSalary).toBe(30_000_000);
    expect(aaa.postTradeSalary).toBe(190_000_000);
  });

  it("poison-pill incoming value is the average of current plus extension salaries", () => {
    const poison: Contract = {
      ...contract("poison", "BBB", 8_000_000),
      poisonPillExtensionSalaries: [30_000_000, 32_000_000, 34_000_000, 36_000_000],
    };
    const data = league([
      filler("AAA", 150_000_000),
      contract("out", "AAA", 30_000_000),
      filler("BBB", 120_000_000),
      poison,
    ]);
    const v = validateTrade(
      data,
      {
        teams: ["AAA", "BBB"],
        players: [
          { playerId: "out", from: "AAA", to: "BBB" },
          { playerId: "poison", from: "BBB", to: "AAA" },
        ],
      },
      C25,
    );
    const aaa = v.teams.find((t) => t.teamId === "AAA")!;
    expect(aaa.incomingSalary).toBe(28_000_000);
    expect(aaa.incomingCapSalary).toBe(8_000_000);
    expect(v.checks.some((x) => x.ruleId === "poison_pill_incoming_value" && x.ok)).toBe(true);
  });

  it("removes the $250k matching allowance when post-trade apron salary exceeds the first apron", () => {
    const data = league([
      filler("AAA", 186_000_000),
      contract("out", "AAA", 5_000_000),
      filler("BBB", 130_000_000),
      contract("in", "BBB", 10_200_000),
    ]);
    const v = validateTrade(
      data,
      {
        teams: ["AAA", "BBB"],
        players: [
          { playerId: "out", from: "AAA", to: "BBB" },
          { playerId: "in", from: "BBB", to: "AAA" },
        ],
      },
      C25,
    );
    expect(v.teams.find((t) => t.teamId === "AAA")!.maxIncomingAllowed).toBe(10_000_000);
    expect(v.violations.some((x) => x.ruleId === "salary_matching")).toBe(true);
  });
});

describe("transaction-restriction hard-cap consequences", () => {
  it("row H: aggregating down through the second apron is legal but hard-caps at 2A", () => {
    const data = league(
      [
        contract("a1", "AAA", 12_000_000, "2026-27"),
        contract("a2", "AAA", 12_000_000, "2026-27"),
        contract("a3", "AAA", 199_000_000, "2026-27"),
        contract("b1", "BBB", 20_000_000, "2026-27"),
        contract("b2", "BBB", 160_000_000, "2026-27"),
      ],
      "2026-27",
    );
    const v = validateTrade(
      data,
      {
        teams: ["AAA", "BBB"],
        players: [
          { playerId: "a1", from: "AAA", to: "BBB" },
          { playerId: "a2", from: "AAA", to: "BBB" },
          { playerId: "b1", from: "BBB", to: "AAA" },
        ],
      },
      C26,
    );
    expect(v.legal).toBe(true);
    expect(v.checks.some((x) => x.ruleId === "hard_cap_second_apron_aggregation" && x.ok)).toBe(true);
  });

  it("does NOT aggregate a below-apron 2-for-2 that each fit a single Standard TPE (+$250k)", () => {
    // AAA (over cap, below the first apron) sends two $10M players and takes
    // back $10.2M + $9.8M. Each incoming fits its matched outgoing player's own
    // Standard TPE ($10.25M ceiling), so NO aggregation — no second-apron cap.
    const data = league([
      filler("AAA", 150_000_000),
      contract("a1", "AAA", 10_000_000),
      contract("a2", "AAA", 10_000_000),
      contract("b1", "BBB", 10_200_000),
      contract("b2", "BBB", 9_800_000),
    ]);
    const v = validateTrade(
      data,
      {
        teams: ["AAA", "BBB"],
        players: [
          { playerId: "a1", from: "AAA", to: "BBB" },
          { playerId: "a2", from: "AAA", to: "BBB" },
          { playerId: "b1", from: "BBB", to: "AAA" },
          { playerId: "b2", from: "BBB", to: "AAA" },
        ],
      },
      C26,
    );
    expect(v.legal).toBe(true);
    expect(v.checks.some((x) => x.ruleId === "hard_cap_second_apron_aggregation")).toBe(false);
  });

  it("row I: sending cash while ending below 2A is legal but hard-caps at 2A", () => {
    const data = league([
      filler("AAA", 200_000_000),
      contract("out", "AAA", 10_000_000),
      filler("BBB", 130_000_000),
      contract("in", "BBB", 7_000_000),
    ]);
    const v = validateTrade(
      data,
      {
        teams: ["AAA", "BBB"],
        players: [
          { playerId: "out", from: "AAA", to: "BBB" },
          { playerId: "in", from: "BBB", to: "AAA" },
        ],
        cash: [{ from: "AAA", to: "BBB", amount: 500_000 }],
      },
      C25,
    );
    expect(v.legal).toBe(true);
    expect(v.checks.some((x) => x.ruleId === "hard_cap_second_apron_cash" && x.ok)).toBe(true);
  });

  it("§6(j)(4)(ii): outside Dec. 15-deadline, three-for-one aggregation cannot include two minimum players", () => {
    const min0 = C25.minimumSalaries[0]!;
    const min1 = C25.minimumSalaries[1]!;
    const a1: Contract = { ...contract("min0", "AAA", min0), yearsOfService: 0, minimumSalary: true };
    const a2: Contract = { ...contract("min1", "AAA", min1), yearsOfService: 1, minimumSalary: true };
    const data = league([
      filler("AAA", 150_000_000),
      a1,
      a2,
      contract("mid", "AAA", 10_000_000),
      filler("BBB", 130_000_000),
      contract("target", "BBB", 12_000_000),
    ]);
    const trade: Trade = {
      teams: ["AAA", "BBB"],
      players: [
        { playerId: "min0", from: "AAA", to: "BBB" },
        { playerId: "min1", from: "AAA", to: "BBB" },
        { playerId: "mid", from: "AAA", to: "BBB" },
        { playerId: "target", from: "BBB", to: "AAA" },
      ],
    };
    const v = validateTrade(data, trade, C25);
    expect(v.violations.some((x) => x.ruleId === "minimum_traded_player_aggregation")).toBe(true);
    expect(validateTrade(data, { ...trade, timing: "dec15_to_deadline" }, C25).violations.some((x) => x.ruleId === "minimum_traded_player_aggregation")).toBe(false);
  });
});

describe("new callable rule helpers", () => {
  it("validates second-round-pick exception structures", () => {
    const ok = validateSecondRoundPickException(
      {
        guaranteedSeasons: 3,
        hasTeamOption: true,
        firstYearSalaryPlusUnlikelyBonuses: C26.minimumSalaries[2]!,
        secondYearSalaryPlusUnlikelyBonuses: C26.minimumSalaries[2]!,
      },
      C26,
    );
    expect(ok.legal).toBe(true);
    expect(validateSecondRoundPickException({ ...ok, guaranteedSeasons: 2, hasTeamOption: false, firstYearSalaryPlusUnlikelyBonuses: 1, secondYearSalaryPlusUnlikelyBonuses: 1 }, C26).legal).toBe(false);
  });

  it("validates core two-way limits", () => {
    expect(validateTwoWayContract({ yearsOfService: 2, seasons: 1, currentTeamTwoWays: 2 }, C26).legal).toBe(true);
    expect(validateTwoWayContract({ yearsOfService: 4, seasons: 1, currentTeamTwoWays: 0 }, C26).legal).toBe(false);
    expect(validateTwoWayContract({ yearsOfService: 3, seasons: 2, currentTeamTwoWays: 0 }, C26).legal).toBe(false);
  });

  it("models Higher Max / designated veteran gates from honors and service", () => {
    const met = meetsHigherMaxCriteria({ mostRecentSeason: 2026, allNbaSeasons: [2026] });
    expect(met).toBe(true);
    expect(designatedVeteranMaxPct({ yearsOfService: 8, remainedWithOriginalTeamThroughFirstFourYears: true, higherMaxCriteriaMet: met })).toBe(0.35);
    expect(designatedVeteranMaxPct({ yearsOfService: 8, remainedWithOriginalTeamThroughFirstFourYears: false, higherMaxCriteriaMet: met })).toBe(0.3);
  });
});
