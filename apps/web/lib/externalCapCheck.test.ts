import { describe, it, expect } from "vitest";
import { teamSalary as engTeamSalary, apronTeamSalary } from "@apron/cba-engine";
import { BASE_CONTRACTS, TEAM_IDS, C, YEAR, leagueData, currentSalary, normName, ADOPTED_FILINGS, feedStateOf } from "@/lib/league";
import { TRANSACTIONS } from "@apron/data";
import { feedIso } from "@/lib/feedDate";
import ext from "../../../packages/data/src/external-cap-check.json";
import pages from "../../../packages/data/src/external-roster-check.json";
import capHits2027 from "../../../packages/data/src/spotrac-cap-hits-2027.json";

// ---------------------------------------------------------------------------
// THE OUTSIDE CHECK.
//
// Every other test here is internally consistent by construction: our engine
// against our data, which cannot catch a number that is wrong in both. This one
// diffs all 30 teams against Spotrac — an independent party computing the same
// quantities from the same league — twice over:
//
//   1. SALARY: our team salary against their active roster plus dead money.
//   2. APRON:  the engine's Apron Team Salary (Art. VII §2(e)) against the
//      figure their apron tracker prints. Their number decomposes exactly, on
//      every page we have read, as active + dead + unlikely incentives + the
//      §2(d)(1)(i)(F) addback for a 0/1-YOS free agent on a minimum. Ours is
//      built from the same parts, so the two agree wherever the salary does.
//
// Sep 22 2026: for two months this file bounded gaps it could only describe
// (Cleveland $31M for an unfiled Harden, "open, unattributed" on six teams,
// $63M league-wide). Pulling every team's cap table instead of the tracker's
// totals turned each gap into named rows — a back-solved raise shape, an
// incentive the sheet folded into salary, a two-way carrying phantom salary,
// a non-guaranteed option year the sheet omitted — and the sheet now books
// them. What is left is listed below, each with the reason it is left.
//
// Their figure is still not automatically right: Hyland's one-year minimum is
// deemed at the two-year figure under §3(f) here and not there, and their
// Lillard set-off is an arithmetic this sheet does not model. The point is
// that every disagreement is a sentence, not a bound.
//
// Refresh with: node packages/data/scripts/scrape-apron-tracker.mjs (totals)
//               node packages/data/scripts/scrape-external-rosters.mjs (pages)
// ---------------------------------------------------------------------------

type Page = { active: { name: string; cap: number; unlikely: number }[]; dead: { name: string; cap: number }[]; summary: { apronTotal: number } };
const page = (t: string) => (pages.byTeam as Record<string, Page>)[t]!;
const theirApron = (t: string) => (ext.byTeam as Record<string, { apronSalary: number }>)[t]!.apronSalary;
const theirSalary = (t: string) => {
  const p = page(t);
  return p.active.reduce((s, r) => s + r.cap, 0) + p.dead.reduce((s, r) => s + r.cap, 0);
};
const lg = leagueData(BASE_CONTRACTS);
const ourSalary = (t: string) => engTeamSalary(lg, t, YEAR);
const ourApron = (t: string) => apronTeamSalary(lg, t, C);
const M = (x: number) => `$${(x / 1e6).toFixed(2)}M`;

/**
 * Salary we have booked that Spotrac has not filed yet. They lag a few days on
 * a fresh signing; the morning after a deal our sheet reads high by exactly
 * that contract and their number is not wrong, just older.
 */
const FRESH_DAYS = 7;
const freshlySigned = (team: string): number => {
  const cutoff = new Date(`${pages.asOf}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - FRESH_DAYS);
  const floor = cutoff.toISOString().slice(0, 10);
  let sum = 0;
  const seen = new Set<string>();
  for (const t of TRANSACTIONS) {
    if (t.type !== "Signing" && t.type !== "Re-sign") continue;
    if (/extension/i.test(t.detail)) continue;
    const d = feedIso(t.date);
    if (!d || d < floor) continue;
    const k = normName(t.player);
    if (seen.has(k)) continue;
    seen.add(k);
    const onPage = page(team).active.some((r) => normName(r.name) === k);
    if (onPage) continue;
    const c = BASE_CONTRACTS.find((x) => normName(x.playerName) === k && !x.deadMoney && x.teamId === team);
    if (c) sum += currentSalary(c);
  }
  return sum;
};

/** How far apart we are once their filing lag is taken out. */
const gap = (t: string) => Math.max(0, Math.abs(ourSalary(t) - theirSalary(t)) - freshlySigned(t));

/**
 * Teams whose gap is explained, with the explanation and a ceiling on it. A
 * team may only be here while someone can say WHY, and the bound is what makes
 * it a check rather than an exemption.
 */
const EXPLAINED: Record<string, { maxGap: number; why: string }> = {
  MIL: {
    maxGap: 1_250_000,
    why: "Lillard's stretched dead money reads $22,516,603 a season here and $21,311,053 on Spotrac's Milwaukee page: they apply a set-off for the salary he signed for in Portland, an arithmetic this sheet does not model. The $1,205,550 is that set-off by their reckoning.",
  },
  WAS: {
    maxGap: 2_450_000,
    why: "Anthony Gill re-signed Sep 15–16 (Hoops Rumors: Washington's 15th standard contract; terms not released, 'likely another one-year, minimum-salary deal'), and Spotrac's own transactions feed has him signed at '1 year $3.07 million' — the 6-YOS minimum — which this sheet deems at the two-year $2,449,421 under §3(f). Spotrac's Washington cap page still lists 14 players and not him, two weeks on. Their tracker is the one behind.",
  },
};

/**
 * Teams whose APRON figure differs from Spotrac's by more than their salary
 * does, each with the reason. The apron is salary plus add-backs, so the
 * whole of this is an add-back one side counts and the other does not.
 */
const APRON_EXPLAINED: Record<string, { maxGap: number; why: string }> = {
  CHA: {
    maxGap: 300_000,
    why: "Spotrac's Charlotte apron carries $298,504 for Ryan Nembhard, waived Sep 26: the 0/1-YOS free-agent add-back (2026-27 two-year minimum $2,449,421 less his $2,150,917). The CBA does keep that add-back after a waive — §2(d)(1)(i)(F) reaches a contract that 'is terminated' — and the engine now does too. But it measures against the two-year minimum 'for the Salary Cap Year in which such Free Agent was signed', and his contract predates 2026-27 (Dallas exercised its 2026-27 option on Jun 29), which would make it $145,357. This sheet records no free-agent flag for a pre-2026 contract, so it books neither figure rather than guess between them.",
  },
  LAC: {
    maxGap: 265_000,
    why: "Spotrac's Clippers apron runs $260,173 above its own active roster plus dead money. The gap appeared on Sep 24 with Johni Broome's waive and is not itemized anywhere on the page — not an incentive, not a minimum add-back (Broome was a 2025 draft pick, not a free agent). Unresolved; $23.4M under the first apron either way.",
  },
  MEM: {
    maxGap: 265_000,
    why: "The same unexplained $260,173 as the Clippers, appearing on Sep 25 with D'Angelo Russell's waive; not itemized on Spotrac's Memphis page. Unresolved; $44.6M under the first apron either way.",
  },
};

/** Everyone else has to agree to within rounding: a feed row that says
 * "$2.15 million" for a $2,150,917 salary is the size of what is left. */
const ROUTINE_GAP = 1_000;

describe("our cap sheet against Spotrac's", () => {
  it("uses the same apron lines they publish", () => {
    // If this ever fails, one of us has the league's own constants wrong and
    // every comparison below is meaningless.
    expect(ext.lines.firstApron).toBe(C.firstApron);
    expect(ext.lines.secondApron).toBe(C.secondApron);
  });

  it("covers all 30 teams, on both the tracker and the pages", () => {
    expect(Object.keys(ext.byTeam).sort()).toEqual([...TEAM_IDS].sort());
    expect(Object.keys(pages.byTeam).sort()).toEqual([...TEAM_IDS].sort());
    for (const t of TEAM_IDS) expect(page(t).summary.apronTotal, t).toBe(theirApron(t));
  });

  it("no team's salary drifts further than we have accounted for", () => {
    const over: string[] = [];
    for (const t of TEAM_IDS) {
      const g = gap(t);
      const limit = EXPLAINED[t]?.maxGap ?? ROUTINE_GAP;
      if (g > limit) over.push(`${t} differs by ${M(g)} (limit ${M(limit)}${EXPLAINED[t] ? ", explained" : ", routine"})`);
    }
    expect(over).toEqual([]);
  });

  it("the engine's apron salary reproduces their apron figure wherever the salary agrees", () => {
    // The apron figure is salary plus the add-backs. If salary agrees and the
    // apron does not, an incentive or an addback is missing — a data gap on
    // one side or the other, never a rounding.
    const off: string[] = [];
    for (const t of TEAM_IDS) {
      const salaryGap = ourSalary(t) - theirSalary(t) - (ourSalary(t) > theirSalary(t) ? freshlySigned(t) : 0);
      const apronGap = ourApron(t) - theirApron(t) - (ourApron(t) > theirApron(t) ? freshlySigned(t) : 0);
      const limit = APRON_EXPLAINED[t]?.maxGap ?? ROUTINE_GAP;
      if (Math.abs(apronGap - salaryGap) > limit) off.push(`${t}: salary off by ${M(salaryGap)}, apron off by ${M(apronGap)}`);
    }
    expect(off).toEqual([]);
  });

  it("the league-wide gap has not quietly grown", () => {
    // One number for the whole reconciliation. $75.4M when this check was
    // written, $63.0M on Sep 21 with Cleveland set aside, $1.6M on Sep 22
    // once every team's page had been read, and $3.65M on Oct 2: Gill's
    // minimum (Spotrac's page has not added him), Lillard's set-off, and
    // three rounding dollars. Spotrac moved toward this sheet in the window —
    // it now deems Hyland's minimum and carries Lillard's Portland salary
    // to the dollar — and reversed two figures it had changed (Okongwu,
    // Gardner) back to what the scraped sheet always said.
    const total = TEAM_IDS.reduce((s, t) => s + gap(t), 0);
    console.log(`  league-wide |gap|: ${M(total)}`);
    expect(total).toBeLessThan(4_000_000);
  });

  it("agrees on which teams are over which line", () => {
    // The tier is what governs what a team may DO — aggregate salaries, use a
    // mid-level, send cash — so a tier disagreement matters more than dollars.
    // Measured on apron salary, which is what the aprons are measured on.
    const tier = (x: number) =>
      x > C.secondApron ? "2A" : x > C.firstApron ? "1A" : x > C.luxuryTaxLine ? "tax" : "under";
    const differ = TEAM_IDS.filter((t) => tier(ourApron(t)) !== tier(theirApron(t)))
      .map((t) => `${t}: ours ${tier(ourApron(t))} (${M(ourApron(t))}) vs theirs ${tier(theirApron(t))} (${M(theirApron(t))})`);
    console.log(`  tier disagreements: ${differ.length}/30`);
    for (const d of differ) console.log(`    ${d}`);
    expect(differ).toEqual([]);
  });

  it("every filed figure the sheet adopted is one Spotrac lists on the same team", () => {
    // applyFiledSalaries replaces a back-solved first year with the filed one.
    // Each replacement is logged; here the log is checked against the pages
    // it came from, and the count is pinned so a silent widening of the rule
    // shows up as a number.
    for (const a of ADOPTED_FILINGS) {
      const row = page(a.team).active.find((r) => normName(r.name) === normName(a.player) || r.cap === a.to);
      expect(row, `${a.player} on ${a.team}`).toBeDefined();
      expect(row!.cap).toBe(a.to);
    }
    console.log(`  adopted filings: ${ADOPTED_FILINGS.length}`);
    expect(ADOPTED_FILINGS.length).toBeGreaterThan(40);
    expect(ADOPTED_FILINGS.length).toBeLessThan(80);
  });
});

// ---------------------------------------------------------------------------
// TRADE EXCEPTIONS. The ledger (trade-exceptions.json) merges Spotrac's and
// SalarySwish's exception lists; each Spotrac team page lists that team's
// exceptions again, which makes a third read. Every exception a page lists
// must be in the ledger at the page's amount, except where the page is the
// stale one — each such case named, with the reason.
// ---------------------------------------------------------------------------

type PageException = { type: string; reason: string; expires: string; available: number };
const PAGE_EXCEPTION_EXPLAINED: Record<string, string> = {
  "CHA|tyus jones":
    "Charlotte absorbed Rob Dillingham's $6,889,320 into the $7,000,000 Tyus Jones exception on Sep 27 (ESPN), leaving $110,680 — what Spotrac's exception page and SalarySwish both print. Spotrac's Hornets page still shows the full $7,000,000.",
};
const tpeKey = (team: string, player: string) =>
  `${team}|${player.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim()}`;
// Spotrac spells two names its own way on the team pages.
const PAGE_NAME_FIX: Record<string, string> = { "ryan nembard": "ryan nembhard", "deandrew hunter": "deandre hunter" };

describe("trade exceptions against Spotrac's team pages", () => {
  it("every exception a team page lists is in the ledger, at the page's amount", async () => {
    const { TRADE_EXCEPTIONS } = await import("@apron/data");
    const ledger = new Map(TRADE_EXCEPTIONS.filter((r) => r.expires >= pages.asOf).map((r) => [tpeKey(r.team, r.player), r]));
    const off: string[] = [];
    let n = 0;
    for (const [team, p] of Object.entries(pages.byTeam as Record<string, { exceptions?: PageException[] }>)) {
      for (const e of p.exceptions ?? []) {
        if (e.type !== "Trade" || e.available <= 0 || e.expires < pages.asOf) continue;
        n++;
        const raw = tpeKey(team, e.reason.replace(/ trade with [A-Z]{2,4}$/, ""));
        const [t, name] = raw.split("|") as [string, string];
        const key = `${t}|${PAGE_NAME_FIX[name] ?? name}`;
        const row = ledger.get(key);
        if (!row) off.push(`${key}: on the page ($${e.available.toLocaleString()}), not in the ledger`);
        else if (Math.abs(row.amount - e.available) > 2 && !PAGE_EXCEPTION_EXPLAINED[key])
          off.push(`${key}: ledger $${row.amount.toLocaleString()}, page $${e.available.toLocaleString()}`);
      }
    }
    console.log(`  ${n} exceptions on Spotrac's team pages; ledger holds ${ledger.size}`);
    expect(off).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// NEXT SEASON. The same diff one year out, against Spotrac's 2027-28 tables
// (spotrac-cap-hits-2027.json, written by scrape-external-rosters.mjs
// --year=2027). Every multi-year view on the site reads these seasons. Each
// team's active rows must agree to rounding except where the difference is
// named; dead money is left out because Spotrac's future tables list it only
// partly.
// ---------------------------------------------------------------------------


const NEXT_EXPLAINED: Record<string, { maxGap: number; why: string }> = {
  NOP: { maxGap: 20_150_000, why: "Saddiq Bey's $20,100,000 first extension season (Hoops Rumors, In The NO, SalarySwish). Spotrac's 2027-28 Pelicans table dropped him after Sep 22; an earlier pull of the same page carried him." },
  WAS: { maxGap: 8_050_000, why: "Tre Mann's $8,000,000 — the last season of the 3yr/$24M extension Charlotte gave him in Sep 2024 — is missing from Spotrac's 2027-28 Wizards table, though his 2026-27 season is on their 2026-27 one." },
  OKC: { maxGap: 650_000, why: "Shai Gilgeous-Alexander's supermax starts in 2027-28 at 35% of a cap nobody knows yet: $61,005,000 on the scraped sheet's projection, $61,600,000 on Spotrac's." },
  ATL: { maxGap: 30_000, why: "Corey Kispert: $13,050,000 on the scraped sheet, $13,025,000 on Spotrac's table." },
  TOR: { maxGap: 600_000, why: "Jamal Shead's 3yr/$24M extension (Oct 1). Nobody has reported the split: the sheet carries an estimated $7,407,407 at 8% raises, and Spotrac's Oct 14 table has a flat $8,000,000. Neither is a filing; re-check when one is." },
};

describe("next season's commitments against Spotrac's 2027-28 tables", () => {
  it("every team agrees within rounding, except where named", () => {
    const rows = Object.values((capHits2027 as { byName: Record<string, { team: string; cap: number }> }).byName);
    const theirs = (t: string) => rows.filter((r) => r.team === t).reduce((s, r) => s + r.cap, 0);
    const ours = (t: string) =>
      BASE_CONTRACTS.filter((c) => c.teamId === t && !c.deadMoney).reduce((s, c) => s + (c.years.find((y) => y.leagueYear === "2027-28")?.salary ?? 0), 0);
    const off: string[] = [];
    let total = 0;
    for (const t of TEAM_IDS) {
      const g = Math.abs(ours(t) - theirs(t));
      total += g;
      if (g > (NEXT_EXPLAINED[t]?.maxGap ?? ROUTINE_GAP)) off.push(`${t}: ours ${M(ours(t))}, theirs ${M(theirs(t))}`);
    }
    console.log(`  2027-28 league-wide |gap| on active rows: ${M(total)}`);
    expect(off).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// HARD CAPS AND EXCEPTIONS. Each Spotrac cap page says whether the team is
// hard-capped and how much of each exception it has used. Those are leads,
// not verdicts — Spotrac is sometimes the one that is wrong — so every team
// must agree with our feed state, or the disagreement is named here with
// which side is right and why. (The Oct 2 2026 audit that wrote this check
// corrected thirteen teams on OUR side, each confirmed by reporting or by
// the CBA arithmetic; see feed-team-state.json.)
// ---------------------------------------------------------------------------


const HARD_CAP_EXPLAINED: Record<string, string> = {
  POR: "Spotrac flags Portland hard-capped at the first apron, but no 2026-27 move triggers it: no exception use, no sign-and-trade acquisition, and no trade since Jul 1 (the Morant deal was Jun 29, in the 2025-26 league year, whose caps ended Jun 30). Their flag, not our omission.",
};
type PageExc = { type: string; original: number; available: number };
const usedOf = (ex: PageExc[], re: RegExp) => ex.filter((e) => re.test(e.type)).reduce((s, e) => s + (e.original - e.available), 0);
const EXCEPTION_EXPLAINED: Record<string, string> = {
  HOU: "Spotrac files Marcus Smart's $6,064,000 under the non-taxpayer mid-level; it is the taxpayer mid-level to the dollar, and Houston's second-apron hard cap (which both sides show) is the taxpayer one's.",
  GSW: "Golden State's taxpayer mid-level use (both sides show the second-apron cap it triggers) has no row on Spotrac's table.",
  MIN: "Kuminga's $6,064,000 is the taxpayer mid-level (ESPN, Hoops Rumors); Spotrac's table shows it unused while showing the second-apron cap it triggered.",
  LAL: "Spotrac's room exception is $9,369,000; the CBA figure for 2026-27 is $9,366,000, which is what Sexton's first year equals.",
  SAC: "Spotrac lists Achiuwa's bi-annual twice; it was used once.",
};

describe("hard caps and exception use against Spotrac's team pages", () => {
  const P = pages.byTeam as Record<string, { summary: { hardCap?: string | null }; exceptions?: PageExc[] }>;
  it("every team's hard cap agrees, except where named", () => {
    const off: string[] = [];
    for (const t of TEAM_IDS) {
      const theirs = P[t]!.summary.hardCap ?? null;
      const h = feedStateOf(t).hardCap;
      const ours = h === C.firstApron ? "first_apron" : h === C.secondApron ? "second_apron" : null;
      if (theirs !== ours && !HARD_CAP_EXPLAINED[t]) off.push(`${t}: ours ${ours ?? "none"}, theirs ${theirs ?? "none"}`);
    }
    expect(off).toEqual([]);
  });
  it("every team's mid-level and bi-annual use agrees, except where named", () => {
    const off: string[] = [];
    for (const t of TEAM_IDS) {
      if (EXCEPTION_EXPLAINED[t]) continue;
      const ex = P[t]!.exceptions ?? [];
      const c = feedStateOf(t).consumed;
      const mle = (c.ntmle ?? 0) + (c.tpmle ?? 0) + (c.room_mle ?? 0);
      const theirMle = usedOf(ex, /Mid-Level|^Room/);
      const theirBae = usedOf(ex, /Bi-Annual/);
      if (Math.abs(mle - theirMle) > 1_000) off.push(`${t}: mid-level used — ours $${mle.toLocaleString()}, theirs $${theirMle.toLocaleString()}`);
      if (Math.abs((c.bae ?? 0) - theirBae) > 1_000) off.push(`${t}: bi-annual used — ours $${(c.bae ?? 0).toLocaleString()}, theirs $${theirBae.toLocaleString()}`);
    }
    expect(off).toEqual([]);
  });
});
