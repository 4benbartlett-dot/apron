import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BASE_CONTRACTS, TEAM_IDS, C, currentSalary, normName,
  teamProjection, feedStateOf, LEAGUE_WINS,
} from "@/lib/league";
import { DATA_AS_OF } from "@apron/data";

// ---------------------------------------------------------------------------
// DATA INTEGRITY — one guard per bug that actually shipped.
//
// Every check below is here because the thing it checks went wrong silently and
// nothing complained. That is the common thread: none of these produced an
// error, a crash, or a failing test. They produced a plausible wrong number on
// a page. So each is pinned to the invariant that would have caught it.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, "..", "..", "..", "packages", "data", "src");
const rd = (f: string) => JSON.parse(readFileSync(join(SRC, f), "utf8"));

describe("data integrity", () => {
  // Basketball-Reference keys draft tables to historical franchise names, so the
  // 2026 board came back with Brooklyn's picks on NJN and New Orleans's on NOH.
  // They landed on teams the app has never heard of, which made them invisible
  // everywhere at once — no cap hit, no roster spot, no rotation minutes.
  // Brooklyn was short $11,503,304 and its #6 overall pick.
  it("every contract is on a team that exists", () => {
    const valid = new Set(TEAM_IDS);
    const stray = BASE_CONTRACTS.filter((c) => !valid.has(c.teamId));
    expect(stray.map((c) => `${c.playerName} → ${c.teamId}`)).toEqual([]);
  });

  it("no rookie is stranded on a defunct franchise", () => {
    const valid = new Set(TEAM_IDS);
    const stray = (rd("rookies-2026.json") as { playerName: string; teamId: string }[])
      .filter((r) => !valid.has(r.teamId));
    expect(stray.map((r) => `${r.playerName} → ${r.teamId}`)).toEqual([]);
  });

  // The transactions scraper took "today" from toISOString() — UTC — so from
  // 5pm Pacific onward it stamped a date that had not happened yet, and the
  // footer advertised rosters as of tomorrow.
  it("the as-of date is not in the future", () => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(DATA_AS_OF <= today, `DATA_AS_OF ${DATA_AS_OF} is ahead of ${today}`).toBe(true);
  });

  it("the strength snapshot is stamped for the same day as the rosters", () => {
    expect(rd("team-strength-2026.json").asOf).toBe(rd("meta.json").rostersAsOf);
  });

  // The Jul 10 four-team trade landed in the feed twice.
  it("no duplicate transaction rows", () => {
    const t = rd("transactions.json");
    const rows: { player?: string; date?: string; detail?: string }[] =
      Array.isArray(t) ? t : (t.transactions ?? t.rows ?? Object.values(t).find(Array.isArray));
    const seen = new Map<string, number>();
    for (const r of rows) {
      const k = `${r.player}|${r.date}|${(r.detail ?? "").slice(0, 80)}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k.slice(0, 70))).toEqual([]);
  });

  // Melton's contract updated to the full taxpayer MLE while feed-team-state
  // still carried the partial figure from when the terms were only reported.
  // The salary, the hard cap and the exception attribution were all correct —
  // only the amount consumed was a version behind, and that surfaces solely as
  // an offer the team cannot actually make.
  it("no team has consumed more of an exception than exists", () => {
    const over: string[] = [];
    for (const t of TEAM_IDS) {
      const c = feedStateOf(t).consumed;
      if ((c.tpmle ?? 0) > C.taxpayerMLE) over.push(`${t} tpmle ${c.tpmle} > ${C.taxpayerMLE}`);
      if ((c.ntmle ?? 0) > C.nonTaxpayerMLE) over.push(`${t} ntmle ${c.ntmle} > ${C.nonTaxpayerMLE}`);
    }
    expect(over).toEqual([]);
  });

  it("a taxpayer-MLE signing on the sheet matches the exception recorded against it", () => {
    const mismatched: string[] = [];
    for (const t of TEAM_IDS) {
      const st = feedStateOf(t);
      if (!/taxpayer mle/i.test(st.hardCapSource ?? "")) continue;
      // The player the hard cap is attributed to, and what he is actually paid.
      const who = (st.hardCapSource ?? "").replace(/taxpayer mle/i, "").trim();
      const c = BASE_CONTRACTS.find(
        (x) => x.teamId === t && !x.deadMoney && normName(x.playerName) === normName(who),
      );
      if (!c) continue; // attribution not to a named player on this roster
      const paid = currentSalary(c);
      const recorded = st.consumed.tpmle ?? 0;
      // The exception is consumed by the FIRST-YEAR salary it paid out.
      if (Math.abs(paid - recorded) > 1)
        mismatched.push(`${t}: ${c.playerName} paid ${paid.toLocaleString()} but tpmle recorded ${recorded.toLocaleString()}`);
    }
    expect(mismatched).toEqual([]);
  });

  it("nobody holds a live contract on two teams at once", () => {
    const byPlayer = new Map<string, string[]>();
    for (const c of BASE_CONTRACTS) {
      if (c.deadMoney || currentSalary(c) <= 0) continue;
      const k = normName(c.playerName);
      byPlayer.set(k, [...(byPlayer.get(k) ?? []), c.teamId]);
    }
    const dupes = [...byPlayer.entries()]
      .filter(([, teams]) => new Set(teams).size > 1)
      .map(([n, teams]) => `${n}: ${teams.join(", ")}`);
    expect(dupes).toEqual([]);
  });

  it("no salary is negative or non-finite", () => {
    const bad = BASE_CONTRACTS
      .filter((c) => !Number.isFinite(currentSalary(c)) || currentSalary(c) < 0)
      .map((c) => `${c.playerName} ${c.teamId} ${currentSalary(c)}`);
    expect(bad).toEqual([]);
  });

  it("the league still shares exactly 1,230 wins", () => {
    const total = TEAM_IDS.reduce((s, t) => s + teamProjection(t, BASE_CONTRACTS)!.baseWins, 0);
    expect(total).toBe(LEAGUE_WINS);
  });

  it("every projected record is a real record", () => {
    for (const t of TEAM_IDS) {
      const p = teamProjection(t, BASE_CONTRACTS)!;
      expect(p.baseWins, t).toBeGreaterThanOrEqual(0);
      expect(p.baseWins, t).toBeLessThanOrEqual(82);
      expect(Number.isFinite(p.baseNrtg), t).toBe(true);
    }
  });
});
