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
    // Full accolade set — factual honors, not vibes: All-NBA 1st/2nd/3rd,
    // All-Defensive, All-Star, MVP/DPOY/ROY/SMOY/MIP, championships, and the
    // fame composite. All-Defensive is how a Draymond's value gets captured.
    const g = (c) => r[idx[c]] || 0;
    const rec = { peakOvr: ovr, an1: g("an1"), an2: g("an2"), an3: g("an3"), ad: g("ad"), as: g("as"), mvp: g("mvp"), dpoy: g("dpoy"), roy: g("roy"), smoy: g("smoy"), mip: g("mip"), ring: g("ring"), fame: g("fame") };
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
