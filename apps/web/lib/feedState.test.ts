import { describe, it, expect } from "vitest";
import { spendingPower } from "@apron/cba-engine";
import {
  BASE_CONTRACTS,
  C,
  TEAM_IDS,
  consumedFor,
  currentSalary,
  feedStateOf,
  freeAgentsOf,
  teamMeta,
} from "@/lib/league";

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

  // CORRECTED Jul 28. The July audit read De'Anthony Melton's y1 landing on the
  // Bi-Annual Exception to the dollar ($5,477,000 = the 2026-27 BAE exactly) as
  // proof GSW spent the BAE, and pinned a FIRST-apron cap. Two things broke it:
  // Draymond re-signed for the $27,678,571 he opted out of and put Golden State
  // ~$213.5M — past the first apron, which a first-apron hard cap makes
  // impossible — and Bobby Marks named the exception outright ("The tax ML is
  // designated to De'Anthony Melton"). So the cap is real but it's the SECOND
  // apron, which is why Marks frames Golden State's room as "$8.3M below the
  // 2nd apron". The exact-dollar BAE coincidence was a trap.
  it("GSW: Melton's taxpayer MLE hard-caps them at the SECOND apron", () => {
    const s = feedStateOf("GSW");
    expect(s.hardCap).toBe(C.secondApron);
    // The FULL exception: Melton's y1 is $6,064,000, the 2026-27 taxpayer MLE
    // to the dollar. It was carried at $5,477,000 on reported terms, which left
    // Golden State holding a phantom $587k of an exception the signed contract
    // had already spent — surfacing as an offer the team could not make.
    expect(s.consumed.tpmle).toBe(C.taxpayerMLE);
    expect(s.consumed.bae ?? 0).toBe(0);
    expect(s.hardCapSource).toContain("Melton");
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
    // GSW dropped off this list on Jul 28 — see the Draymond falsification above.
    for (const t of ["ATL", "BOS", "DET", "IND", "LAC", "LAL", "MIA", "PHI", "SAS", "UTA"]) {
      const s = feedStateOf(t);
      expect(s.hardCap, t).toBe(C.firstApron);
      expect(s.hardCapSource, t).toBeTruthy();
    }
    // Taxpayer-MLE users are capped at the SECOND apron, not the first (HR on
    // Smart: "resulting in a second-apron hard cap"; Gozlan on Kennard: TP-MLE
    // unless PHX ducked the first apron, which it never did; Marks on Melton:
    // "The tax ML is designated to De'Anthony Melton"). All three spent the
    // exception in full — GSW was carried at a partial $5,477,000 while Melton's
    // terms were still reported rather than signed.
    for (const [t, consumed] of [
      ["HOU", C.taxpayerMLE],
      ["PHX", C.taxpayerMLE],
      ["GSW", C.taxpayerMLE],
    ] as const) {
      const s = feedStateOf(t);
      expect(s.hardCap, t).toBe(C.secondApron);
      expect(s.consumed.tpmle, t).toBe(consumed);
      expect(s.hardCapSource, t).toContain("Taxpayer MLE");
    }
  });

  // Jul 9 2026 audit: /team/IND showed $222.1M committed (a second-apron badge)
  // against a FIRST-apron hard cap from Oubre's partial NT-MLE — a state the
  // CBA cannot produce, so one side had to be wrong. The books were, three
  // ways: Braden Smith's draft-rights trade surname-matched CHI's Jalen Smith
  // onto IND (applyTrades fallback), Potter's NON-guaranteed $2.8M was charged
  // as dead money after his Jul 8 waive, and Nance's agreed-but-unexecutable
  // vet-min was booked at full charge (now pendingSignings). PHX and HOU
  // carried the mirror error: Kennard's and Smart's taxpayer-MLE deals were
  // booked $304k hot off a source estimate and attributed to a partial NT-MLE,
  // pinning the wrong (first-apron) hard cap on second-apron-capped teams.
  describe("hard-cap coherence (the IND/PHX/HOU July audit)", () => {
    const bookedSalary = (team: string) =>
      BASE_CONTRACTS.filter((c) => c.teamId === team).reduce((s, c) => s + currentSalary(c), 0);

    it("INVARIANT: no team's booked salary exceeds its own in-world hard cap at rest", () => {
      for (const t of TEAM_IDS) {
        const booked = bookedSalary(t);
        const cap = feedStateOf(t).hardCap;
        expect(booked, `${t} booked $${booked} exceeds its hard cap $${cap}`).toBeLessThanOrEqual(cap);
      }
    });

    it("IND: Oubre's official 2yr/$16.5M partial NT-MLE — booked = consumed, $1.6M under the cap (HR, Jul 1)", () => {
      const oubre = BASE_CONTRACTS.find((c) => c.playerName === "Kelly Oubre Jr.")!;
      expect(oubre.teamId).toBe("IND");
      expect(currentSalary(oubre)).toBe(8_048_780); // 16.5M/2.05, NOT the $17M headline's 8,292,683
      expect(feedStateOf("IND").consumed.ntmle).toBe(8_048_780);
      // Hoops Rumors printed "just $1.6MM below a first-apron hard cap with 14
      // players under contract" on Jul 1, and our sheet landed exactly
      // $1,600,035 below on 14 — the check that originally proved the audit.
      // That literal is a POINT-IN-TIME fact, not an invariant: Indiana has
      // since waived Taelon Peter (Jul 20) and added Jalen Slawson on a two-way
      // (Jul 22), so the headroom legitimately moved. What must stay true is
      // the relationship the audit was really about — the NT-MLE hard cap binds
      // and Indiana is under it.
      expect(bookedSalary("IND")).toBeLessThan(C.firstApron);
      expect(feedStateOf("IND").hardCap).toBe(C.firstApron);
    });

    it("IND books exclude Jalen Smith (CHI's), Potter dead money, and the pending Nance minimum", () => {
      const smith = BASE_CONTRACTS.filter((c) => c.playerName === "Jalen Smith");
      expect(smith).toHaveLength(1);
      expect(smith[0]!.teamId).toBe("CHI"); // Braden Smith's rights trade must not move him
      const potter = BASE_CONTRACTS.find((c) => c.playerName === "Micah Potter")!;
      expect(potter.deadMoney).toBe(true);
      expect(currentSalary(potter)).toBe(0); // non-guaranteed, waived clean
      expect(BASE_CONTRACTS.some((c) => c.playerName === "Larry Nance Jr." && c.teamId === "IND")).toBe(false);
      expect(freeAgentsOf(BASE_CONTRACTS).some((f) => f.playerName === "Larry Nance Jr.")).toBe(true);
    });

    it("PHX + HOU: taxpayer-MLE deals booked at exactly the exception (y1 $6,064,000)", () => {
      for (const [name, team] of [["Luke Kennard", "PHX"], ["Marcus Smart", "HOU"]] as const) {
        const c = BASE_CONTRACTS.find((x) => x.playerName === name)!;
        expect(c.teamId, name).toBe(team);
        // A signings.json rescrape regressing to the 6,368,000 estimate fails here.
        expect(currentSalary(c), name).toBe(C.taxpayerMLE);
      }
      expect(bookedSalary("PHX")).toBeLessThanOrEqual(C.secondApron);
    });
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
