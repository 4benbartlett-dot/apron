// Real, current injury FACTS from Basketball-Reference's injury report — keyed
// by the same player id as the rest of the data. Not a probabilistic "injury
// prone" tag: the actual reported injury (torn ACL, out for season, etc.), its
// date, and — for the majors that bleed into 2026-27 — a standard-recovery
// estimate of how many games a player is likely to miss to START next season.
//   node scripts/scrape-injuries.mjs
// Output: src/player-injuries-2026.json { byId: { id: { name, team, date, desc, type, status, gamesOut } } }
import { load } from "cheerio";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "player-injuries-2026.json");
const URL = "https://www.basketball-reference.com/friv/injuries.fcgi";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

// 2026-27 regular season window (for translating a recovery date into games missed).
const SEASON_START = new Date("2026-10-22");
const SEASON_END = new Date("2027-04-12");
const SEASON_DAYS = (SEASON_END - SEASON_START) / 86400000;

// Standard recovery windows (months) for the injuries that can carry into next
// season. Everything else is treated as healed over the offseason.
function recoveryMonths(desc) {
  const d = desc.toLowerCase();
  if (d.includes("achilles")) return 12;
  if (d.includes("acl")) return 11;
  if (d.includes("patellar") || d.includes("microfracture")) return 9;
  if ((d.includes("knee") && (d.includes("surg") || d.includes("torn") || d.includes("repair")))) return 6;
  if (d.includes("fracture") || d.includes("broken") || d.includes("stress")) return 4.5;
  if (d.includes("hip") && d.includes("surg")) return 6;
  if (d.includes("foot") && d.includes("surg")) return 5;
  return 0; // minor / soft-tissue / anything expected to heal by camp
}

function injuryType(desc) {
  const d = desc.toLowerCase();
  if (d.includes("achilles")) return "Torn Achilles";
  if (d.includes("acl")) return "Torn ACL";
  const m = desc.match(/\(([^)]+)\)/); // BRef puts the body part in parens
  return m ? m[1] : "Injury";
}

async function main() {
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const $ = load(await res.text());

  const byId = {};
  let majors = 0;
  $("#injuries tbody tr").each((_, tr) => {
    const $tr = $(tr);
    const href = $tr.find('a[href*="/players/"]').first().attr("href") || "";
    const id = (href.match(/\/players\/\w\/([^.]+)\.html/) || [])[1];
    if (!id) return;
    const name = $tr.find('a[href*="/players/"]').first().text().trim();
    const team = $tr.find('[data-stat="team_name"]').text().trim() || $tr.find("td").eq(0).text().trim();
    const date = $tr.find('[data-stat="date_update"]').text().trim() || $tr.find("td").eq(1).text().trim();
    const desc = $tr.find('[data-stat="note"]').text().trim() || $tr.find("td").last().text().trim();

    const type = injuryType(desc);
    const rmonths = recoveryMonths(desc);
    let gamesOut = 0;
    let status = "day-to-day";
    if (/out for season|will miss|ruled out for the remainder|shut down|undergo surg/i.test(desc)) status = "out";

    if (rmonths > 0) {
      const injuryDate = new Date(date);
      if (!isNaN(injuryDate)) {
        const back = new Date(injuryDate);
        back.setMonth(back.getMonth() + Math.round(rmonths));
        if (back >= SEASON_END) gamesOut = 82;
        else if (back > SEASON_START) gamesOut = Math.round(((back - SEASON_START) / 86400000 / SEASON_DAYS) * 82);
        else gamesOut = 0; // recovered before opening night
      }
      if (gamesOut >= 5) { status = gamesOut >= 70 ? "out (season)" : "out (early season)"; majors++; }
    }

    byId[id] = { name, team, date, desc: desc.slice(0, 200), type, status, gamesOut };
  });

  writeFileSync(OUT, JSON.stringify({ source: "Basketball-Reference injury report", asOf: "2026-07", byId }, null, 2) + "\n");
  const total = Object.keys(byId).length;
  console.log(`Wrote ${total} injury records -> ${OUT} (${majors} bleed into 2026-27)`);
  const bleed = Object.entries(byId).filter(([, v]) => v.gamesOut >= 5).sort((a, b) => b[1].gamesOut - a[1].gamesOut);
  for (const [id, v] of bleed) console.log(`  ${id.padEnd(11)} ${v.name.padEnd(20)} ${v.type.padEnd(14)} ~${v.gamesOut}g out — ${v.date}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
