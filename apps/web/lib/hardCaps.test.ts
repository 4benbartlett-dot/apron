import { describe, it, expect } from "vitest";
import { validateSigning, validateTrade, teamSalary, type Contract } from "@apron/cba-engine";
import { BASE_CONTRACTS, C, sessionHardCaps, leagueData, TEAM_IDS, type Move } from "@/lib/league";

// Reported by @SF_DavidGio on launch day: a trade taking back more than 100%
// (expanded matching) hard-caps the team at the first apron for the YEAR, but
// the session never remembered it — a later Bird re-sign sailed $18M past the
// line. Permanent tests. Coupled fix (reviewer note): hard caps test APRON
// salary (holds excluded), so persisting the cap must not create false blocks
// for hold-heavy teams.

const salary = (name: string) =>
  BASE_CONTRACTS.find((c) => c.playerName.toLowerCase().includes(name) && !c.deadMoney)!;

const salaryIn = (c: Contract) =>
  c.years.find((y) => y.leagueYear === "2026-27")?.salary ?? 0;

describe("sessionHardCaps — trade-triggered", () => {
  // The acquirer is CHOSEN FROM THE DATA, not named. This test used to hardcode
  // GSW as the sub-apron team; the Jul 28 Draymond re-signing put Golden State
  // over the first apron, expanded matching stopped applying, and the fixture's
  // premise silently evaporated. Expanded matching is only available BELOW the
  // first apron, so we pick a team that is comfortably there and build the
  // uneven trade out of real contracts.
  const teams = TEAM_IDS.map((t) => ({
    t,
    sal: teamSalary(leagueData(BASE_CONTRACTS), t, "2026-27"),
  }));
  // The highest team still comfortably under the line: expanded matching is
  // available to it, and the post-trade sheet sits near enough to the apron
  // that a big Bird re-sign genuinely crosses it.
  const ACQ = teams
    .filter((x) => x.sal < C.firstApron - 8_000_000)
    .sort((a, b) => b.sal - a.sal)[0]!.t;

  // Send a mid-size salary out, take back more than 125% + $250k of it.
  const out = BASE_CONTRACTS.filter(
    (c) => c.teamId === ACQ && !c.deadMoney && salaryIn(c) > 2_000_000 && salaryIn(c) < 9_000_000,
  ).sort((a, b) => salaryIn(b) - salaryIn(a))[0]!;
  const incoming = BASE_CONTRACTS.filter(
    (c) =>
      c.teamId !== ACQ &&
      !c.deadMoney &&
      salaryIn(c) > salaryIn(out) * 1.6 &&
      salaryIn(c) < salaryIn(out) * 2.6,
  ).sort((a, b) => salaryIn(a) - salaryIn(b))[0]!;

  const uneven: Move = {
    kind: "trade",
    label: "test",
    players: [
      { playerId: out.playerId, to: incoming.teamId },
      { playerId: incoming.playerId, to: ACQ },
    ],
  } as Move;

  it("an expanded-matching trade freezes a first-apron cap", () => {
    expect(salaryIn(incoming)).toBeGreaterThan(salaryIn(out) * 1.25 + 250_000); // really expanded
    const caps = sessionHardCaps([uneven]);
    expect(caps[ACQ]).toBe(C.firstApron);
  });

  it("the frozen cap blocks a later over-the-line Bird re-sign (apron basis)", () => {
    // The sign is mechanism-legal (Bird has no ceiling), so the SESSION hard cap
    // is the only thing that can stop it landing past the first apron.
    const caps = sessionHardCaps([uneven]);
    const post =
      teamSalary(leagueData(BASE_CONTRACTS), ACQ, "2026-27") -
      salaryIn(out) +
      salaryIn(incoming);
    const headroom = caps[ACQ]! - post;
    // A real, finite ceiling — not the absent cap that let the launch-day bug
    // sail $18M past the line.
    expect(Number.isFinite(headroom)).toBe(true);
    expect(headroom).toBeLessThan(C.nonTaxpayerMLE * 4);
    // Anything above the remaining headroom now crosses the remembered cap.
    expect(post + headroom + 1_000_000).toBeGreaterThan(caps[ACQ]!);
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
      players: [{ playerId: out.playerId, to: incoming.teamId }],
    } as Move;
    expect(sessionHardCaps([even])[ACQ]).toBeUndefined();
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
    // Sanity: CHI is below the cap with real room. (Was >$15M before the
    // Claxton reconciliation fix put his $23.1M on the right team — theirs —
    // and ~$12.4M until the Jul 9 audit returned Jalen Smith's $9.4M to CHI:
    // the Braden Smith draft-rights trade had surname-matched him onto IND.)
    expect(roomNoHolds).toBeGreaterThan(2_000_000);
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
