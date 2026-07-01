import { describe, it, expect } from "vitest";
import {
  poisonPillValues,
  arenasFirstYearMax,
  violatesStepien,
  validateOfferSheet,
  renegotiationAllowed,
  validateTrade,
} from "../src/index";
import { SEASON_2025_26 as C } from "../src/constants/2025-26";
import { contract, filler, league } from "./_fixtures";
import type { Trade } from "../src/types";

describe("poison-pill provision", () => {
  it("sending team uses current salary; acquiring team uses the average", () => {
    // Current $8M, then extension years $30M/$32M/$34M/$36M.
    const r = poisonPillValues(8_000_000, [30_000_000, 32_000_000, 34_000_000, 36_000_000]);
    expect(r.sendingValue).toBe(8_000_000);
    expect(r.acquiringValue).toBe((8 + 30 + 32 + 34 + 36) * 1_000_000 / 5); // $28M
  });
});

describe("Gilbert Arenas provision", () => {
  it("caps a 1-2 YOS RFA offer sheet's first year at the Non-Taxpayer MLE", () => {
    expect(arenasFirstYearMax(C)).toBe(C.nonTaxpayerMLE);
  });
});

describe("RFA offer sheet (Gilbert Arenas cap)", () => {
  it("caps a 1-2 YOS RFA offer at the Non-Taxpayer MLE", () => {
    const v = validateOfferSheet(C.nonTaxpayerMLE + 5_000_000, 2, C);
    expect(v.isArenas).toBe(true);
    expect(v.legal).toBe(false);
    expect(v.maxFirstYear).toBe(C.nonTaxpayerMLE);
  });
  it("lets a 3+ YOS RFA be offered up to the tier max", () => {
    const v = validateOfferSheet(C.maxSalary["0-6"], 4, C);
    expect(v.isArenas).toBe(false);
    expect(v.legal).toBe(true);
  });
});

describe("renegotiation blackout window", () => {
  it("is barred March–June and allowed otherwise", () => {
    expect(renegotiationAllowed(4)).toBe(false); // April
    expect(renegotiationAllowed(7)).toBe(true); // July
    expect(renegotiationAllowed(1)).toBe(true); // January
  });
});

describe("Ted Stepien rule", () => {
  it("legal to trade firsts in alternating years", () => {
    expect(violatesStepien([2027, 2029, 2031])).toBe(false);
  });
  it("illegal to be without a first in consecutive years", () => {
    expect(violatesStepien([2027, 2028])).toBe(true);
  });
});

describe("trade kicker in salary matching", () => {
  it("boosts the acquiring team's incoming value by the kicker %", () => {
    const kicked = contract("k", "AAA", 20_000_000);
    kicked.tradeKickerPct = 0.15; // +15% -> $23M incoming for the acquirer
    const data = league([
      filler("AAA", 150_000_000),
      kicked,
      filler("BBB", 150_000_000),
      contract("b1", "BBB", 23_000_000),
    ]);
    const trade: Trade = {
      teams: ["AAA", "BBB"],
      players: [
        { playerId: "k", from: "AAA", to: "BBB" },
        { playerId: "b1", from: "BBB", to: "AAA" },
      ],
    };
    const bbb = validateTrade(data, trade, C).teams.find((t) => t.teamId === "BBB")!;
    expect(bbb.incomingSalary).toBe(23_000_000); // $20M × 1.15
  });
});
