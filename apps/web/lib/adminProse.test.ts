import { describe, it, expect } from "vitest";
import { tradeRows, signingRow, waiveRow, optionRow, statedSalaryRow, feedDate, millions } from "@/lib/admin/prose";
import { applyPickTransfer, tradeablePicks } from "@/lib/admin/picks";
import { parseLegs, tradeGroups } from "@/lib/newsDay";
import { ruleTrade, ruleSigning, ruleWaive } from "@/lib/admin/rule";
import { BASE_CONTRACTS, dealFromAav, freeAgentsOf, rosterOf } from "@/lib/league";
import { PICK_RIGHTS, validateTransactionRow, type TeamPickRights } from "@apron/data";

// ---------------------------------------------------------------------------
// THE DESK WRITES PROSE. A filed move is a feed-shaped row, and the whole
// pipeline (applyTrades, applySignings, applyReleases, the stated passes, the
// news card's leg parser) reads it with the same regexes it reads Spotrac
// with. So every builder round-trips through those parsers here; a filed
// move that the sheet would not book is the failure this file exists for.
// ---------------------------------------------------------------------------

const city = (c: string) => ({ BOS: "Boston", LAL: "Los Angeles", MIA: "Miami", PHI: "Philadelphia" })[c] ?? c;

describe("trade rows", () => {
  const rows = tradeRows(
    {
      date: "2026-09-03",
      players: [
        { playerId: "a", name: "Jaylen Brown", pos: "SG", from: "BOS", to: "LAL" },
        { playerId: "b", name: "Austin Reaves", pos: "SG", from: "LAL", to: "BOS" },
      ],
      picks: [{ id: "LAL|2028|1", from: "LAL", to: "BOS", protection: "top-4 protected" }],
      cash: [{ from: "LAL", to: "BOS", amount: 1_500_000 }],
      why: "test",
    },
    city,
  );

  it("one row per player, each carrying the whole clause ledger", () => {
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(validateTransactionRow(r, "r")).toEqual([]);
      expect(r.date).toBe("Sep 03, 2026");
      expect(r.detail).toMatch(/^Traded to .+ \([A-Z]{3}\) from .+ \([A-Z]{3}\) as part of a 2-team trade: /);
    }
    expect(rows[0]!.detail).toContain("Traded to Los Angeles (LAL) from Boston (BOS)");
  });

  it("the news card's leg parser recovers every leg, picks and cash included", () => {
    const legs = parseLegs(rows[0]!.detail);
    expect(legs.filter((l) => l.kind === "player").map((l) => `${l.from}>${l.to}:${l.asset}`).sort()).toEqual(["BOS>LAL:Jaylen Brown", "LAL>BOS:Austin Reaves"]);
    const pick = legs.find((l) => l.kind === "pick")!;
    expect(pick.from).toBe("LAL");
    expect(pick.asset).toMatch(/2028 1st round pick \[top-4 protected\]/);
    const cash = legs.find((l) => l.kind === "cash")!;
    expect(Number(cash.asset.replace(/[^\d]/g, ""))).toBe(1_500_000);
  });

  it("applyTrades' regexes see the destination; tradeGroups files both rows as one deal", () => {
    for (const r of rows) {
      expect(r.detail.match(/Traded to [^(]*\(([A-Za-z]{2,4})\)/)![1]).toBe(r.player === "Jaylen Brown" ? "LAL" : "BOS");
      expect(r.detail.match(/from [^(]*\(([A-Za-z]{2,4})\)/)![1]).toBe(r.player === "Jaylen Brown" ? "BOS" : "LAL");
    }
    expect(tradeGroups(rows).size).toBe(1);
  });
});

describe("signing, waive, option and stated-salary rows", () => {
  it("a signing row is what applySignings books from: term, total, team", () => {
    const r = signingRow({ date: "2026-09-03", player: { name: "Test Player", pos: "G" }, team: "PHI", years: 2, total: 16_400_000, mechanism: "ntmle", option: "2027-28 Player Option", why: "t" }, city);
    expect(r.type).toBe("Signing");
    expect(r.detail).toBe("Signed a 2 year $16.4 million contract with Philadelphia (PHI) via Non-Taxpayer Mid-Level Exception - includes 2027-28 Player Option");
    expect(/\d+\s*year|\$[\d.]+\s*million/i.test(r.detail)).toBe(true);
    expect(r.detail.match(/with\s+[A-Za-z0-9 .'&-]+\(([A-Za-z]{2,4})\)/)![1]).toBe("PHI");
    expect(/Exhibit 10/i.test(r.detail)).toBe(false);
    // The pipeline back-solves year one from total / years at the raise rate;
    // 16.4M over 2 years at 5% is 8,000,000 in year one.
    expect(dealFromAav(16_400_000 / 2, 2, 0.05)[0]!.salary).toBe(8_000_000);
  });

  it("a waive row states the guaranteed remainder the release pass reads", () => {
    const r = waiveRow({ date: "2026-09-03", player: { name: "Test Player", pos: "F" }, team: "MIA", guaranteed: 7_660_317, stretch: true, why: "t" }, city);
    expect(r.type).toBe("Release");
    expect(r.detail).toBe("Waived by Miami (MIA) via Stretch Provision - leaves behind $7.660317 million in dead cap");
    const m = r.detail.match(/leaves behind \$([\d.]+)\s*million in dead cap/i)!;
    expect(Math.round(Number(m[1]) * 1_000_000)).toBe(7_660_317);
    expect(/via Stretch Provision/i.test(r.detail)).toBe(true);
    expect(r.detail.match(/(?:Waived|Released) by [^(]*\(([A-Za-z]{2,4})\)/i)![1]).toBe("MIA");
  });

  it("a declined option row is what OPTION_DECLINED keys on", () => {
    const r = optionRow({ date: "2026-09-03", player: { name: "Test Player", pos: "C" }, team: "BOS", season: "2026-27", kind: "player", decision: "declined", why: "t" }, city);
    expect(r.type).toBe("Option");
    expect(/declined/i.test(r.detail) && /2026-27/.test(r.detail)).toBe(true);
  });

  it("a stated-salary row matches the STATED_SALARY regex to the dollar", () => {
    const r = statedSalaryRow({ date: "2026-09-03", player: { name: "Test Player", pos: "C" }, team: "BOS", salary: 5_602_689, why: "t" }, city);
    const m = r.detail.match(/fully guaranteed \$([\d.]+)\s*(million|k)\b[^.]*for 2026-27/i)!;
    expect(Math.round(Number(m[1]) * 1_000_000)).toBe(5_602_689);
  });

  it("dates and millions print the feed's way", () => {
    expect(feedDate("2026-07-06")).toBe("Jul 06, 2026");
    expect(millions(16_000_000)).toBe("16");
    expect(millions(12_431_200)).toBe("12.4312");
  });
});

describe("pick transfers in the rights ledger", () => {
  const byTeam: Record<string, TeamPickRights> = {
    BOS: { ownFirstObligations: [], holdings: [] },
    LAL: { ownFirstObligations: [], holdings: [{ year: 2029, round: 1, kind: "outright", origin: "MIA", note: "Miami's 2029 first", source: "t" }] },
    MIA: { ownFirstObligations: [{ year: 2029, status: "owed", to: "LAL", note: "own 2029 to LAL", source: "t" }], holdings: [] },
    LAC: { ownFirstObligations: [{ year: 2030, status: "forfeited", note: "gone", source: "t" }], holdings: [] },
  };

  it("an own first leaves as an obligation and arrives as a holding", () => {
    const out = applyPickTransfer(byTeam, { id: "BOS|2028|1", from: "BOS", to: "LAL", protection: "1-4", note: "n", source: "s" });
    expect(out.BOS!.ownFirstObligations).toEqual([{ year: 2028, status: "protected", to: "LAL", protection: "1-4", note: "n", source: "s" }]);
    expect(out.LAL!.holdings.find((h) => h.origin === "BOS" && h.year === 2028)?.protection).toBe("1-4");
    // The input is untouched.
    expect(byTeam.BOS!.ownFirstObligations).toEqual([]);
  });

  it("an acquired pick re-traded changes holder, and the origin's obligation follows it", () => {
    const out = applyPickTransfer(byTeam, { id: "MIA|2029|1", from: "LAL", to: "BOS", note: "n", source: "s" });
    expect(out.LAL!.holdings).toEqual([]);
    expect(out.BOS!.holdings[0]).toMatchObject({ origin: "MIA", year: 2029, round: 1, kind: "outright" });
    expect(out.MIA!.ownFirstObligations[0]!.to).toBe("BOS");
  });

  it("refuses a pick the sender does not have, and a forfeited first", () => {
    expect(() => applyPickTransfer(byTeam, { id: "MIA|2029|1", from: "BOS", to: "LAL", note: "n", source: "s" })).toThrow(/does not hold/);
    expect(() => applyPickTransfer(byTeam, { id: "LAC|2030|1", from: "LAC", to: "BOS", note: "n", source: "s" })).toThrow(/forfeited/);
    expect(() => applyPickTransfer(byTeam, { id: "MIA|2029|1", from: "MIA", to: "BOS", note: "n", source: "s" })).toThrow(/already owed/);
  });

  it("the Clippers can trade Toronto's firsts and their own seconds today, not their forfeited firsts", () => {
    const ids = tradeablePicks(PICK_RIGHTS, "LAC", [2027, 2028, 2029, 2030, 2031, 2032]).map((p) => p.id);
    expect(ids).toContain("TOR|2031|1");
    expect(ids).toContain("LAC|2031|2");
    expect(ids).not.toContain("LAC|2030|1");
    expect(ids).not.toContain("LAC|2028|1"); // owed to PHI
    expect(ids).not.toContain("IND|2029|1"); // forfeited
  });
});

describe("the desk's rulings run the same engine as the board", () => {
  it("a lopsided trade into a capped team is blocked, and the docket balances", () => {
    const bos = rosterOf(BASE_CONTRACTS, "BOS");
    const lal = rosterOf(BASE_CONTRACTS, "LAL");
    const r = ruleTrade({ players: [{ playerId: bos[0]!.playerId, from: "BOS", to: "LAL" }, { playerId: lal[lal.length - 1]!.playerId, from: "LAL", to: "BOS" }], picks: [], cash: [] })!;
    expect(r.teams).toEqual(["BOS", "LAL"]);
    expect(r.docket.flatMap((d) => d.gets.filter((l) => !l.pick).map((l) => l.label)).sort()).toEqual(r.docket.flatMap((d) => d.sends.filter((l) => !l.pick).map((l) => l.label)).sort());
    expect(r.checks.length).toBeGreaterThan(0);
    expect(r.legal).toBe(r.checks.every((c) => c.ok));
  });

  it("a minimum signing is legal for anyone, and the booking preview says what the sheet will carry", () => {
    const fa = freeAgentsOf(BASE_CONTRACTS).find((f) => f.yearsOfService >= 3)!;
    const r = ruleSigning({ playerId: fa.playerId, playerName: fa.playerName, team: "CHA", y1: 2_449_421, years: 1 });
    expect(r.legal).toBe(true);
    expect(r.booking.years).toHaveLength(1);
    expect(r.available.some((m) => m.id === "minimum")).toBe(true);
  });

  it("a waive ruling matches the board's computeWaive", () => {
    const c = rosterOf(BASE_CONTRACTS, "BOS")[0]!;
    const r = ruleWaive(c.playerId)!;
    expect(r.guaranteedTotal).toBeGreaterThan(0);
    expect(r.stretch.years).toBe(2 * c.years.filter((y) => y.leagueYear >= "2026-27").length + 1);
  });
});
