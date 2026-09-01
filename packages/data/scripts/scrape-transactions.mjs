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
const CORRECTIONS = join(__dirname, "..", "src", "feed-corrections.json");
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
// Since late Aug 2026 the logo is a LINKED image with alt text:
//   - Aug 30, 2026  \- Waiver[![MIN](…/nba_min_2026.png)](…/team/109/overview)
// Both shapes are accepted; a pull that matched neither parsed 0 rows and
// (correctly) refused to write, which is how the change was noticed.
const ROW =
  /^-\s*([A-Z][a-z]{2}\s+\d{1,2},\s*\d{4})\s*\\?-\s*[A-Za-z ]+?\[?!\[[^\]]*\]\([^)]*\)(?:\]\([^)]*\))?\s*\n\s*[A-Za-z ]+?\s*\[([^\]]+?)\s*\(([^)]*)\)\]\([^)]*\)(.*)$/gm;

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

/**
 * Collapse REPUBLICATIONS of the same event.
 *
 * Spotrac rewrites a deal after it lands — re-dating it, and re-wording the
 * clause ledger as the legs firm up. Because the merge key includes the detail
 * text, every rewrite used to survive as its own row: the five-team Watson
 * trade ended up filed under both Aug 19 and Aug 20, with two different Aug 19
 * rows for Cam Whitmore alone. Downstream that is one deal shown twice.
 *
 * A TRADE is identified by its player and the SET of teams in its prose, which
 * keeps genuinely separate deals apart — Schröder moving CLE→CHA on Aug 14 is
 * {CHA,CLE}, and the five-teamer that moved him again is a five-team set.
 * Everything else is identified by player + date + type. The survivor is the
 * newest row, and among same-date rows the one with the longest detail, which
 * is the most completely enumerated version the feed has published.
 */
function collapse(rows, fresh) {
  const codes = (d) => [...new Set([...d.matchAll(/\(([A-Z]{2,4})\)/g)].map((m) => m[1]))].sort().join("-");
  const eventOf = (t) =>
    t.type === "Trade"
      ? `T|${t.player}|${codes(t.detail)}`
      : `${t.type}|${t.player}|${t.date}`;
  // Among same-date versions, one that came back in THIS pull is Spotrac's
  // current wording and beats one we only hold from an older pull. Spotrac
  // rewrites a waive in place when the team later stretches it — DeRozan's
  // Jul 6 row gained "via Stretch Provision" seven weeks after the fact — and
  // the old "leaves behind $10 million in dead cap" text happened to be one
  // character longer, so length alone kept the stale version forever.
  const best = new Map();
  for (const t of rows) {
    const k = eventOf(t);
    const prev = best.get(k);
    if (!prev) { best.set(k, t); continue; }
    const newer = toIso(t.date).localeCompare(toIso(prev.date));
    const fresher = (fresh.has(t) ? 1 : 0) - (fresh.has(prev) ? 1 : 0);
    if (newer > 0 || (newer === 0 && (fresher > 0 || (fresher === 0 && t.detail.length > prev.detail.length))))
      best.set(k, t);
  }
  return [...best.values()];
}

/**
 * Rows Spotrac published WRONG, fixed on every write (feed-corrections.json).
 *
 * The Aug 29 Minnesota–Utah trade came through as "Traded to Utah (UTA) from
 * Minnesota (MIN) as part of a 1-team trade:" for all three players, legs
 * omitted — which would have sent Cody Williams and John Konchar the wrong way
 * and parked Konchar's stretched dead money on the Jazz. Correcting the file
 * by hand lasts until the next pull re-merges the bad row; correcting it here
 * lasts until Spotrac fixes theirs, at which point the entry comes out.
 */
function correct(rows) {
  let fixes;
  try {
    fixes = JSON.parse(readFileSync(CORRECTIONS, "utf8")).corrections ?? [];
  } catch {
    return rows;
  }
  const byKey = new Map(fixes.map((f) => [`${f.date}|${f.player}|${f.type}`, f]));
  let applied = 0;
  const out = rows.map((t) => {
    const f = byKey.get(`${t.date}|${t.player}|${t.type}`);
    if (!f || f.detail === t.detail) return t;
    applied++;
    return { ...t, detail: f.detail, type: classify(f.detail) };
  });
  if (applied) console.log(`Applied ${applied} feed correction(s) from feed-corrections.json.`);
  return out;
}

const before = merged.size;
const transactions = correct(collapse([...merged.values()], new Set(scraped))).sort((a, b) =>
  toIso(b.date).localeCompare(toIso(a.date)),
);
if (before !== transactions.length)
  console.log(`Collapsed ${before - transactions.length} republished row(s) of events already held.`);

writeFileSync(OUT, JSON.stringify({ source: "Spotrac (via Firecrawl)", transactions }, null, 2));
console.log(
  `\nScraped ${scraped.length} rows; ${added} new. Wrote ${transactions.length} total -> ${OUT}`,
);
for (const t of transactions.slice(0, 10)) {
  console.log(`  ${t.date} [${t.type}] ${t.player} — ${t.detail.slice(0, 72)}`);
}

// Stamp the snapshot date every time the feed is pulled — forward only. An
// explicit historical window (re-pulling Jul 6 because Spotrac reworded a row)
// must not turn the footer's "rosters as of" back to July.
const stamped = (() => {
  try {
    return JSON.parse(readFileSync(META, "utf8")).rostersAsOf ?? "";
  } catch {
    return "";
  }
})();
if (end >= stamped) {
  writeFileSync(META, JSON.stringify({ rostersAsOf: end }, null, 2) + "\n");
  console.log(`Stamped meta.json rostersAsOf = ${end}`);
} else {
  console.log(`meta.json rostersAsOf stays ${stamped} (this pull ended ${end})`);
}
