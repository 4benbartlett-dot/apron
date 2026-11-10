import { describe, it, expect } from "vitest";
import { salaryForYear, validateRegularSeasonWaiverSigning } from "@apron/cba-engine";
import {
  BASE_CONTRACTS,
  C,
  CALENDAR,
  SIM_DATE,
  YEAR,
  exceptionClock,
  freeAgentsOf,
  isRowDSigning,
  sessionHardCapLevels,
  type Move,
} from "@/lib/league";
import { sanitizeMoves } from "@/lib/moveGuard";
import { provision } from "@/lib/provisions";

// Oklahoma City waived Dalen Terry on Nov. 8, 2026. For two days he was on
// waivers, where a team can claim his contract but nobody can sign him. On
// Nov. 10 he was a free agent, and the board's free-agent list did not have
// him: it was built in July from the players whose contracts ran out, and
// nothing put a player released in season onto it.
describe("a player released during the season", () => {
  const cleared = "2026-11-10";

  it("is a free agent once he clears waivers, and not before", () => {
    const terry = (day: string) => freeAgentsOf(BASE_CONTRACTS, day).find((f) => f.playerName === "Dalen Terry");
    // If this fails after a refresh, Terry has signed somewhere: the feed has
    // moved on and he belongs to that team. Point the test at the next player
    // released in season.
    expect(terry("2026-11-09")).toBeUndefined();
    expect(terry(cleared)).toMatchObject({ priorTeam: "OKC", hold: 0, renounced: true, faType: "UFA", terminated: { on: "2026-11-08" } });
  });

  it("is listed once, with no team's rights, and never while he has a contract", () => {
    const lastDay = CALENDAR.regularSeasonEnd;
    const pool = freeAgentsOf(BASE_CONTRACTS, lastDay);
    const ids = pool.map((f) => f.playerId);
    expect(new Set(ids).size).toBe(ids.length);
    const live = new Set(BASE_CONTRACTS.filter((c) => !c.deadMoney && salaryForYear(c, YEAR) > 0).map((c) => c.playerId));
    for (const f of pool.filter((x) => x.terminated)) {
      expect(live.has(f.playerId), f.playerName).toBe(false);
      expect(f.hold, f.playerName).toBe(0);
      expect(f.terminated!.on >= CALENDAR.openingNight && f.terminated!.on <= lastDay, f.playerName).toBe(true);
    }
  });

  it("is on nobody's list out of season, when July's free agents are the list", () => {
    expect(freeAgentsOf(BASE_CONTRACTS, "2026-09-01").some((f) => f.terminated)).toBe(false);
  });
});

// Art. VII §2(e)(4), row D: "Team signs a Contract during the Regular Season
// with a player who was previously under a Contract that: (i) was terminated
// during such Regular Season; and (ii) prior to such termination, provided
// for a Salary ... of greater than the amount of the Non-Taxpayer Mid-Level
// Salary Exception". It is the rule that keeps the most expensive teams out
// of the buyout market. The rules page listed it and nothing enforced it.
describe("signing a player released from more than the mid-level (row D)", () => {
  const midSeason = "2026-12-20";
  const released = (salary: number, on = "2026-12-01") => ({ terminated: { on, salary } });

  it("applies above the mid-level amount, not at it, and only to a release during the season", () => {
    expect(isRowDSigning(released(C.nonTaxpayerMLE + 1_000_000), midSeason)).toBe(true);
    expect(isRowDSigning(released(C.nonTaxpayerMLE), midSeason)).toBe(false);
    expect(isRowDSigning(released(30_000_000, "2026-09-15"), midSeason)).toBe(false);
    expect(isRowDSigning({}, midSeason)).toBe(false);
    // After the season the same player signs like anyone else.
    expect(isRowDSigning(released(30_000_000), "2027-05-01")).toBe(false);
  });

  it("keeps out a team that would finish over the first apron, and caps one that wouldn't", () => {
    const offer = { signingSalary: 3_000_000, terminatedContractSalary: 30_000_000, terminatedDuringRegularSeason: true };
    const over = validateRegularSeasonWaiverSigning({ ...offer, teamApronSalaryBeforeSigning: C.firstApron - 1_000_000 }, C);
    expect(over.legal).toBe(false);
    const under = validateRegularSeasonWaiverSigning({ ...offer, teamApronSalaryBeforeSigning: C.firstApron - 10_000_000 }, C);
    expect(under).toMatchObject({ legal: true, hardCap: "first_apron" });
  });

  it("the cap it creates lasts the session, and a saved or shared session keeps it", () => {
    const sign: Move = {
      kind: "sign",
      label: "Sign: a bought-out veteran",
      playerId: "bought-out-veteran",
      playerName: "Bought-Out Veteran",
      teamId: "DEN",
      salary: C.minimumSalaries[10]!,
      years: 1,
      mechanism: "minimum",
      rowD: true,
    };
    expect(sessionHardCapLevels([sign])["DEN"]?.[YEAR]).toBe("first_apron");
    expect(sessionHardCapLevels([{ ...sign, rowD: undefined }])["DEN"]?.[YEAR]).toBeUndefined();
    expect(sanitizeMoves(JSON.parse(JSON.stringify([sign])))).toEqual([sign]);
  });

  it("has its entry in the rules index, which the signing sheet links to", () => {
    expect(provision("waived-player-signing")?.cite).toBe("Art. VII §2(e)(4), row D");
  });
});

// Art. VII §6(n)(4). The board sizes exceptions on the day it plays.
describe("the exceptions a team can offer, on the board's day", () => {
  it("are sized on the sim's date, with the session's own spending counted as today's", () => {
    const sign: Move = { kind: "sign", label: "x", playerId: "p", playerName: "P", teamId: "DEN", salary: 4_000_000, mechanism: "tpmle" };
    const clock = exceptionClock([sign], "DEN");
    expect(clock.date).toBe(SIM_DATE);
    expect(clock.consumedOnDate).toEqual({ tpmle: 4_000_000 });
    expect(clock.consumed.tpmle ?? 0).toBeGreaterThanOrEqual(4_000_000);
  });

  it("names the three in-season signing rules the board added in November", () => {
    for (const id of ["exception-shrink", "extension-window", "designated-veteran"]) {
      const p = provision(id)!;
      expect(p.group, id).toBe("Signings");
      expect(p.text.length, id).toBeGreaterThan(40);
    }
  });
});
