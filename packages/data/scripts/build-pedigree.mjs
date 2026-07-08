// Star PEDIGREE from the 82orBust player database (peak career rating +
// accolades), matched by name to our BBRef player ids. This is the signal that
// an established star is an established star even when his current, aged, or
// injury-shortened season understates him — so an age-42 LeBron or a 20-game
// Anthony Davis still reads as impactful. The league.ts value model floors each
// player's current impact at his AGE-DECAYED pedigree.
//   node scripts/build-pedigree.mjs   (reads ~/Downloads/players.json once)
// Output: src/player-pedigree-2026.json { byId: { peakOvr, as, mvp, dpoy, ring, fame } }
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "player-pedigree-2026.json");
const SRC = join(homedir(), "Downloads", "players.json");

const nm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

function main() {
  const bb = JSON.parse(readFileSync(SRC, "utf8"));
  const { cols, names, rows } = bb;
  const idx = Object.fromEntries(cols.map((c, i) => [c, i]));
  // peak = the highest-OVR season row per player, carrying career accolade totals.
  const peak = {};
  for (const r of rows) {
    const name = names[r[idx.n]];
    if (!name) continue;
    const k = nm(name);
    const ovr = r[idx.ovr] || 0;
    const rec = { peakOvr: ovr, as: r[idx.as] || 0, mvp: r[idx.mvp] || 0, dpoy: r[idx.dpoy] || 0, ring: r[idx.ring] || 0, fame: r[idx.fame] || 0 };
    if (!peak[k] || ovr > peak[k].peakOvr) peak[k] = rec;
  }

  // map name → BBRef id from the contract + rookie sheets
  const read = (f) => JSON.parse(readFileSync(join(__dirname, "..", "src", f), "utf8"));
  const contracts = read("contracts-2025-26.json");
  const cRows = contracts.contracts || contracts;
  const rookies = read("rookies-2026.json");
  const rRows = Array.isArray(rookies) ? rookies : rookies.rookies || [];

  const byId = {};
  let matched = 0;
  for (const c of [...cRows, ...rRows]) {
    const p = peak[nm(c.playerName)];
    if (p && !byId[c.playerId]) { byId[c.playerId] = p; matched++; }
  }

  writeFileSync(OUT, JSON.stringify({ source: "82orBust peak ratings + accolades, matched by name", byId }, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(byId).length} pedigree records (${matched} matched) -> ${OUT}`);
}
main();
