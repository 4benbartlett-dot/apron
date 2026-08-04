// Scrape Spotrac's NBA transactions feed via Firecrawl (Spotrac 403s direct
// scraping; Firecrawl renders + proxies past Cloudflare). Produces a structured
// recent-transactions list.
//
//   node scripts/scrape-transactions.mjs                    # since the newest row we already have
//   node scripts/scrape-transactions.mjs 2026-06-01 2026-07-28   # explicit window
//   node scripts/scrape-transactions.mjs --full              # the whole 2026 offseason
//
// Reads FIRECRAWL_API_KEY from the environment or ~/.env.
//
// The feed page renders at most ~50 rows per request, so a naive full-page pull
// silently truncates to the last few days. We therefore page by DATE WINDOW
// (Spotrac honors /_/start/<ISO>/end/<ISO>) and split any window that comes back
// saturated, which guarantees complete coverage of the requested range.
//
// Rows are MERGED into the existing file rather than replacing it: the feed only
// exposes a rolling window, and the older rows we already hold are still the
// provenance behind rosters. A run that parses nothing ABORTS without writing —
// an upstream markup change must never blank the feed.

import { writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "transactions.json");
const META = join(__dirname, "..", "src", "meta.json");
const BASE = "https://www.spotrac.com/nba/transactions";

/** Spotrac renders this many rows per request; a window that hits it is truncated. */
const PAGE_LIMIT = 50;
/** Earliest date worth pulling when --full is asked for (2026 league year opens Jun 30). */
const OFFSEASON_START = "2026-06-01";

function getKey() {
  if (process.env.FIRECRAWL_API_KEY) return process.env.FIRECRAWL_API_KEY;
  try {
    const env = readFileSync(join(homedir(), ".env"), "utf8");
    const m = env.match(/FIRECRAWL_API_KEY=(\S+)/);
    if (m) return m[1];
  } catch {
    /* ignore */
  }
  throw new Error("FIRECRAWL_API_KEY not found in env or ~/.env");
}

async function scrape(url, key) {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, maxAge: 0 }),
  });
  const j = await res.json();
  if (!j.success) {
    throw new Error("Firecrawl failed: " + JSON.stringify(j).slice(0, 200));
  }
  return j.data.markdown;
}

function classify(detail) {
  if (/Traded/i.test(detail)) return "Trade";
  if (/Re-Signed/i.test(detail)) return "Re-sign";
  if (/Agreed|Signed/i.test(detail)) return "Signing";
  if (/Extension|Extended/i.test(detail)) return "Extension";
  if (/Waived|Released/i.test(detail)) return "Release";
  if (/Qualifying/i.test(detail)) return "Qualifying Offer";
  if (/Option/i.test(detail)) return "Option";
  if (/Renounced/i.test(detail)) return "Renounce";
  return "Other";
}

// Each row spans two markdown lines:
//   - Jul 28, 2026  \- Trade![](…/nba_lac1.png)
//   Trade [Johni Broome (C)](…/johni-broome)Traded to LA (LAC) from Philadelphia (PHI) …
const ROW =
  /^-\s*([A-Z][a-z]{2}\s+\d{1,2},\s*\d{4})\s*\\?-\s*[A-Za-z ]+?!\[\]\([^)]*\)\s*\n\s*[A-Za-z ]+?\s*\[([^\]]+?)\s*\(([^)]*)\)\]\([^)]*\)(.*)$/gm;

function parse(md) {
  const txns = [];
  for (const m of md.matchAll(ROW)) {
    const [, date, name, pos, detailRaw] = m;
    const detail = detailRaw
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // unwrap links
      .replace(/\\([[\]])/g, "$1") // unescape \[ \]
      .replace(/\s+/g, " ")
      .trim();
    txns.push({
      player: name.trim(),
      pos: pos.trim(),
      date: date.trim(),
      type: classify(detail),
      detail,
    });
  }
  return txns;
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (isoStr, n) => {
  const d = new Date(isoStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
/** TODAY where the transactions happen, not in UTC.
 *
 * `end` is stamped into meta.json as rostersAsOf and printed in the site footer.
 * Taking it from toISOString() meant that from 5pm Pacific onward the date had
 * already rolled over in UTC, so an evening refresh advertised rosters "as of"
 * a day that had not happened yet. Date-only window arithmetic above stays on
 * UTC, where it is exact; only the wall-clock "today" needs to be local. */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Jul 28, 2026" -> "2026-07-28" (for ordering + window math). */
function toIso(mdy) {
  const m = mdy.match(/([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return "";
  const mm = String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0");
  return `${m[3]}-${mm}-${m[2].padStart(2, "0")}`;
}

/** Pull [start, end] inclusive, splitting any window that comes back saturated. */
async function pullWindow(start, end, key, out, depth = 0) {
  const url = `${BASE}/_/start/${start}/end/${end}`;
  const rows = parse(await scrape(url, key));
  const saturated = rows.length >= PAGE_LIMIT;
  console.log(`  ${start} → ${end}  ${String(rows.length).padStart(3)} rows${saturated ? "  (saturated — splitting)" : ""}`);
  if (saturated && start !== end && depth < 8) {
    // Split the window and recurse; a single saturated DAY is as fine as we can slice.
    const mid = iso(new Date((Date.parse(start + "T00:00:00Z") + Date.parse(end + "T00:00:00Z")) / 2));
    await pullWindow(start, mid, key, out, depth + 1);
    await pullWindow(addDays(mid, 1), end, key, out, depth + 1);
    return;
  }
  out.push(...rows);
}

// ----------------------------------------------------------------------------

const key = getKey();
const existing = (() => {
  try {
    return JSON.parse(readFileSync(OUT, "utf8"));
  } catch {
    return { transactions: [] };
  }
})();
const prior = existing.transactions ?? [];

const args = process.argv.slice(2).filter((a) => a !== "--full");
const full = process.argv.includes("--full");
const today = localToday();
let start = args[0];
let end = args[1] ?? today;
if (!start) {
  if (full || !prior.length) {
    start = OFFSEASON_START;
  } else {
    // Incremental: re-pull from a few days before our newest row so late-posted
    // rows (Spotrac backfills official dates) aren't missed.
    const newest = prior.map((t) => toIso(t.date)).filter(Boolean).sort().at(-1);
    start = newest ? addDays(newest, -3) : OFFSEASON_START;
  }
}

console.log(`Pulling Spotrac transactions ${start} → ${end}`);
const scraped = [];
await pullWindow(start, end, key, scraped);

if (!scraped.length) {
  console.error(
    `\nABORT: parsed 0 rows from ${start} → ${end}. Spotrac's markup probably changed —\n` +
      `fix the ROW regex before rerunning. ${OUT} left untouched (${prior.length} rows).`,
  );
  process.exit(1);
}

// Merge: scraped rows win on collision, prior rows survive.
const keyOf = (t) => `${t.date}|${t.player}|${t.detail}`;
const merged = new Map(prior.map((t) => [keyOf(t), t]));
let added = 0;
for (const t of scraped) {
  if (!merged.has(keyOf(t))) added++;
  merged.set(keyOf(t), t);
}
const transactions = [...merged.values()].sort((a, b) => toIso(b.date).localeCompare(toIso(a.date)));

writeFileSync(OUT, JSON.stringify({ source: "Spotrac (via Firecrawl)", transactions }, null, 2));
console.log(
  `\nScraped ${scraped.length} rows; ${added} new. Wrote ${transactions.length} total -> ${OUT}`,
);
for (const t of transactions.slice(0, 10)) {
  console.log(`  ${t.date} [${t.type}] ${t.player} — ${t.detail.slice(0, 72)}`);
}

// Stamp the snapshot date every time the feed is pulled.
writeFileSync(META, JSON.stringify({ rostersAsOf: end }, null, 2) + "\n");
console.log(`Stamped meta.json rostersAsOf = ${end}`);
