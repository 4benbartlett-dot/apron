// Scrape Spotrac's league-wide 2026-27 APRON TRACKER via Firecrawl — every
// team's apron allocation, and whether Spotrac shows it hard-capped.
//
//   node scripts/scrape-apron-tracker.mjs
//
// Why this exists. Every other file here is an INPUT: contracts, transactions,
// exceptions, the things our team salary is computed FROM. This one is the
// only OUTPUT check — an independent party's answer to the same question, for
// all 30 teams at once, so a disagreement surfaces as a number instead of
// waiting for someone to tweet about the one team we happened to look at.
//
// It is deliberately not wired into the app. Nothing renders from it and no
// projection reads it; externalCapCheck.test.ts diffs against it and that is
// all. Their number is not automatically the right one — we have already found
// cases where ours reproduces the beat writers and theirs lags a filing — but
// an unexplained gap is a lead, and a gap we have explained belongs written
// down next to the explanation.

import { writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "external-cap-check.json");
const URL_ = "https://www.spotrac.com/nba/apron/_/year/2026";

function getKey() {
  if (process.env.FIRECRAWL_API_KEY) return process.env.FIRECRAWL_API_KEY;
  const env = readFileSync(join(homedir(), ".env"), "utf8");
  const m = env.match(/FIRECRAWL_API_KEY=(\S+)/);
  if (!m) throw new Error("FIRECRAWL_API_KEY not found in env or ~/.env");
  return m[1];
}

const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
  method: "POST",
  headers: { Authorization: `Bearer ${getKey()}`, "Content-Type": "application/json" },
  body: JSON.stringify({ url: URL_, formats: ["markdown"], onlyMainContent: true, maxAge: 0 }),
});
const j = await res.json();
if (!j.success) throw new Error("Firecrawl failed: " + JSON.stringify(j).slice(0, 200));
const md = j.data.markdown;

// Parsed by CELL rather than by one long regex. The first attempt matched 23 of
// 30 teams: every club OVER an apron renders its space as "$-5,764,492", with
// the dollar sign BEFORE the minus, and a pattern written for "-$5,764,492"
// misses exactly the teams this project cares most about. Splitting the row and
// reading the columns cannot fail that way.
//
//   | 24 | CLE [![](…) CLE](…) | $180,603,446 |  | $28,411,554 |  | $41,082,554 |
//     rank  team                 apron allocation  1A capped? space  2A capped? space

const TEAM_FIX = { WSH: "WAS", GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", PHO: "PHX", LA: "LAC" };
const num = (s) => Number(String(s).replace(/[^\d]/g, ""));
const yes = (s) => /yes|✔|✓|true/i.test(s ?? "");

const byTeam = {};
for (const line of md.split("\n")) {
  if (!/^\|\s*\d+\s*\|/.test(line)) continue; // rank-led data rows only
  const cells = line.split("|").slice(1, -1).map((c) => c.trim());
  if (cells.length < 7) continue;
  const code = cells[1].match(/^([A-Z]{2,3})\b/)?.[1];
  if (!code || !/\$[\d,]+/.test(cells[2])) continue;
  const team = TEAM_FIX[code] ?? code;
  byTeam[team] = {
    apronSalary: num(cells[2]),
    firstApronHardCapped: yes(cells[3]),
    secondApronHardCapped: yes(cells[5]),
  };
}

const n = Object.keys(byTeam).length;
// A partial parse is worse than none: it would look like 30 agreements and a
// handful of silently missing teams. All or nothing.
if (n !== 30) {
  console.error(
    `\nABORT: parsed ${n}/30 teams from the apron tracker. Spotrac's table markup probably changed —\n` +
      `fix the ROW regex before rerunning. ${OUT} left untouched.`,
  );
  process.exit(1);
}

const firstApron = num(md.match(/\*\*1ST APRON\*\*\s*\n+\s*\$([\d,]+)/)?.[1] ?? "0");
const secondApron = num(md.match(/\*\*2ND APRON\*\*\s*\n+\s*\$([\d,]+)/)?.[1] ?? "0");

writeFileSync(
  OUT,
  JSON.stringify(
    {
      source: "Spotrac NBA Team Apron Tracker (via Firecrawl)",
      url: URL_,
      asOf: new Date().toISOString().slice(0, 10),
      note:
        "An INDEPENDENT answer to the same question our sheet computes, for all 30 teams. Nothing in the app reads this; externalCapCheck.test.ts diffs against it so a disagreement is a number rather than a surprise. Their figure is not automatically correct — ours has reproduced beat-writer numbers Spotrac lagged on — but an unexplained gap is a lead.",
      lines: { firstApron, secondApron },
      byTeam,
    },
    null,
    2,
  ) + "\n",
);

console.log(`Wrote ${n} teams -> ${OUT}`);
console.log(`  1st apron $${firstApron.toLocaleString()} · 2nd apron $${secondApron.toLocaleString()}`);
for (const [t, v] of Object.entries(byTeam).sort((a, b) => b[1].apronSalary - a[1].apronSalary).slice(0, 5))
  console.log(`  ${t} $${v.apronSalary.toLocaleString()}`);
