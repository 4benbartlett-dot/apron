import { describe, it, expect } from "vitest";
import { validateTrade } from "@apron/cba-engine";
import { FROZEN_FIRSTS, frozenFirstOf, PICK_RIGHTS } from "@apron/data";
import { BASE_CONTRACTS, C, CALENDAR, SIM_DATE, aggregateFromFor, leagueData, rosterOf } from "@/lib/league";
import { PROVISIONS, PROVISION_GROUPS, provision, provisionForCheck } from "@/lib/provisions";
import { ruleExamples } from "@/lib/examples";
import { decodeTradeParam, encodeTradeParam } from "@/lib/trade-share";

// The site's claim is that a blocked move names the rule it breaks. The engine
// attached a citation to every check from the start; the verdict panel printed
// the reason and dropped the citation. These keep the index and the verdict
// tied together.
describe("the rules index", () => {
  it("has an anchor, a citation and a plain line for every provision, in a known group", () => {
    const ids = new Set<string>();
    for (const p of PROVISIONS) {
      expect(p.id, p.name).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(p.id), `duplicate id ${p.id}`).toBe(false);
      ids.add(p.id);
      expect(p.cite.length).toBeGreaterThan(5);
      expect(p.plain.length).toBeGreaterThan(40);
      expect(PROVISION_GROUPS).toContain(p.group);
      // Quoted text is the agreement's; the one entry without any is the league rule.
      if (!p.text) expect(p.id).toBe("stepien");
      // Straight quotation marks inside a quote would mean it was retyped.
      expect(p.text).not.toMatch(/"/);
    }
  });

  it("every rule the engine can block a trade with has a provision, or deliberately none", () => {
    const withProvision = [
      "salary_matching", "hard_cap_first_apron", "hard_cap_second_apron_aggregation", "second_apron_no_aggregation",
      "hard_cap_second_apron_cash", "second_apron_no_cash_out", "tpe_first_apron", "subsequent_year_first_apron",
      "subsequent_year_second_apron", "no_aggregate", "minimum_traded_player_aggregation", "poison_pill_incoming_value",
    ];
    for (const ruleId of withProvision) expect(provisionForCheck({ ruleId }), ruleId).toBeDefined();
    expect(provisionForCheck({ ruleId: "unknown_player" })).toBeUndefined();
  });

  it("reads which freeze it is off the citation, most specific first", () => {
    const of = (citation: string) => provisionForCheck({ ruleId: "trade_eligibility", citation })?.id;
    expect(of("2023 CBA Art. VII §8(d)(i)")).toBe("draft-pick-30-days");
    expect(of("2023 CBA Art. VII §8(d)(ii)")).toBe("free-agent-december-15");
    expect(of("2023 CBA Art. VII §8(d)(iii)")).toBe("re-sign-january-15");
    expect(of("2023 CBA Art. VII §8(f)(i)")).toBe("extension-six-months");
    expect(of("2023 CBA Art. XI §5(j)")).toBe("matched-offer-sheet");
    // The engine's catch-all names no one rule; saying nothing beats guessing.
    expect(of("2023 CBA Art. VII §8(d), §8(f) — recently signed players and certain extensions are trade-restricted.")).toBeUndefined();
  });

  it("a real blocked trade resolves to a provision with the agreement's words", () => {
    const top = rosterOf(BASE_CONTRACTS, "NYK").find((c) => !c.restriction)!;
    const low = rosterOf(BASE_CONTRACTS, "BOS").filter((c) => !c.restriction).at(-1)!;
    const v = validateTrade(
      leagueData(BASE_CONTRACTS),
      { teams: ["NYK", "BOS"], players: [{ playerId: top.playerId, from: "NYK", to: "BOS" }, { playerId: low.playerId, from: "BOS", to: "NYK" }], date: SIM_DATE },
      C,
    );
    expect(v.legal).toBe(false);
    const p = provisionForCheck(v.violations[0]!)!;
    expect(p.cite).toMatch(/^Art\. VII/);
    expect(p.text.length).toBeGreaterThan(20);
  });

  it("each example on the rules page is for a rule in the index and opens as a link", () => {
    for (const [id, ex] of ruleExamples()) {
      expect(provision(id), id).toBeDefined();
      const token = ex.href.replace("/?t=", "");
      expect(decodeTradeParam(token)?.players.length ?? 0).toBeGreaterThan(1);
    }
  });
});

// Art. VII §2(f): a season over the second apron freezes the first-round pick
// seven drafts out. The pick stays the team's; it just can't be traded.
describe("second-apron frozen picks", () => {
  it("2024-25 froze three 2032 firsts and 2025-26 one 2033 first", () => {
    const key = (f: (typeof FROZEN_FIRSTS)[number]) => `${f.team} ${f.year}`;
    expect(FROZEN_FIRSTS.map(key).sort()).toEqual(["BOS 2032", "CLE 2033", "MIN 2032", "PHX 2032"]);
    expect(frozenFirstOf("BOS", 2032)?.season).toBe("2024-25");
    expect(frozenFirstOf("BOS", 2031)).toBeUndefined();
  });

  it("shows on the team's own picks as frozen, not as owed", () => {
    for (const f of FROZEN_FIRSTS) {
      const own = PICK_RIGHTS[f.team]!.ownFirstObligations.filter((o) => o.year === f.year);
      expect(own.map((o) => o.status), `${f.team} ${f.year}`).toEqual(["frozen"]);
    }
  });

  it("a shared link that tries to trade one drops that pick", () => {
    const token = encodeTradeParam(["BOS", "UTA"], [], [{ id: "BOS|2032|1", from: "BOS", to: "UTA" }, { id: "BOS|2030|2", from: "BOS", to: "UTA" }]);
    // encodeTradeParam needs a players map; an empty one is fine for a picks-only deal.
    const d = decodeTradeParam(token)!;
    expect(d.picks.map((p) => p.id)).toEqual(["BOS|2030|2"]);
  });
});

// Art. VII §6(j)(4)(i): two months before a player acquired by trade can be
// combined with other salaries, with a proviso in the same sentence.
describe("the two-month aggregation rule and its proviso", () => {
  it("is two months in the ordinary case", () => {
    expect(aggregateFromFor("2026-11-08")).toBe("2027-01-08");
    expect(aggregateFromFor("2026-09-14")).toBe("2026-11-14");
  });

  it("a player acquired on or before Dec. 16 is free the day before the deadline", () => {
    const eve = "2027-02-10";
    expect(CALENDAR.tradeDeadline).toBe("2027-02-11");
    expect(aggregateFromFor("2026-12-14")).toBe(eve); // two months would be Feb. 14
    expect(aggregateFromFor("2026-12-16")).toBe(eve);
    expect(aggregateFromFor("2026-12-17")).toBe("2027-02-17"); // a day late for the proviso
    expect(aggregateFromFor("2026-12-05")).toBe("2027-02-05"); // already free before the eve
  });
});
