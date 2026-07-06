import { describe, it, expect } from "vitest";
import { BASE_CONTRACTS, currentSalary } from "@/lib/league";

// Launch-week community reports, permanent. @tomer_langer: Claxton still on
// the Nets page after the Randle three-teamer (the trade prose says "Nicolas",
// the sheet says "Nic" — the name-variant fallback covers that class).
// @Rizk_Taker: Cameron Carr on the Knicks after his rights moved on draft
// night (draft-rights trades hit ROOKIES_2026, not the veteran sheet).

const teamOf = (name: string) => {
  const rows = BASE_CONTRACTS.filter((c) => c.playerName === name && !c.deadMoney);
  expect(rows.length, `${name} should appear exactly once`).toBe(1);
  return rows[0]!.teamId;
};

describe("the Randle–Claxton–Gueye three-teamer (Jun 22)", () => {
  it("lands every leg", () => {
    expect(teamOf("Julius Randle")).toBe("BKN");
    expect(teamOf("Nic Claxton")).toBe("CHI"); // prose calls him "Nicolas"
    expect(teamOf("Mouhamadou Gueye")).toBe("MIN");
    // The OTHER Gueye stays put — the surname fallback must not cross-match.
    expect(teamOf("Mouhamed Gueye")).toBe("ATL");
  });
});

describe("draft-night rights trades (Jun 24 four-teamer)", () => {
  it("rookies land on their post-trade teams", () => {
    expect(teamOf("Cameron Carr")).toBe("LAL");
    expect(teamOf("Sergio de Larrea")).toBe("DAL");
    expect(teamOf("Koa Peat")).toBe("PHX");
    // Ajinca's DRAFT RIGHTS moved to NYK but he's an unsigned stash — no
    // contract, so he correctly appears on no cap sheet.
    expect(BASE_CONTRACTS.filter((c) => c.playerName === "Melvin Ajinca")).toHaveLength(0);
  });
});

describe("Jul 6 moves (same-day ingest)", () => {
  it("the Giannis blockbuster, Hachimura, and the pending Post offer sheet", () => {
    expect(teamOf("Giannis Antetokounmpo")).toBe("MIA");
    expect(teamOf("Bobby Portis")).toBe("MIA");
    expect(teamOf("Tyler Herro")).toBe("MIL");
    expect(teamOf("Kel'el Ware")).toBe("MIL");
    expect(teamOf("Rui Hachimura")).toBe("LAC");
    // A pending RFA offer sheet is NOT a signing: GSW holds the match right,
    // so Post stays a Warrior (with his hold) until the feed resolves it.
    const post = BASE_CONTRACTS.filter((c) => c.playerName === "Quinten Post" && !c.deadMoney);
    expect(post.every((c) => c.teamId === "GSW")).toBe(true);
  });
});

describe("roster invariants (league-wide)", () => {
  it("no active player appears on two teams or twice anywhere", () => {
    const seen = new Map<string, string>();
    for (const c of BASE_CONTRACTS) {
      if (c.deadMoney || currentSalary(c) === 0) continue;
      const prev = seen.get(c.playerId);
      expect(prev, `${c.playerName} on ${prev} AND ${c.teamId}`).toBeUndefined();
      seen.set(c.playerId, c.teamId);
    }
  });
});
