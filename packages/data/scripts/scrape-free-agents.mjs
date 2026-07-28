// Scrape Spotrac's 2026 free-agents page (via Firecrawl) to get each free
// agent's Bird status (Bird / Early Bird / Non-Bird) and UFA/RFA restriction.
//
//   node scripts/scrape-free-agents.mjs
//
// Reads FIRECRAWL_API_KEY from the environment or ~/.env. Output keys each
// player by a normalized name so it can be joined to the Basketball-Reference
// contract data.

import { writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "free-agents.json");
const URL = "https://www.spotrac.com/nba/free-agents/_/year/2026";

function getKey() {
  if (process.env.FIRECRAWL_API_KEY) return process.env.FIRECRAWL_API_KEY;
  const env = readFileSync(join(homedir(), ".env"), "utf8");
  const m = env.match(/FIRECRAWL_API_KEY=(\S+)/);
  if (m) return m[1];
  throw new Error("FIRECRAWL_API_KEY not found in env or ~/.env");
}

/** Normalize a player name for joining across sources (strip diacritics/punct). */
export function normName(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’`-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const BIRD = { Bird: "bird", "Non-Bird": "non_bird", "Early Bird": "early_bird" };

const ROW =
  /\[([^\]]+)\]\(https:\/\/www\.spotrac\.com\/nba\/player\/_\/id\/\d+\/[^)]*\)\s*\|\s*([A-Z/]+)\s*\|\s*([\d.]+)\s*\|\s*(\d+)\s*\|\s*!\[\]\([^)]*\)([A-Za-z0-9_]+)\s*\|\s*\$?([\d,]+|[—-]+)\s*\|\s*([^|]+?)\s*\|/g;

async function main() {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${getKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url: URL, formats: ["markdown"], onlyMainContent: true, maxAge: 0 }),
  });
  const j = await res.json();
  if (!j.success) throw new Error("Firecrawl failed: " + JSON.stringify(j).slice(0, 200));
  const md = j.data.markdown;

  const byName = {};
  let m;
  while ((m = ROW.exec(md))) {
    const [, name, , , , team, , typeRaw] = m;
    const parts = typeRaw.split("/").map((s) => s.trim());
    const restriction = parts[0]; // UFA / RFA / Two-Way
    const birdStatus = parts.length > 1 ? BIRD[parts[1]] : undefined;
    byName[normName(name)] = { name, team, restriction, birdStatus };
  }

  const count = Object.keys(byName).length;
  // Guard against an upstream markup change silently blanking the pool.
  if (count < 50) {
    const had = Object.keys(JSON.parse(readFileSync(OUT, "utf8")).byName ?? {}).length;
    throw new Error(
      `Parsed only ${count} free agents (expected 50+). Spotrac's markup likely changed — ` +
        `fix ROW before rerunning. ${OUT} left untouched (${had} rows).`,
    );
  }
  writeFileSync(
    OUT,
    JSON.stringify({ source: "Spotrac free agents (via Firecrawl)", byName }, null, 2),
  );
  console.log(`Wrote ${count} free agents -> ${OUT}`);
  const tally = {};
  for (const v of Object.values(byName)) tally[v.birdStatus ?? v.restriction] = (tally[v.birdStatus ?? v.restriction] ?? 0) + 1;
  console.log("Bird/type breakdown:", tally);
}

main();
