// Scrape all 30 Spotrac team cap tables via Firecrawl — every player's 2026-27
// cap hit, base salary, likely and unlikely incentives and guarantee, plus each
// team's dead money, cap holds and the page's own totals — as an INDEPENDENT
// roster to diff ours against.
//
// Sep 22 2026: the page's "1st Apron Summary / Total Allocations" is the number
// their apron tracker prints, and it decomposes exactly: active roster + dead
// money + unlikely incentives + the Art. VII §2(d)(1)(i)(F) addback for a
// 0/1-YOS free agent on a minimum (Toronto's $264,305 was Alijah Martin's;
// Denver's $1,091,658 was Alpha Diallo's). Cap holds are NOT in it. Knowing
// the parts is what lets a team gap be attributed rather than bounded.
//
//   node scripts/scrape-external-rosters.mjs           # all 30
//   node scripts/scrape-external-rosters.mjs MEM DAL   # just these
//
// The apron tracker (scrape-apron-tracker.mjs) says WHICH teams disagree and by
// how much. This says WHY: it is the player-level version, and a team total is
// only ever wrong because of the names under it. Memphis read $9.4M light and
// the reason was three rows — a veteran minimum we never had, a forward we had
// filed under the wrong team, and an offer sheet booked at the wrong year one.
//
// Thirty Firecrawl calls, so this is NOT part of the routine refresh. Run it
// when the tracker shows drift worth chasing.
//
// Like the tracker, nothing in the app reads the output. It is evidence, not
// input: Spotrac lags filings we have already booked (Harden) and we have found
// numbers where our sheet matched the beat writers and theirs did not.

import { writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "external-roster-check.json");
// The one thing this scrape feeds INTO the sheet: per-player incentives, which
// Basketball-Reference's contract table does not carry and which decide Apron
// Team Salary (Art. VII §2(e)(1)(i) adds unlikely bonuses back).
const CAP_HITS = join(__dirname, "..", "src", "spotrac-cap-hits-2026.json");

const SLUGS = {
  ATL: "atlanta-hawks", BOS: "boston-celtics", BKN: "brooklyn-nets", CHA: "charlotte-hornets",
  CHI: "chicago-bulls", CLE: "cleveland-cavaliers", DAL: "dallas-mavericks", DEN: "denver-nuggets",
  DET: "detroit-pistons", GSW: "golden-state-warriors", HOU: "houston-rockets", IND: "indiana-pacers",
  LAC: "la-clippers", LAL: "los-angeles-lakers", MEM: "memphis-grizzlies", MIA: "miami-heat",
  MIL: "milwaukee-bucks", MIN: "minnesota-timberwolves", NOP: "new-orleans-pelicans",
  NYK: "new-york-knicks", OKC: "oklahoma-city-thunder", ORL: "orlando-magic",
  PHI: "philadelphia-76ers", PHX: "phoenix-suns", POR: "portland-trail-blazers",
  SAC: "sacramento-kings", SAS: "san-antonio-spurs", TOR: "toronto-raptors", UTA: "utah-jazz",
  WAS: "washington-wizards",
};

function getKey() {
  if (process.env.FIRECRAWL_API_KEY) return process.env.FIRECRAWL_API_KEY;
  const env = readFileSync(join(homedir(), ".env"), "utf8");
  const m = env.match(/FIRECRAWL_API_KEY=(\S+)/);
  if (!m) throw new Error("FIRECRAWL_API_KEY not found in env or ~/.env");
  return m[1];
}
const key = getKey();

// Raw markdown is cached under SPOTRAC_CACHE_DIR when set, so a parser change
// can be re-run against thirty pages without thirty more Firecrawl calls.
const CACHE = process.env.SPOTRAC_CACHE_DIR;
async function scrape(url, tries = 3) {
  const slug = url.replace(/[^a-z0-9]+/gi, "_");
  if (CACHE) {
    try {
      return readFileSync(`${CACHE}/${slug}.md`, "utf8");
    } catch {
      /* not cached */
    }
  }
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, maxAge: 0 }),
      });
      const j = JSON.parse(await res.text());
      if (j.success) {
        if (CACHE) writeFileSync(`${CACHE}/${slug}.md`, j.data.markdown);
        return j.data.markdown;
      }
    } catch (e) {
      // A dropped connection (ECONNRESET mid-run) is a retry, not a crash.
      console.error(`  retry ${i + 1}/${tries} for ${url}: ${e?.cause?.code ?? e?.message ?? e}`);
    }
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  return null;
}

const num = (s) => {
  const m = String(s ?? "").match(/([\d,]+)/);
  if (!m) return 0;
  const v = Number(m[1].replace(/,/g, ""));
  return /\$-|-\$/.test(String(s)) ? -v : v;
};

/**
 * The page is four tables and a summary. The active table's header reads
 * "Player (14 of 15 + 0 of 3 TW)"; its columns are Pos, Age, Type, Cap Hit,
 * % of cap, Base Salary, Likely, Unlikely, Trade Bonus Proration, Guaranteed
 * (a "-" is non-guaranteed). Dead money has "Pos |  |  | Cap Hit"; cap holds
 * carry a "Qualifying Offer" column and the player's Bird status; two-ways
 * (when listed) share the active columns.
 */
function parsePage(md) {
  const out = { active: [], twoWay: [], dead: [], holds: [], summary: {} };
  let section = null;
  for (const line of md.split("\n")) {
    if (/^\| Player \(\d+ of 15/.test(line)) { section = "active"; continue; }
    if (/^\| Player \(\d+\) \| Pos \| Age \| Type \| Cap Hit \| Cap Hit PctLeague Cap \| Qualifying Offer/.test(line)) { section = "holds"; continue; }
    if (/^\| Player \(\d+\) \| Pos \|  \|  \| Cap Hit/.test(line)) { section = "dead"; continue; }
    if (/^\| Player \(\d+ of 3 TW\)|^\| Player \(\d+\) \| Pos \| Age \| Type \| Cap Hit \| Cap Hit PctLeague Cap \| Base Salary/.test(line)) { section = "twoWay"; continue; }
    if (/^\| Type \| Reason/.test(line)) { section = "exceptions"; continue; }
    const sm = line.match(/^\| (Active Roster|Dead Money|Cap Hold|Total Allocations) \| \$?(-?[\d,$-]+) \|/);
    if (sm) {
      const k = sm[1], v = num(sm[2]);
      if (k === "Total Allocations") {
        if (out.summary.capTotal == null) out.summary.capTotal = v;
        else if (out.summary.apronTotal == null) out.summary.apronTotal = v;
      } else if (k === "Active Roster") out.summary.activeRoster = v;
      else if (k === "Dead Money") out.summary.deadMoney = v;
      else if (k === "Cap Hold") out.summary.capHold = v;
      continue;
    }
    const nm = line.match(/^\| [^|\[]*\[([^\]]+)\]\(https:\/\/www\.spotrac\.com\/nba\/player\/[^)]*\)([^|]*)\|(.*)$/);
    if (!nm || !section || section === "exceptions") continue;
    const name = nm[1].trim();
    const flag = nm[2].replace(/<br>/g, " ").trim();
    const cells = nm[3].split("|").map((c) => c.trim());
    if (section === "active" || section === "twoWay") {
      const [pos, , type, cap, , base, likely, unlikely, tradeBonus, guaranteed] = cells;
      out[section].push({
        name, pos, type: type || "", cap: num(cap), base: num(base), likely: num(likely), unlikely: num(unlikely),
        tradeBonus: num(tradeBonus), guaranteed: guaranteed === "-" ? 0 : num(guaranteed), nonGuaranteed: guaranteed === "-",
      });
    } else if (section === "dead") {
      out.dead.push({ name, flag, cap: num(cells[3]) });
    } else if (section === "holds") {
      const [pos, , type, cap, , qo, , , rights] = cells;
      out.holds.push({ name, pos, type: type || "", cap: num(cap), qo: num(qo), rights: rights || "" });
    }
  }
  return out;
}

const want = process.argv.slice(2).filter((a) => SLUGS[a]);
const teams = want.length ? want : Object.keys(SLUGS);
const prior = (() => {
  try {
    return JSON.parse(readFileSync(OUT, "utf8")).byTeam ?? {};
  } catch {
    return {};
  }
})();

const byTeam = { ...prior };
let failed = 0;
for (const t of teams) {
  const md = await scrape(`https://www.spotrac.com/nba/${SLUGS[t]}/cap/_/year/2026`);
  if (!md) {
    console.error(`  ${t}  FETCH FAILED — keeping any prior rows`);
    failed++;
    continue;
  }
  let page;
  try {
    page = parsePage(md);
  } catch (e) {
    console.error(`  ${t}  parse threw: ${e?.message ?? e} — keeping prior`);
    failed++;
    continue;
  }
  const n = page.active.length;
  // A team page that yields almost nothing parsed wrong; keep what we had.
  if (n < 8 || page.summary.apronTotal == null) {
    console.error(`  ${t}  parsed only ${n} players (apron ${page.summary.apronTotal ?? "?"}) — markup changed? keeping prior`);
    failed++;
    continue;
  }
  const sum = (xs, k) => xs.reduce((s, x) => s + (x[k] || 0), 0);
  const active = sum(page.active, "cap");
  if (page.summary.activeRoster != null && active !== page.summary.activeRoster)
    console.error(`  ${t}  active rows sum to ${active}, page says ${page.summary.activeRoster}`);
  byTeam[t] = page;
  console.log(
    `  ${t}  ${String(n).padStart(2)} players  active $${(active / 1e6).toFixed(1)}M  dead $${(sum(page.dead, "cap") / 1e6).toFixed(2)}M  unlikely $${(sum(page.active, "unlikely") / 1e6).toFixed(2)}M  apron $${(page.summary.apronTotal / 1e6).toFixed(1)}M`,
  );
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: "Spotrac team cap tables (via Firecrawl)",
      asOf: new Date().toISOString().slice(0, 10),
      note:
        "Player-level evidence for the team totals in external-cap-check.json, per team: the active table (cap hit, base, likely and unlikely incentives, guarantee, contract type), dead money, cap holds, and the page's own totals — `summary.apronTotal` is the apron tracker's figure and equals active + dead + unlikely + the 0/1-YOS minimum addback. Nothing in the app reads this; externalCapCheck.test.ts diffs against it. A name here we do not carry is a lead, not a verdict — Spotrac lags filings, their hold column keeps players who left the league years ago, and their 2026-27 column includes rows (non-guaranteed camp deals) we deliberately model differently.",
      byTeam,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\nWrote ${Object.keys(byTeam).length} teams -> ${OUT}${failed ? ` (${failed} failed)` : ""}`);

// Every active-roster row, keyed by normalized name (the join key league.ts
// uses), team kept for disambiguation. This file is an INPUT: the sheet reads
// each player's incentives from it, and a filed cap hit from it replaces a
// figure the sheet back-solved from a press-release total.
const normName = (name) =>
  name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[.'’`-]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "").replace(/\s+/g, " ").trim();
const byName = {};
for (const [team, page] of Object.entries(byTeam)) {
  if (!page.active) continue;
  for (const row of page.active) {
    if (!(row.cap > 0)) continue;
    const k = normName(row.name);
    if (byName[k] && byName[k].team !== team) console.error(`  cap hits: ${row.name} appears on ${byName[k].team} and ${team}`);
    byName[k] = { name: row.name, team, cap: row.cap, base: row.base, likely: row.likely, unlikely: row.unlikely, tradeBonus: row.tradeBonus, type: row.type, nonGuaranteed: row.nonGuaranteed };
  }
}
writeFileSync(
  CAP_HITS,
  JSON.stringify(
    {
      source: "Spotrac team cap tables (via Firecrawl)",
      asOf: new Date().toISOString().slice(0, 10),
      note:
        "Every 2026-27 active-roster row on Spotrac's cap tables: `cap` is their cap hit (base + likely incentives), `unlikely` the bonuses Art. VII §3(d) excludes from Salary and §2(e)(1)(i) adds back for Apron Team Salary, `type` their contract label, `nonGuaranteed` when the guarantee column is blank. league.ts reads two things from it: the incentives, stamped on each player's 2026-27 row so the engine's apronTeamSalary reproduces their apron figure; and the cap hit, which replaces a figure the sheet only back-solved from a reported total when the two are within 25% (a filing beats a raise-shape assumption — Coby White's 3yr/$74M descends from $26.8M, Trae Young's starts at the max). Curated stated salaries and deemed minimums are never replaced. A re-run of scrape-external-rosters.mjs rewrites this file.",
      byName,
    },
    null,
    2,
  ) + "\n",
);
console.log(`Wrote ${Object.keys(byName).length} active rows -> ${CAP_HITS}`);
