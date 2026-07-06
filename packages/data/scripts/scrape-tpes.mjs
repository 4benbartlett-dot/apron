// Scrape the league's ACTIVE traded-player exceptions (TPEs) via Firecrawl,
// cross-checked across two independent sources:
//
//   1. Spotrac      https://www.spotrac.com/nba/transactions/trade-exceptions
//   2. SalarySwish  https://www.salaryswish.com/trade-exception
//
// (RealGM has no TPE tracker page — its /nba/info/trade_exceptions path soft-404s
// to the wiretap sidebar, and no exception page exists in its nav index.)
//
// Cross-check rules:
//   - rows present in both sources -> sources: ["spotrac","salaryswish"]
//   - rows in only one source -> included, flagged "singleSource": true
//   - amount mismatches -> resolved against the originating player's salary
//     (contracts-2025-26.json) for the league year the TPE arose in; if not
//     determinable, keep Spotrac's number and flag it
//   - expiry-date mismatches -> keep Spotrac's date, flag both values
//
// NOTE (§6(n)(2), 2023 CBA): a team that used cap room this offseason has
// renounced its outstanding TPEs. We do NOT filter those rows here — the app
// decides with FEED_TEAM_STATE. Every scraped, unexpired row is included.
//
//   node packages/data/scripts/scrape-tpes.mjs

import { writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");
const AS_OF = "2026-07-05";

const SPOTRAC_URL = "https://www.spotrac.com/nba/transactions/trade-exceptions";
const SWISH_URL = "https://www.salaryswish.com/trade-exception";

function getKey() {
  if (process.env.FIRECRAWL_API_KEY) return process.env.FIRECRAWL_API_KEY;
  const env = readFileSync(join(homedir(), ".env"), "utf8");
  const m = env.match(/FIRECRAWL_API_KEY=(\S+)/);
  if (!m) throw new Error("FIRECRAWL_API_KEY not found");
  return m[1];
}

async function scrape(url, key) {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  const j = await res.json();
  if (!j.success) throw new Error(`Firecrawl failed for ${url}`);
  return j.data.markdown;
}

// ---- team-code normalization ------------------------------------------------
const CODE_FIX = { WSH: "WAS", GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", PHO: "PHX", BRK: "BKN", CHO: "CHA", UTAH: "UTA" };
const normTeam = (c) => CODE_FIX[c] ?? c;

// ---- helpers ----------------------------------------------------------------
const stripDiacritics = (s) => s.normalize("NFD").replace(/\p{M}/gu, "");
const nameKey = (s) =>
  stripDiacritics(s)
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
const money = (s) => Number(String(s).replace(/[$,]/g, ""));

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
const sameName = (a, b) => a === b || editDistance(a, b) <= 2;

const MONTHS = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
function isoFromLong(s) {
  // "Feb 5, 2027" -> "2027-02-05"
  const m = s.match(/([A-Za-z]{3})[a-z]* (\d{1,2}), (\d{4})/);
  return `${m[3]}-${MONTHS[m[1]]}-${String(m[2]).padStart(2, "0")}`;
}
function isoFromSlash(s) {
  // "02/05/2027" -> "2027-02-05"
  const [mm, dd, yyyy] = s.split("/");
  return `${yyyy}-${mm}-${dd}`;
}
// league year a date falls in: Jul 1 – Jun 30
function leagueYearOf(iso) {
  const [y, m] = iso.split("-").map(Number);
  const start = m >= 7 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

// ---- salary lookup (for amount-mismatch resolution) --------------------------
const contracts = JSON.parse(readFileSync(join(SRC, "contracts-2025-26.json"), "utf8")).contracts;
const salariesByName = new Map(); // nameKey -> [{leagueYear, salary}]
for (const c of contracts) {
  const k = nameKey(c.playerName);
  if (!salariesByName.has(k)) salariesByName.set(k, []);
  salariesByName.get(k).push(...c.years.map((y) => ({ leagueYear: y.leagueYear, salary: y.salary })));
}
function salariesFor(player, leagueYear) {
  // exact nameKey match first; fuzzy (typo-tolerant) only as a fallback so
  // near-collisions like Devin Carter / Jevon Carter can't shadow the real player
  const target = nameKey(player);
  const exact = salariesByName.get(target);
  const pools = exact
    ? [exact]
    : [...salariesByName.entries()].filter(([k]) => sameName(k, target)).map(([, v]) => v);
  const out = [];
  for (const years of pools)
    for (const y of years) if (y.leagueYear === leagueYear) out.push(y.salary);
  return out;
}

// ---- parse Spotrac -----------------------------------------------------------
// | 02/05/2027 | [![](img) BOS](url) | Anfernee Simons trade with CHI<br>(offsets) | $27,678,571 | **$27,678,571** |
function parseSpotrac(md) {
  const re =
    /^\|\s*(\d{2}\/\d{2}\/\d{4})\s*\|\s*\[!\[\]\([^)]*\)\s*([A-Z]{2,4})\]\([^)]*\)\s*\|\s*([^|]*?)\s*\|\s*\$([\d,]+)\s*\|\s*\*\*\$([\d,]+)\*\*\s*\|/;
  const rows = [];
  for (const line of md.split("\n")) {
    const m = line.match(re);
    if (!m) continue;
    const [, expRaw, teamRaw, notes, origRaw, availRaw] = m;
    const first = notes.split("<br>")[0].trim();
    const player = first.replace(/\s+trade with\s+[A-Z]{2,4}\s*$/, "").trim();
    rows.push({
      team: normTeam(teamRaw),
      player,
      expires: isoFromSlash(expRaw),
      original: money(origRaw),
      amount: money(availRaw),
    });
  }
  return rows;
}

// ---- parse SalarySwish --------------------------------------------------------
// | [![Logo...](img)Atlanta HawksATL](url) | [Clint Capela](url) | [$6,700,000](url) | $5,158,080 ![..] | $1,541,920 | Jul 6, 2025 | Jul 6, 2026 |
function parseSwish(md) {
  const re =
    /^\|\s*\[!\[[^\]]*\]\([^)]*\)[^|\]]*?([A-Z]{2,4})\]\([^)]*\)\s*\|\s*\[([^\]]+)\]\([^)]*\)\s*\|\s*\[\$([\d,]+)\]\([^)]*\)\s*\|\s*\$([\d,]+)[^|]*\|\s*\$([\d,]+)\s*\|\s*([A-Za-z]{3} \d{1,2}, \d{4})\s*\|\s*([A-Za-z]{3} \d{1,2}, \d{4})\s*\|/;
  const rows = [];
  const seen = new Set();
  for (const line of md.split("\n")) {
    const m = line.match(re);
    if (!m) continue;
    const [, teamRaw, player, origRaw, usedRaw, remainRaw, startRaw, endRaw] = m;
    const row = {
      team: normTeam(teamRaw),
      player: player.trim(),
      expires: isoFromLong(endRaw),
      start: isoFromLong(startRaw),
      original: money(origRaw),
      used: money(usedRaw),
      amount: money(remainRaw),
    };
    const k = `${row.team}|${row.player}|${row.original}|${row.expires}`;
    if (seen.has(k)) continue; // the table renders twice in the markdown
    seen.add(k);
    rows.push(row);
  }
  return rows;
}

// ---- scrape both -------------------------------------------------------------
const key = getKey();
const [spotracMd, swishMd] = await Promise.all([scrape(SPOTRAC_URL, key), scrape(SWISH_URL, key)]);
const spotrac = parseSpotrac(spotracMd);
const swish = parseSwish(swishMd);
if (spotrac.length < 10) throw new Error(`Spotrac parse suspiciously small: ${spotrac.length}`);
if (swish.length < 10) throw new Error(`SalarySwish parse suspiciously small: ${swish.length}`);
console.log(`scraped: spotrac=${spotrac.length} rows, salaryswish=${swish.length} rows`);

// ---- merge + cross-check -----------------------------------------------------
const discrepancies = [];
const rows = [];
const swishMatched = new Set();

for (const sp of spotrac) {
  if (sp.expires < AS_OF) continue; // expired before asOf
  const cand = swish.find(
    (sw, i) => !swishMatched.has(i) && sw.team === sp.team && sameName(nameKey(sw.player), nameKey(sp.player)),
  );
  const row = {
    team: sp.team,
    player: sp.player,
    amount: sp.amount,
    expires: sp.expires,
  };
  if (sp.original !== sp.amount) row.original = sp.original;

  if (!cand) {
    row.singleSource = true;
    row.sources = ["spotrac"];
    rows.push(row);
    continue;
  }
  swishMatched.add(swish.indexOf(cand));
  row.sources = ["spotrac", "salaryswish"];
  row.player = cand.player; // SalarySwish spellings are cleaner (Spotrac: "Kelly Olynk", "De'Andrew Hunter")

  if (cand.original !== sp.original || cand.amount !== sp.amount) {
    // resolve against the originating player's salary in the league year the TPE arose
    const ly = leagueYearOf(cand.start);
    const sals = salariesFor(cand.player, ly);
    const spHit = sals.includes(sp.original);
    const swHit = sals.includes(cand.original);
    let picked;
    if (spHit && !swHit) picked = "spotrac";
    else if (swHit && !spHit) picked = "salaryswish";
    else if (spHit && swHit) picked = sp.amount <= cand.amount ? "spotrac" : "salaryswish"; // originals agree with salary; trust the source that recorded usage
    if (picked === "salaryswish") {
      row.amount = cand.amount;
      if (cand.original !== cand.amount) row.original = cand.original;
      else delete row.original;
    }
    discrepancies.push({
      kind: "amount",
      team: row.team,
      player: row.player,
      spotrac: { original: sp.original, available: sp.amount },
      salaryswish: { original: cand.original, available: cand.amount },
      salaryLookup: sals,
      resolution: picked ? `${picked} (checked vs ${ly} salary)` : "unresolved — kept spotrac, flagged",
    });
    if (!picked) row.amountMismatch = { spotrac: sp.amount, salaryswish: cand.amount };
  }

  if (cand.expires !== sp.expires) {
    discrepancies.push({
      kind: "expires",
      team: row.team,
      player: row.player,
      spotrac: sp.expires,
      salaryswish: cand.expires,
      resolution: "kept spotrac, flagged",
    });
    row.expiresMismatch = { spotrac: sp.expires, salaryswish: cand.expires };
  }
  rows.push(row);
}

// SalarySwish-only rows
swish.forEach((sw, i) => {
  if (swishMatched.has(i) || sw.expires < AS_OF) return;
  const row = { team: sw.team, player: sw.player, amount: sw.amount, expires: sw.expires, singleSource: true, sources: ["salaryswish"] };
  if (sw.original !== sw.amount) row.original = sw.original;
  rows.push(row);
});

rows.sort((a, b) => (a.team < b.team ? -1 : a.team > b.team ? 1 : b.amount - a.amount));

const out = {
  asOf: AS_OF,
  source: "Spotrac (spotrac.com/nba/transactions/trade-exceptions) + SalarySwish (salaryswish.com/trade-exception)",
  availabilityNote:
    "Per CBA §6(n)(2), a team that used cap room this offseason has renounced its outstanding TPEs. Rows are NOT filtered for that here — the app decides with FEED_TEAM_STATE.",
  rows,
};
writeFileSync(join(SRC, "trade-exceptions.json"), JSON.stringify(out, null, 2));

// ---- report -------------------------------------------------------------------
const both = rows.filter((r) => !r.singleSource).length;
const single = rows.filter((r) => r.singleSource);
console.log(`\ntrade-exceptions.json: ${rows.length} active TPEs across ${new Set(rows.map((r) => r.team)).size} teams`);
console.log(`  agree across both sources: ${both}`);
console.log(`  single-source rows (flagged): ${single.length}`);
for (const r of single) console.log(`    [${r.sources[0]}] ${r.team} ${r.player} $${r.amount.toLocaleString()} exp ${r.expires}`);
console.log(`  discrepancies: ${discrepancies.length}`);
for (const d of discrepancies)
  console.log(
    `    [${d.kind}] ${d.team} ${d.player}: spotrac=${JSON.stringify(d.spotrac)} salaryswish=${JSON.stringify(d.salaryswish)} -> ${d.resolution}`,
  );
console.log("\nsample rows:");
for (const r of rows.slice(0, 5)) console.log(`  ${JSON.stringify(r)}`);
