// Scrape Spotrac resource pages via Firecrawl: upcoming option/guarantee
// deadlines and extension-eligible players.
//
//   node scripts/scrape-spotrac-extras.mjs

import { writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src");

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
  if (!j.success) throw new Error("Firecrawl failed");
  return j.data.markdown;
}

// Parse Spotrac's deadline-style tables:
// | date | [Player](url) | ![](img) CODE | POS | KIND<br>..<br>year<br>..<br>note | $amount |
function parseRows(md) {
  const re =
    /^\|\s*([^|]+?)\s*\|\s*\[([^\]]+)\]\([^)]*\)\s*\|\s*(?:!\[\][^)]*\)\s*)?([A-Z]{2,4})\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|/;
  const rows = [];
  for (const line of md.split("\n")) {
    const m = line.match(re);
    if (!m) continue;
    const [, date, player, team, pos, statusBlock, amountRaw] = m;
    if (!/\d/.test(date)) continue; // skip header
    const parts = statusBlock.split("<br>").map((s) => s.trim()).filter(Boolean);
    const kind = parts[0] || "";
    const note = parts.slice(1).filter((p) => !/^\d{4}-\d{2}$/.test(p)).join(" — ");
    const amount = Number((amountRaw.match(/\$([\d,]+)/)?.[1] || "").replace(/,/g, "")) || 0;
    rows.push({ date: date.trim(), player: player.trim(), team: team.trim(), pos: pos.trim(), kind, amount, note });
  }
  return rows;
}

const key = getKey();

/** Never let an upstream markup change blank a file that currently has rows. */
function writeGuarded(file, rows, label) {
  const path = join(SRC, file);
  const had = (() => {
    try {
      return (JSON.parse(readFileSync(path, "utf8")).rows ?? []).length;
    } catch {
      return 0;
    }
  })();
  if (!rows.length && had) {
    throw new Error(
      `${label}: parsed 0 rows but ${file} currently has ${had}. Spotrac's markup likely ` +
        `changed — fix parseRows before rerunning. ${file} left untouched.`,
    );
  }
  writeFileSync(path, JSON.stringify({ rows }, null, 2));
  console.log(`${label}: ${rows.length} rows`);
}

const upcoming = parseRows(await scrape("https://www.spotrac.com/nba/transactions/upcoming", key));
writeGuarded("upcoming-deadlines.json", upcoming, "upcoming-deadlines");

// Spotrac's extension-eligible page lists UPCOMING windows only — a player
// drops off it the moment his window opens. Replacing the file therefore
// deletes exactly the players who ARE eligible right now, and
// isExtensionEligible() (which needs date <= today) goes false league-wide.
// An extension window that has opened does not close, so MERGE by player and
// let the fresh row win on collision.
const extEligible = parseRows(
  await scrape("https://www.spotrac.com/nba/transactions/upcoming/_/type/extension-eligible", key),
);
const mergedExt = (() => {
  const path = join(SRC, "extension-eligible.json");
  let prior = [];
  try {
    prior = JSON.parse(readFileSync(path, "utf8")).rows ?? [];
  } catch {
    /* first run */
  }
  const byPlayer = new Map(prior.map((r) => [r.player, r]));
  for (const r of extEligible) byPlayer.set(r.player, r);
  return [...byPlayer.values()];
})();
console.log(
  `extension-eligible: ${extEligible.length} scraped, ${mergedExt.length - extEligible.length} retained from prior pulls`,
);
writeGuarded("extension-eligible.json", mergedExt, "extension-eligible");
for (const r of extEligible.slice(0, 5)) console.log(`  ${r.player} (${r.team}) — ${r.kind}`);
