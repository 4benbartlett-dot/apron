// Scrape all 30 Spotrac team cap tables via Firecrawl — every player's 2026-27
// cap hit, as an INDEPENDENT roster to diff ours against.
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

async function scrape(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, maxAge: 0 }),
    });
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      if (j.success) return j.data.markdown;
    } catch {
      /* Firecrawl 502s with an HTML/plain body under load — retry rather than
         crash the whole 30-team run on one bad gateway. */
    }
    await new Promise((r) => setTimeout(r, 4000 * (i + 1)));
  }
  return null;
}

/**
 * A player row is a linked player name followed by dollar figures; the FIRST
 * figure on the row is the 2026-27 cap hit. Later sections of the page repeat
 * the same players with future-year money, so only a player's first appearance
 * counts — everything after it is a different season, not a different player.
 */
function parseRoster(md) {
  const seen = new Map();
  for (const line of md.split("\n")) {
    const nm = line.match(/\[([^\]]+)\]\((https:\/\/www\.spotrac\.com\/nba\/player\/[^)]*)\)/);
    if (!nm) continue;
    const name = nm[1].trim();
    if (!name || seen.has(name)) continue;
    const dollars = line.match(/\$([\d,]+)/);
    if (!dollars) continue;
    seen.set(name, Number(dollars[1].replace(/,/g, "")));
  }
  return Object.fromEntries(seen);
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
  const roster = parseRoster(md);
  const n = Object.keys(roster).length;
  // A team page that yields almost nothing parsed wrong; keep what we had.
  if (n < 8) {
    console.error(`  ${t}  parsed only ${n} players — markup changed? keeping prior`);
    failed++;
    continue;
  }
  byTeam[t] = roster;
  const total = Object.values(roster).reduce((s, v) => s + v, 0);
  console.log(`  ${t}  ${String(n).padStart(2)} players  $${(total / 1e6).toFixed(1)}M`);
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: "Spotrac team cap tables (via Firecrawl)",
      asOf: new Date().toISOString().slice(0, 10),
      note:
        "Player-level evidence for the team totals in external-cap-check.json. Nothing in the app reads this; externalCapCheck.test.ts diffs against it. A name here we do not carry is a lead, not a verdict — Spotrac lags filings, and their 2026-27 column includes rows (two-ways, non-guaranteed camp deals) we deliberately model differently.",
      byTeam,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\nWrote ${Object.keys(byTeam).length} teams -> ${OUT}${failed ? ` (${failed} failed)` : ""}`);
