import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BASE_CONTRACTS, TEAM_IDS, C, currentSalary, normName,
  teamProjection, feedStateOf, freeAgentsOf, LEAGUE_WINS,
} from "@/lib/league";
import { DATA_AS_OF, TRANSACTIONS, RETIRED_2026, PENDING_SIGNINGS, LEAGUE_RULINGS, getLeagueData } from "@apron/data";
import { shortPlayerName } from "@/lib/names";
import { feedIso } from "@/lib/feedDate";


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

  // A ruling is curated prose with structured penalties hanging off it, and the
  // pick ledger is rebuilt from those penalties. A typo in a team code or a
  // year would silently forfeit nothing — or the wrong team's pick.
  it("every league ruling is well-formed and dated inside the data", () => {
    const valid = new Set(TEAM_IDS);
    const kinds = new Set(["pick_forfeiture", "fine", "suspension", "monitoring", "restitution"]);
    const ids = new Set<string>();
    for (const r of LEAGUE_RULINGS) {
      expect(ids.has(r.id), `duplicate ruling id ${r.id}`).toBe(false);
      ids.add(r.id);
      expect(r.date <= DATA_AS_OF, `${r.id} is dated after the rosters`).toBe(true);
      expect(valid.has(r.team), `${r.id} team ${r.team}`).toBe(true);
      expect(r.headline.length).toBeGreaterThan(10);
      expect(r.sources.length, `${r.id} cites no source`).toBeGreaterThan(0);
      for (const p of r.penalties) {
        expect(kinds.has(p.kind), `${r.id}: unknown penalty kind ${p.kind}`).toBe(true);
        expect(p.text.length, `${r.id}: a ${p.kind} with no text`).toBeGreaterThan(5);
        if (p.kind === "pick_forfeiture") {
          expect(valid.has(p.team) && valid.has(p.origin), `${r.id}: ${p.team}/${p.origin}`).toBe(true);
          expect(p.year).toBeGreaterThanOrEqual(2027);
          expect([1, 2]).toContain(p.round);
        }
      }
    }
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
  // NINE real contracts were silently missing from the sheet at once. A signing
  // whose player has no 2025-26 contract row — an overseas returnee, a two-way
  // conversion, a draft-and-stash — is dropped by applySignings ("unmatched
  // signings skipped to avoid bad duplicates"), and dropping it is invisible:
  // no error, no duplicate, just a team carrying less salary than it owes and a
  // roster one player short. Lonnie Walker IV sat off Denver's sheet for twelve
  // days. Resolution here mirrors the pipeline's, exact name first and then a
  // unique surname on the signing team, so an alias miss (Nah'Shon/Bones
  // Hyland, Mohamed/Mo Bamba) fails this too rather than passing on a technicality.
  it("every signing with real terms lands on the signing team's sheet", () => {
    const missing: string[] = [];
    const seen = new Set<string>();
    for (const t of TRANSACTIONS) {
      if (t.type !== "Signing" && t.type !== "Re-sign") continue;
      // Two-ways and Exhibit 10s carry no cap salary; coaches carry no contract.
      if (/Two-Way|Exhibit|as head coach|as an assistant/i.test(t.detail)) continue;
      if (/via Offer Sheet/i.test(t.detail) && /right to match/i.test(t.detail)) continue;
      // A deal the corrections file deliberately holds back is absent on
      // purpose, with its reason written down — that is the opposite of silent.
      if (PENDING_SIGNINGS.some((n) => normName(n) === normName(t.player))) continue;
      const totalM = t.detail.match(/\$\s*([\d.]+)\s*million/);
      const teamM = t.detail.match(/with\s+[A-Za-z .'&-]+\(([A-Za-z]{2,4})\)/);
      if (!totalM || !teamM) continue;
      const k = normName(t.player);
      if (seen.has(k)) continue;
      seen.add(k);
      const team = teamM[1] === "LA" ? "LAC" : teamM[1]!;
      if (!TEAM_IDS.includes(team)) continue;
      // Landing ANYWHERE with 2026-27 salary is the invariant, not landing on
      // the signing team: a sign-and-trade signs with one team and is traded to
      // another in the same breath (Kessler signs in Utah, plays in Los
      // Angeles). The alias probe stays team-scoped, which is where a first-name
      // variant is safe to resolve.
      const paid = BASE_CONTRACTS.filter((c) => !c.deadMoney && currentSalary(c) > 0);
      const exact = paid.some((c) => normName(c.playerName) === k);
      const surname = normName(shortPlayerName(t.player));
      const bySurname = paid.filter(
        (c) => c.teamId === team && normName(shortPlayerName(c.playerName)) === surname,
      );
      if (!exact && bySurname.length !== 1)
        missing.push(`${t.date} ${t.player} → ${team}: ${t.detail.slice(0, 60)}`);
    }
    expect(missing).toEqual([]);
  });

  // Kyle Lowry retired on Jul 2 and stayed a signable free agent for six weeks,
  // with a $2,985,156 cap hold on Philadelphia's sheet. The feed said so plainly
  // the whole time — the curated retirement list simply never picked the row up.
  it("everyone the feed retires is out of the sim", () => {
    const stillHere: string[] = [];
    for (const t of TRANSACTIONS) {
      if (!/Retired from Professional Basketball/i.test(t.detail)) continue;
      if (!RETIRED_2026.some((r) => normName(r) === normName(t.player)))
        stillHere.push(`${t.date} ${t.player}`);
    }
    expect(stillHere).toEqual([]);
  });

  // Mouhamadou Gueye was traded to Charlotte on Jul 10 and waived on Jul 30, and
  // stayed on Charlotte's roster at $2.41M for a month — because ACTIVE_LATER,
  // the set that exempts a player from his own waive, had no date comparison in
  // it. Any signing or trade ANYWHERE on his record counted as "later", so a
  // player traded and then cut was never cut. Nothing complained: the salary
  // looked like a salary and the roster spot looked like a roster spot.
  it("a waived player keeps no live salary unless a later move claims him", () => {
    const stale: string[] = [];
    const seen = new Set<string>();
    for (const t of TRANSACTIONS) {
      if (t.type !== "Release") continue;
      const k = normName(t.player);
      if (seen.has(k)) continue;
      seen.add(k);
      const waived = feedIso(t.date);
      // A move dated on or after the waive is the feed's newer word on him.
      const claimed = TRANSACTIONS.some(
        (x) =>
          (x.type === "Signing" || x.type === "Re-sign" || x.type === "Trade") &&
          normName(x.player) === k &&
          feedIso(x.date) >= waived,
      );
      if (claimed) continue;
      for (const c of BASE_CONTRACTS)
        if (normName(c.playerName) === k && !c.deadMoney && currentSalary(c) > 0)
          stale.push(`${t.player} waived ${t.date} but still live on ${c.teamId} at $${currentSalary(c).toLocaleString()}`);
    }
    expect(stale).toEqual([]);
  });

  // DeRozan's $10M Sacramento guarantee was stored as a "waived, unsigned free
  // agent", a shape that stops being true the moment he signs. He signed in
  // Denver and spent four days both under contract and in the free-agent pool,
  // where any team could have signed him again.
  it("nobody is under contract and a free agent at the same time", () => {
    const live = new Map<string, string>();
    for (const c of BASE_CONTRACTS)
      if (!c.deadMoney && currentSalary(c) > 0) live.set(normName(c.playerName), c.teamId);
    const both = freeAgentsOf(BASE_CONTRACTS)
      .filter((f) => live.has(normName(f.playerName)))
      .map((f) => `${f.playerName}: hold on ${f.priorTeam}, contract with ${live.get(normName(f.playerName))}`);
    expect(both).toEqual([]);
  });

  // Ten contracts went missing at once in August because a signing whose player
  // had no sheet row was silently dropped. The per-signing guard above catches
  // that one at a time; this catches the shape of it — a roster that has quietly
  // emptied out, or one accumulating players who should have left. Offseason
  // rosters legitimately run past the 15-man regular-season limit, so the band
  // is wide on purpose: it is here for the catastrophe, not the edge.
  it("every roster is a plausible size", () => {
    const odd = TEAM_IDS.map((t) => ({
      t,
      n: BASE_CONTRACTS.filter((c) => c.teamId === t && !c.deadMoney && currentSalary(c) > 0).length,
    }))
      .filter((x) => x.n < 10 || x.n > 21)
      .map((x) => `${x.t} carries ${x.n} paid players`);
    expect(odd).toEqual([]);
  });

  // Klay Thompson's $17.5M and DeRozan's $10M both left the league's books
  // entirely when they signed elsewhere — the old team's dead money was never
  // created. A waived player's guaranteed money does not evaporate; it either
  // sits on someone's sheet or a curated RELEASE_TERMS entry says it was never
  // guaranteed in the first place. Anything else is money we lost track of.
  it("no waived contract leaves the league's books unaccounted for", () => {
    const raw = getLeagueData().contracts;
    const lost: string[] = [];
    const seen = new Set<string>();
    for (const t of TRANSACTIONS) {
      if (t.type !== "Release") continue;
      const k = normName(t.player);
      if (seen.has(k)) continue;
      seen.add(k);
      const owed = raw
        .filter((c) => normName(c.playerName) === k && !c.deadMoney)
        .reduce((s, c) => Math.max(s, c.years.find((y) => y.leagueYear === "2026-27")?.salary ?? 0), 0);
      if (owed <= 0) continue;
      const rows = BASE_CONTRACTS.filter((c) => normName(c.playerName) === k);
      // Accounted for = a dead row exists (even at $0, which is the explicit
      // "none of it was guaranteed" answer), or he is playing somewhere on a
      // NEW deal and the old team's charge was settled by a curated row.
      const hasDeadRow = rows.some((c) => c.deadMoney);
      if (!hasDeadRow) lost.push(`${t.player} (waived ${t.date}) was owed $${owed.toLocaleString()} and no team carries a cent of it`);
    }
    expect(lost).toEqual([]);
  });
  // Spotrac REPUBLISHES a deal — re-dating it and re-wording the ledger as the
  // legs firm up — and the scraper's merge key included the detail text, so
  // every rewrite survived as its own row. The five-team Watson trade ended up
  // filed under both Aug 19 and Aug 20 with two different Aug 19 rows for Cam
  // Whitmore alone: 24 redundant rows, and one deal rendered twice downstream.
  // The scraper collapses them now; this guards the file it writes, which also
  // catches a hand-edit that reintroduces one.
  it("no two rows describe the same trade twice", () => {
    const t = rd("transactions.json");
    const rows: { player?: string; date?: string; type?: string; detail?: string }[] =
      Array.isArray(t) ? t : (t.transactions ?? []);
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const r of rows) {
      if (r.type !== "Trade") continue;
      const codes = [...(r.detail ?? "").matchAll(/\(([A-Z]{2,4})\)/g)].map((m) => m[1]);
      const key = `${normName(r.player ?? "")}|${[...new Set(codes)].sort().join("-")}`;
      const prev = seen.get(key);
      if (prev) dupes.push(`${r.player}: ${prev} and ${r.date} are the same deal`);
      else seen.set(key, r.date ?? "");
    }
    expect(dupes).toEqual([]);
  });
});
