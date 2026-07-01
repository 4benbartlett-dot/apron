import { describe, it, expect } from "vitest";
import { classifyTier, capSheet, teamSalary } from "../src/derive";
import { SEASON_2025_26 as C } from "../src/constants/2025-26";
import { contract, filler, league } from "./_fixtures";

describe("apron tier classification against 2025-26 official lines", () => {
  it("below the cap", () => expect(classifyTier(150_000_000, C)).toBe("below_cap"));
  it("over the cap, below the tax", () =>
    expect(classifyTier(160_000_000, C)).toBe("over_cap"));
  it("taxpayer (over tax, below first apron)", () =>
    expect(classifyTier(190_000_000, C)).toBe("taxpayer"));
  it("over the first apron", () =>
    expect(classifyTier(200_000_000, C)).toBe("first_apron"));
  it("over the second apron", () =>
    expect(classifyTier(210_000_000, C)).toBe("second_apron"));

  // The 2023 CBA restricts a team only when its salary *exceeds* a line, so a
  // team exactly at the second apron is NOT a second-apron team.
  it("exactly on the second-apron line is first apron, not second", () =>
    expect(classifyTier(C.secondApron, C)).toBe("first_apron"));
  it("exactly on the first-apron line is a taxpayer, not first apron", () =>
    expect(classifyTier(C.firstApron, C)).toBe("taxpayer"));
  it("exactly on the tax line is over_cap, not a taxpayer", () =>
    expect(classifyTier(C.luxuryTaxLine, C)).toBe("over_cap"));
  it("just over the second-apron line counts as second apron", () =>
    expect(classifyTier(C.secondApron + 1, C)).toBe("second_apron"));
  it("exactly on the cap counts as over the cap", () =>
    expect(classifyTier(C.salaryCap, C)).toBe("over_cap"));
});

describe("derived cap sheet", () => {
  const data = league([
    filler("BOS", 200_000_000),
    contract("star", "BOS", 10_000_000),
  ]);

  it("sums team salary from contracts", () => {
    expect(teamSalary(data, "BOS", "2025-26")).toBe(210_000_000);
  });

  it("reports the right tier and distances to each line", () => {
    const sheet = capSheet(data, "BOS", C);
    expect(sheet.salary).toBe(210_000_000);
    expect(sheet.tier).toBe("second_apron");
    expect(sheet.isOverSecondApron).toBe(true);
    expect(sheet.spaceBelowSecondApron).toBe(C.secondApron - 210_000_000);
  });
});
