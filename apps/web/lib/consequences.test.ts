import { describe, it, expect } from "vitest";
import { tradeConsequences } from "@/components/TradeDocket";
import { C } from "@/lib/league";
import type { TeamTradeSummary } from "@apron/cba-engine";

// Every move surfaces its durable cap/rule implications, even when it's legal:
// a heads-up so you see what you're committing a team to.

const team = (over: Partial<TeamTradeSummary>): TeamTradeSummary =>
  ({
    teamId: "DEN",
    preTradeSalary: 180_000_000,
    postTradeSalary: 190_000_000,
    preTradeTier: "over_cap",
    postTradeTier: "over_cap",
    incomingSalary: 0,
    outgoingSalary: 0,
    maxIncomingAllowed: 0,
    matchingRule: "expanded",
    ...over,
  }) as TeamTradeSummary;

describe("tradeConsequences", () => {
  it("flags a new first-apron hard cap from expanded matching", () => {
    // Takes back far more than 125% + $250k of outgoing, from below the aprons.
    const items = tradeConsequences(
      [team({ incomingSalary: 30_000_000, outgoingSalary: 10_000_000, preTradeSalary: 200_000_000 })],
      undefined,
      () => 0,
    );
    const cap = items.find((i) => i.severity === "cap");
    expect(cap?.text).toContain("hard-capped at the first apron");
    expect(cap?.text).toContain("expanded matching");
  });

  it("flags a first-apron hard cap from spending a row-F (Regular-Season) TPE", () => {
    const items = tradeConsequences(
      [team({ incomingSalary: 8_000_000, outgoingSalary: 0, tpeAbsorbed: 8_000_000 })],
      { DEN: { amount: 8_000_000, preExisting: true, firstApronCap: true } },
      () => 0,
    );
    expect(items.some((i) => i.severity === "cap" && /Regular-Season-arisen traded-player exception/.test(i.text))).toBe(true);
  });

  it("does NOT flag a hard cap when the TPE arose this offseason (row F(ii))", () => {
    const items = tradeConsequences(
      [team({ incomingSalary: 8_000_000, outgoingSalary: 0, tpeAbsorbed: 8_000_000 })],
      { DEN: { amount: 8_000_000, preExisting: true, firstApronCap: false } },
      () => 0,
    );
    expect(items.some((i) => i.severity === "cap")).toBe(false);
  });

  it("names the second-apron restrictions when a team finishes there", () => {
    const items = tradeConsequences(
      [team({ incomingSalary: 20_000_000, outgoingSalary: 20_000_000, postTradeTier: "second_apron" })],
      undefined,
      () => 0,
    );
    expect(items.some((i) => i.severity === "restrict" && /second apron/.test(i.text) && /aggregate/.test(i.text))).toBe(true);
  });

  it("always notes the 2-month aggregation freeze on incoming players", () => {
    const items = tradeConsequences(
      [team({ incomingSalary: 12_000_000, outgoingSalary: 12_000_000 })],
      undefined,
      () => 0,
    );
    expect(items.some((i) => /aggregated in another trade for ~2 months/.test(i.text))).toBe(true);
  });

  it("a plain in-cap-room absorption triggers no hard cap", () => {
    // Below-cap team absorbing into real room: matchable within absorption.
    const items = tradeConsequences(
      [team({ preTradeTier: "below_cap", preTradeSalary: 150_000_000, incomingSalary: 10_000_000, outgoingSalary: 0 })],
      undefined,
      () => 0,
    );
    expect(items.some((i) => i.severity === "cap")).toBe(false);
    void C;
  });
});
