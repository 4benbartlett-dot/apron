import { describe, it, expect } from "vitest";
import { spendingPower } from "@apron/cba-engine";
import { C, feedStateOf, consumedFor, teamMeta } from "@/lib/league";

// FEED_TEAM_STATE: how each team's real July actually happened — audited by
// five agents replaying every feed signing against the exception system
// (packages/data/src/feed-team-state.json carries the per-signing rationale).
// Born from @LukaDoncicSZN's launch-day report that LAL was offered the
// NT-MLE/BAE despite operating as a cap-room team.

const mechIds = (team: string, committedPlusHolds: number, committed: number) =>
  spendingPower(committedPlusHolds, C, {
    apronSalary: committed,
    roomTeam: feedStateOf(team).roomTeam,
    consumed: consumedFor([], team),
  }).mechanisms.map((m) => m.id);

describe("feed-derived team state (the LAL report + league sweep)", () => {
  it("LAL: room team, Room MLE fully spent, S&T first-apron hard cap, forced renounces", () => {
    const s = feedStateOf("LAL");
    expect(s.roomTeam).toBe(true);
    expect(s.consumed.room_mle).toBe(C.roomMLE); // Sexton, to the dollar
    expect(s.hardCap).toBe(C.firstApron); // Kessler S&T
    expect(s.forcedRenounced.has("lebron james")).toBe(true);
    // Over-cap room team: NO NT-MLE/BAE/TP-MLE, and the Room MLE is used up.
    const ids = mechIds("LAL", 195_286_168, 195_286_168);
    expect(ids).not.toContain("ntmle");
    expect(ids).not.toContain("bae");
    expect(ids).not.toContain("tpmle");
    expect(ids).not.toContain("room_mle"); // fully consumed
    expect(ids).toContain("minimum");
  });

  it("BOS: NT-MLE fully spent (Robinson) + first-apron hard cap", () => {
    const s = feedStateOf("BOS");
    expect(s.consumed.ntmle).toBe(C.nonTaxpayerMLE);
    expect(s.hardCap).toBe(C.firstApron);
    const ids = mechIds("BOS", 198_200_000, 198_200_000);
    expect(ids).not.toContain("ntmle"); // spent
    expect(ids).toContain("bae"); // BAE still live for BOS
  });

  it("GSW: the Melton BAE fingerprint hard-caps them in-world", () => {
    const s = feedStateOf("GSW");
    expect(s.consumed.bae).toBe(C.biAnnualException);
    expect(s.hardCap).toBe(C.firstApron);
  });

  it("UTA: NT-MLE legally split across two signings, remainder available", () => {
    const s = feedStateOf("UTA");
    expect(s.consumed.ntmle).toBe(11_917_659); // Hayes + Okogie
    expect(s.hardCap).toBe(C.firstApron);
    const power = spendingPower(171_505_322, C, {
      apronSalary: 171_505_322,
      consumed: consumedFor([], "UTA"),
    });
    const nt = power.mechanisms.find((m) => m.id === "ntmle");
    expect(nt?.maxSalary).toBe(C.nonTaxpayerMLE - 11_917_659); // ~$3.1M left
  });

  it("CHI: room team — MLEs dead even though they sit under the cap", () => {
    const s = feedStateOf("CHI");
    expect(s.roomTeam).toBe(true);
    expect(s.forcedRenounced.has("jaden ivey")).toBe(true);
    const ids = mechIds("CHI", 142_783_119, 142_783_119);
    expect(ids).toContain("cap_room");
    expect(ids).toContain("room_mle"); // unspent — still available
    expect(ids).not.toContain("ntmle");
    expect(ids).not.toContain("bae");
  });

  it("DET + WAS carry sign-and-trade hard caps; DEN/CHA stay clean controls", () => {
    expect(feedStateOf("DET").hardCap).toBe(C.firstApron); // Collins S&T (Jul 1)
    expect(feedStateOf("WAS").hardCap).toBe(C.firstApron); // Middleton S&T (Jul 8)
    for (const t of ["DEN", "CHA"]) {
      const s = feedStateOf(t);
      expect(s.roomTeam).toBe(false);
      expect(s.hardCap).toBe(Infinity);
      expect(Object.keys(s.consumed)).toHaveLength(0);
      expect(teamMeta(t).id).toBe(t);
    }
  });

  it("ATL: Landale took the NT-MLE (not Bird) — $14M consumed, first-apron cap", () => {
    // Community-audit correction: an earlier pass misread this as an own-FA
    // re-sign. Gozlan: ATL's Non-Bird rights were too low, so Landale's deal
    // used "nearly their entire $15 million mid-level exception."
    const s = feedStateOf("ATL");
    expect(s.consumed.ntmle).toBe(14_000_000);
    expect(s.hardCap).toBe(C.firstApron); // NT-MLE use hard-caps in-world
    expect(s.hardCapSource).toContain("Landale");
    const power = spendingPower(178_000_000, C, {
      apronSalary: 178_000_000,
      consumed: consumedFor([], "ATL"),
    });
    const nt = power.mechanisms.find((m) => m.id === "ntmle");
    expect(nt?.maxSalary).toBe(C.nonTaxpayerMLE - 14_000_000); // ~$1.04M left
  });

  it("every in-world hard cap names its source move", () => {
    for (const t of ["ATL", "BOS", "DET", "GSW", "HOU", "IND", "LAC", "LAL", "MIA", "PHI", "PHX", "SAS", "UTA"]) {
      const s = feedStateOf(t);
      expect(s.hardCap).toBe(C.firstApron);
      expect(s.hardCapSource, t).toBeTruthy();
    }
  });

  it("session moves stack on top of feed consumption", () => {
    const merged = consumedFor(
      [
        {
          kind: "sign",
          label: "x",
          playerId: "p",
          playerName: "P",
          teamId: "UTA",
          salary: 1_000_000,
          years: 1,
          mechanism: "ntmle",
        } as never,
      ],
      "UTA",
    );
    expect(merged.ntmle).toBe(11_917_659 + 1_000_000);
  });
});
