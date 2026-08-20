import { describe, it, expect } from "vitest";
import { latestNewsDay } from "@/lib/newsDay";
import { DATA_AS_OF } from "@apron/data";

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
