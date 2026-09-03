import { describe, it, expect } from "vitest";
import { latestNewsDay, buildRulingCard, buildSigningCard, splitAssets, parseLegs, dayBefore } from "@/lib/newsDay";
import { DATA_AS_OF, LEAGUE_RULINGS, TRANSACTIONS } from "@apron/data";
import { rewind } from "@/lib/replayRewind";
import { BASE_CONTRACTS } from "@/lib/league";

// ---------------------------------------------------------------------------
// THE NEWS DAY — the cards are generated, so the guards are about the SHAPE of
// what generation can produce, not about today's particular deals. A card that
// contradicts itself, or credits a move with someone else's win total, is the
// failure mode this file exists to catch.
// ---------------------------------------------------------------------------

describe("the latest news day", () => {
  const day = latestNewsDay();

  it("exists and is not stamped ahead of the roster data", () => {
    expect(day).not.toBeNull();
    expect(day!.date <= DATA_AS_OF).toBe(true);
    expect(day!.moves.length).toBeGreaterThan(0);
  });

  it("every move carries a verdict it can show its work for", () => {
    for (const m of day!.moves) {
      expect(m.checks.length, m.headline).toBeGreaterThan(0);
      expect(m.teams.length, m.headline).toBeGreaterThan(0);
      // The stamp is the whole receipt: a card cannot claim to be legal while
      // printing a failing check under it.
      expect(m.legal, `${m.headline} stamp disagrees with its own checks`).toBe(
        m.checks.every((c) => c.ok),
      );
    }
  });

  it("a trade card's docket balances — every player leaves someone", () => {
    for (const m of day!.moves) {
      if (!m.docket) continue;
      const gets = m.docket.flatMap((d) => d.gets.filter((l) => !l.pick).map((l) => l.label));
      const sends = m.docket.flatMap((d) => d.sends.filter((l) => !l.pick).map((l) => l.label));
      expect(gets.sort(), m.headline).toEqual(sends.sort());
    }
  });

  it("picks appear once per side, not once per feed row", () => {
    // A five-team deal is reported as one row per player, each repeating the
    // whole ledger. Unioned without a dedupe, Cleveland sent the same 2031
    // first six times.
    for (const m of day!.moves) {
      for (const d of m.docket ?? []) {
        for (const side of [d.gets, d.sends]) {
          const picks = side.filter((l) => l.pick).map((l) => l.label);
          expect(new Set(picks).size, `${m.headline} — ${d.teamId}`).toBe(picks.length);
        }
      }
    }
  });

  it("win shifts are per-move, not cumulative", () => {
    // The Aug 19 trade must not be credited with the Aug 20 signing. Each card
    // measures the day before against the day of, so no single card may claim
    // a swing larger than a whole roster teardown.
    for (const m of day!.moves)
      for (const w of m.winShifts) {
        expect(Math.abs(w.afterWins - w.beforeWins), `${m.headline} ${w.team}`).toBeLessThan(20);
        expect(Number.isFinite(w.beforeNrtg) && Number.isFinite(w.afterNrtg)).toBe(true);
      }
  });

  it("ids are unique and stable enough to dismiss", () => {
    const ids = day!.moves.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(latestNewsDay()!.moves.map((m) => m.id)).toEqual(ids);
  });
});

// ---------------------------------------------------------------------------
// THE PARSERS — the feed's prose is the one input here nobody controls, and a
// wording change is the likeliest way this whole surface goes quietly wrong.
// Each case below is a shape the live feed actually produced.
// ---------------------------------------------------------------------------

describe("reading the feed's prose", () => {
  it("splits an asset list without breaking inside a bracketed note", () => {
    // "[least favorable of BKN/DAL pick]" carries its own " and " in other rows,
    // and a naive split on " and " tears the note in half.
    expect(
      splitAssets(
        "Khris Middleton, a 2027 2nd round pick [least favorable of BKN/DAL pick] and a 2033 2nd round pick [DAL pick]",
      ),
    ).toEqual([
      "Khris Middleton",
      "a 2027 2nd round pick [least favorable of BKN/DAL pick]",
      "a 2033 2nd round pick [DAL pick]",
    ]);
  });

  it("reads every leg of a multi-team ledger", () => {
    const legs = parseLegs(
      "Traded to Cleveland (CLE) from Denver (DEN) as part of a 5-team trade: " +
        "Cleveland (CLE) traded a 2031 1st round pick and a 2032 2nd round pick [SAC pick] to Denver (DEN); " +
        "Cleveland (CLE) traded Tre Mann, a 2027 2nd round pick [LAC pick] and cash to Washington (WAS)",
    );
    expect(legs).toEqual([
      { from: "CLE", to: "DEN", asset: "2031 1st round pick", kind: "pick" },
      { from: "CLE", to: "DEN", asset: "2032 2nd round pick [SAC pick]", kind: "pick" },
      { from: "CLE", to: "WAS", asset: "Tre Mann", kind: "player" },
      { from: "CLE", to: "WAS", asset: "2027 2nd round pick [LAC pick]", kind: "pick" },
      { from: "CLE", to: "WAS", asset: "cash", kind: "cash" },
    ]);
  });

  it("finds the cash in a TWO-team row, which carries no ledger at all", () => {
    // Cash is a row-I trigger — it hard-caps the sender at the SECOND apron.
    // Two-team rows say "…for X and cash" instead of enumerating legs, and
    // skipping them drops the trigger silently. The Aug 14 Schröder deal is
    // this exact shape.
    const legs = parseLegs(
      "Traded to Cleveland (CLE) from Charlotte (CHA) for Dennis Schröder and cash",
    );
    expect(legs).toEqual([{ from: "CLE", to: "CHA", asset: "cash", kind: "cash" }]);
  });

  it("ignores a team code that is not a team", () => {
    expect(parseLegs("Traded to Somewhere (XYZ) from Nowhere (QQQ) for a 2027 1st round pick")).toEqual([]);
  });

  it("steps back a day across a month boundary", () => {
    expect(dayBefore("2026-08-01")).toBe("2026-07-31");
    expect(dayBefore("2027-01-01")).toBe("2026-12-31");
    expect(dayBefore("2026-03-01")).toBe("2026-02-28");
  });
});

describe("prose the feed has never produced but might", () => {
  // This surface renders in the ROOT LAYOUT. A throw here would 500 the trade
  // machine, the cap sheets and every team page because a wire service changed
  // a word — so the parsers return nothing rather than raise, and the builders
  // above them are individually caught.
  const junk = [
    "",
    "Traded",
    "Traded to (CLE) from (DEN)",
    "as part of a 5-team trade:",
    "Traded to Cleveland (CLE) from Denver (DEN) as part of a 5-team trade: ;;;",
    "Traded to Cleveland (CLE) from Denver (DEN) as part of a 99-team trade: nonsense",
    "Traded to Cleveland (CLE) from Denver (DEN) for [unclosed bracket",
    "Traded to Cleveland (CLE) from Cleveland (CLE) for himself",
  ];

  it("never throws, whatever the row says", () => {
    for (const d of junk) expect(() => parseLegs(d)).not.toThrow();
    for (const d of junk) expect(() => splitAssets(d)).not.toThrow();
  });

  it("returns legs only when both ends are real teams", () => {
    for (const d of junk)
      for (const leg of parseLegs(d)) {
        expect(leg.from).toMatch(/^[A-Z]{3}$/);
        expect(leg.to).toMatch(/^[A-Z]{3}$/);
      }
  });

  it("builds the day without throwing", () => {
    expect(() => latestNewsDay()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// LEAGUE RULINGS — the one card the engine does not rule on. The penalty is
// quoted from league-rulings.json; the ledger underneath it is computed. These
// guards are about that split staying honest.
// ---------------------------------------------------------------------------

describe("a league ruling on the feed", () => {
  const ruling = LEAGUE_RULINGS.find((r) => r.id === "2026-09-02-lac-circumvention")!;
  const card = buildRulingCard(ruling);

  it("quotes every penalty and computes the ledger after it", () => {
    expect(card.kind).toBe("ruling");
    expect(card.ruling!.penalties.filter((p) => p.kind === "pick_forfeiture")).toHaveLength(5);
    expect(card.ruling!.penalties.filter((p) => p.kind === "suspension")).toHaveLength(3);
    expect(card.ruling!.sources.length).toBeGreaterThan(0);
    // The computed half: what is left, what is uncovered, and the Stepien read.
    expect(card.checks.some((c) => /Firsts still on the ledger/.test(c.text))).toBe(true);
    expect(card.checks.some((c) => /Toronto Raptors' 2031/.test(c.text) && /2033/.test(c.text))).toBe(true);
    expect(card.checks.some((c) => /Years without a first: 2028, 2030 and 2032/.test(c.text))).toBe(true);
    expect(card.checks.some((c) => /Stepien rule still lets/.test(c.text))).toBe(true);
    expect(card.consequences.some((c) => /locked in practice/.test(c.text))).toBe(true);
  });

  it("is a ruling, not a verdict: no projection swing, no cap-sheet change, Indiana named as affected", () => {
    expect(card.winShifts).toEqual([]);
    expect(card.legal).toBe(true); // the stamp says "League ruling"; every check is a statement, not a failure
    expect(card.checks.every((c) => c.ok)).toBe(true);
    expect(card.teams).toEqual(["LAC", "IND"]);
    expect(card.focusTeam).toBe("LAC");
    expect(card.subhead).toMatch(/5 firsts, 2029–2033/);
    expect(card.subhead).toMatch(/\$30\.0M fine/);
    expect(card.subhead).toMatch(/Ballmer, Zucker and Frank suspended/);
  });

  it("leads the day it was announced, ahead of that day's signings", () => {
    const day = latestNewsDay()!;
    if (day.date !== ruling.date) return; // the window has moved on — nothing to assert
    expect(day.moves[0]!.id).toBe(ruling.id);
    expect(day.moves.filter((m) => m.kind === "ruling")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// AGREED FIRST, ROOM SECOND — the Kuminga shape. Reported Aug 26 at the
// taxpayer mid-level with Minnesota short of the second-apron room to file
// it; Josh Green to Utah on Aug 29 and Konchar waived-and-stretched on Aug 30
// opened it. Two things had to be true for the card to say so: the rewind
// must not leave a later waive's dead money on the earlier sheet, and a deal
// the team's own later moves cleared must stand, with the sequence on the
// receipt rather than a red x the league itself has since answered.
// ---------------------------------------------------------------------------

describe("a signing the team cleared after agreeing to it", () => {
  const row = TRANSACTIONS.find((t) => t.type === "Signing" && /Kuminga/.test(t.player) && /Signed a/.test(t.detail))!;

  it("the rewind to the day before has Konchar on Utah, live, not dead on Minnesota", () => {
    const pre = rewind(BASE_CONTRACTS, "2026-08-25", ["MIN"]);
    const konchar = pre.filter((c) => /Konchar/.test(c.playerName));
    expect(konchar.some((c) => c.deadMoney && c.teamId === "MIN")).toBe(false);
    expect(konchar.find((c) => !c.deadMoney)?.teamId).toBe("UTA");
    // On the day of the trade he is a Timberwolf at his real salary; the
    // stretch has not happened yet.
    const onTradeDay = rewind(BASE_CONTRACTS, "2026-08-29", ["MIN", "UTA"]).find((c) => /Konchar/.test(c.playerName) && !c.deadMoney)!;
    expect(onTradeDay.teamId).toBe("MIN");
    expect(onTradeDay.years.find((y) => y.leagueYear === "2026-27")?.salary).toBe(6_165_000);
  });

  it("the card stands, and names what cleared it", () => {
    const card = buildSigningCard(row, "2026-08-26")!;
    expect(card).not.toBeNull();
    expect(card.legal).toBe(true);
    const hardCap = card.checks.find((c) => /hard cap/.test(c.text))!;
    expect(hardCap.ok).toBe(true);
    // Either it fit on our sheet that day, or it was over and the later
    // moves are named — both are honest; a silent red x is not.
    expect(hardCap.text).toMatch(/Fits under|cleared since by Josh Green to Utah Jazz \(Aug 29\) and John Konchar waived and stretched \(Aug 30\)/);
  });
});
