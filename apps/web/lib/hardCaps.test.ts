import { describe, it, expect } from "vitest";
import { validateSigning, validateTrade, teamSalary, type Contract } from "@apron/cba-engine";
import { BASE_CONTRACTS, C, sessionHardCaps, leagueData, type Move } from "@/lib/league";

// Reported by @SF_DavidGio on launch day: a trade taking back more than 100%
// (expanded matching) hard-caps the team at the first apron for the YEAR, but
// the session never remembered it — a later Bird re-sign sailed $18M past the
// line. Permanent tests. Coupled fix (reviewer note): hard caps test APRON
// salary (holds excluded), so persisting the cap must not create false blocks
// for hold-heavy teams.

const salary = (name: string) =>
  BASE_CONTRACTS.find((c) => c.playerName.toLowerCase().includes(name) && !c.deadMoney)!;

describe("sessionHardCaps — trade-triggered", () => {
  // GSW (sub-apron, ~$184M) takes back more than it sends: Gui Santos out
  // (~$4.6M), Tre Johnson in (~$8.6M) — 187%, expanded matching, row E.
  const santos = salary("gui santos");
  const johnson = salary("tre johnson");
  const uneven: Move = {
    kind: "trade",
    label: "test",
    players: [
      { playerId: santos.playerId, to: johnson.teamId },
      { playerId: johnson.playerId, to: "GSW" },
    ],
  } as Move;

  it("an expanded-matching trade freezes a first-apron cap", () => {
    const caps = sessionHardCaps([uneven]);
    expect(caps.GSW).toBe(C.firstApron);
  });

  it("the frozen cap blocks a later over-the-line Bird re-sign (apron basis)", () => {
    // Post-trade GSW apron salary ≈ $188.1M; a $30M Bird re-sign lands
    // ≈ $218.1M — $9.1M past the 1A. The sign is mechanism-legal (Bird has no
    // ceiling) so the SESSION hard cap is the only thing that can stop it.
    const caps = sessionHardCaps([uneven]);
    const post = 188_104_138;
    expect(post + 30_000_000).toBeGreaterThan(caps.GSW!);
  });

  it("signing-triggered caps still register (NT-MLE → 1A, TP-MLE → 2A)", () => {
    const caps = sessionHardCaps([
      { kind: "sign", label: "x", playerId: "a", playerName: "A", teamId: "DET", salary: 10_000_000, years: 2, mechanism: "ntmle" } as Move,
      { kind: "sign", label: "y", playerId: "b", playerName: "B", teamId: "NYK", salary: 5_000_000, years: 1, mechanism: "tpmle" } as Move,
    ]);
    expect(caps.DET).toBe(C.firstApron);
    expect(caps.NYK).toBe(C.secondApron);
  });

  it("even swaps and pure absorption trades trigger nothing", () => {
    const even: Move = {
      kind: "trade",
      label: "even",
      players: [{ playerId: santos.playerId, to: johnson.teamId }],
    } as Move;
    expect(sessionHardCaps([even]).GSW).toBeUndefined();
  });

  it("aggregating down through the second apron freezes a second-apron cap for the session", () => {
    const base: Contract[] = [
      { playerId: "bos-big", playerName: "BOS Big", teamId: "BOS", years: [{ leagueYear: "2026-27", salary: C.secondApron + 1_000_000 - 24_000_000, guarantee: "full" }] },
      { playerId: "bos-a", playerName: "BOS A", teamId: "BOS", years: [{ leagueYear: "2026-27", salary: 12_000_000, guarantee: "full" }] },
      { playerId: "bos-b", playerName: "BOS B", teamId: "BOS", years: [{ leagueYear: "2026-27", salary: 12_000_000, guarantee: "full" }] },
      { playerId: "lal-big", playerName: "LAL Big", teamId: "LAL", years: [{ leagueYear: "2026-27", salary: 20_000_000, guarantee: "full" }] },
      { playerId: "lal-fill", playerName: "LAL Fill", teamId: "LAL", years: [{ leagueYear: "2026-27", salary: 150_000_000, guarantee: "full" }] },
    ];
    const move: Move = {
      kind: "trade",
      label: "2A aggregate down",
      players: [
        { playerId: "bos-a", to: "LAL" },
        { playerId: "bos-b", to: "LAL" },
        { playerId: "lal-big", to: "BOS" },
      ],
    };
    expect(sessionHardCaps([move], base).BOS).toBe(C.secondApron);
  });

  it("sending cash while staying below the second apron also freezes a second-apron cap", () => {
    const base: Contract[] = [
      { playerId: "bos-fill", playerName: "BOS Fill", teamId: "BOS", years: [{ leagueYear: "2026-27", salary: C.secondApron + 1_000_000 - 10_000_000, guarantee: "full" }] },
      { playerId: "bos-out", playerName: "BOS Out", teamId: "BOS", years: [{ leagueYear: "2026-27", salary: 10_000_000, guarantee: "full" }] },
      { playerId: "lal-in", playerName: "LAL In", teamId: "LAL", years: [{ leagueYear: "2026-27", salary: 7_000_000, guarantee: "full" }] },
      { playerId: "lal-fill", playerName: "LAL Fill", teamId: "LAL", years: [{ leagueYear: "2026-27", salary: 150_000_000, guarantee: "full" }] },
    ];
    const move: Move = {
      kind: "trade",
      label: "cash down",
      players: [
        { playerId: "bos-out", to: "LAL" },
        { playerId: "lal-in", to: "BOS" },
      ],
      cash: [{ from: "BOS", to: "LAL", amount: 500_000 }],
    };
    expect(sessionHardCaps([move], base).BOS).toBe(C.secondApron);
  });
});

describe("apron split — holds gate room, never tier (reviewer coupling note)", () => {
  it("a hold-heavy team is NOT an apron team for exception gating", () => {
    // LAL-like: $195.3M signed + $106M holds. Charge-with-holds reads past
    // the 2nd apron, but apron salary is under the tax line → NT-MLE lives.
    const v = validateSigning(301_311_407, 10_000_000, C, {
      apronSalary: 195_286_168,
      yearsOfService: 5,
    });
    expect(v.legal).toBe(true);
    expect(v.mechanism?.id).toBe("ntmle");
    // Ceiling comes off the APRON base: 209.015 − 195.286 ≈ 13.7M.
    expect(v.maxOffer).toBe(C.firstApron - 195_286_168);
  });

  it("without apronSalary the legacy conservative behavior is unchanged", () => {
    const v = validateSigning(301_311_407, 10_000_000, C, { yearsOfService: 5 });
    expect(v.legal).toBe(false);
  });

  it("holds still consume below-cap trade absorption room", () => {
    // CHI-like below-cap team: room on signed salary alone is big, but kept
    // holds erase most of it — absorption must shrink accordingly.
    const data = leagueData(BASE_CONTRACTS);
    const chi = teamSalary(data, "CHI", "2026-27");
    const roomNoHolds = C.salaryCap - chi;
    // Sanity: CHI is below the cap. (Was >$15M before the Claxton
    // reconciliation fix put his $23.1M on the right team — theirs.)
    expect(roomNoHolds).toBeGreaterThan(5_000_000);
    const target = BASE_CONTRACTS.find(
      (c) => c.teamId === "SAS" && !c.deadMoney && (c.years.find((y) => y.leagueYear === "2026-27")?.salary ?? 0) > 15_000_000,
    )!;
    const tr = (holds: number) =>
      validateTrade(
        data,
        {
          teams: ["CHI", "SAS"],
          players: [{ playerId: target.playerId, from: "SAS", to: "CHI" }],
          capHolds: { CHI: holds },
        },
        C,
      ).teams.find((t) => t.teamId === "CHI")!.maxIncomingAllowed;
    // With enough holds, absorption collapses (only the expanded formula on
    // $0 outgoing remains: $250k tier-1 floor).
    expect(tr(0)).toBeGreaterThan(tr(35_000_000));
  });
});
