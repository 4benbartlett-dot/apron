// Derive the DIMENSIONAL player model (offense / defense / playmaking /
// rebounding / spacing / rim protection / perimeter defense, each 0-100) from
// the scraped 2025-26 statistical profile. These feed the team-fit engine —
// the overall talent spine stays the validated Apron Value. Scale is calibrated
// to read like the 82orBust ratings (elite ≈ 90+, average ≈ 50, weak ≈ 25).
//   node scripts/build-dimensions.mjs
// Output: src/player-dimensions-2026.json { byId: { id: {off,def,play,reb,space,rim,perd,usg} } }
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(join(__dirname, "..", "src", f), "utf8"));
const OUT = join(__dirname, "..", "src", "player-dimensions-2026.json");

const STATS = read("player-stats-2026.json").byId;
const POS = read("positions-2026.json").byId;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(x) ? x : lo));
const n = (v, d = 0) => (Number.isFinite(v) ? v : d);

function dims(id, s) {
  const pos = POS[id] || "SF";
  const big = pos === "C" ? 1 : pos === "PF" ? 0.5 : 0;
  const guard = pos === "PG" || pos === "SG" ? 1 : pos === "SF" ? 0.5 : 0;

  // OFFENSE — offensive box plus/minus is the spine, nudged by scoring load.
  const off = clamp(50 + n(s.obpm) * 5.2 + (n(s.usg) - 20) * 0.25, 5, 100);

  // DEFENSE — defensive box plus/minus, with activity (blocks + steals) and a
  // little help from defensive win shares so bigs who anchor a scheme show up.
  const def = clamp(50 + n(s.dbpm) * 7.2 + (n(s.blkp) - 1.6) * 1.4 + (n(s.stlp) - 1.4) * 3.0 + n(s.dws) * 1.5, 5, 100);

  // PLAYMAKING — assist rate net of turnovers, on a curve that rewards true hubs.
  const play = clamp(9 + n(s.astp) * 1.5 - n(s.tovp) * 0.35, 3, 100);

  // REBOUNDING — total-rebound percentage, scaled so a 20%+ board man tops out.
  const reb = clamp(n(s.trbp) * 4.2 + 4, 3, 100);

  // SPACING — gravity needs BOTH volume and accuracy. Volume only counts when
  // it's accurate (defenses ignore a 32% chucker), so a true non-shooter and a
  // low-percentage-high-volume shooter both stay low.
  const vol = clamp(n(s.tpa) / 6.5, 0, 1.1);
  const acc = clamp((n(s.tpp) - 0.31) / 0.10, -1.4, 1.8);
  const accGate = clamp((n(s.tpp) - 0.31) / 0.06, 0, 1.2);
  const effVol = Math.min(1.2, vol * accGate);
  const space = clamp(42 + acc * 20 + effVol * 26 - (n(s.tpa) < 1 ? 8 : 0), 3, 100);

  // RIM PROTECTION — driven by block VOLUME (blocks/game, how much rim a player
  // actually erases when he's on the floor) plus block RATE and defensive box
  // impact; a small nudge for bigs. Volume is why a 1.7-bpg power forward
  // out-anchors a 1.1-bpg center on the same block rate.
  const rim = clamp(n(s.bpg) * 20 + n(s.blkp) * 6 + n(s.dbpm) * 2 + big * 6, 2, 100);

  // PERIMETER DEFENSE — steals + on-ball D signal, tilted toward guards/wings.
  const perd = clamp(46 + n(s.stlp) * 5.5 + n(s.dbpm) * 4.0 + guard * 6, 5, 100);

  return {
    off: Math.round(off * 10) / 10,
    def: Math.round(def * 10) / 10,
    play: Math.round(play * 10) / 10,
    reb: Math.round(reb * 10) / 10,
    space: Math.round(space * 10) / 10,
    rim: Math.round(rim * 10) / 10,
    perd: Math.round(perd * 10) / 10,
    usg: Math.round(n(s.usg, 18) * 10) / 10,
  };
}

const byId = {};
for (const [id, s] of Object.entries(STATS)) byId[id] = dims(id, s);
writeFileSync(OUT, JSON.stringify({ source: "Derived from Basketball-Reference 2025-26 statistical profile", byId }, null, 2) + "\n");
console.log(`Wrote ${Object.keys(byId).length} dimensional profiles -> ${OUT}\n`);

const show = ["wembavi01", "greendr01", "curryst01", "jokicni01", "davisan02", "gilgesh01", "brunsja01", "goberru01"];
const names = { wembavi01: "Wembanyama", greendr01: "Draymond", curryst01: "Curry", jokicni01: "Jokić", davisan02: "A.Davis", gilgesh01: "SGA", brunsja01: "Brunson", goberru01: "Gobert" };
console.log("player       off def play reb spc rim perd usg");
for (const id of show) { const d = byId[id]; if (d) console.log(`${(names[id] || id).padEnd(11)} ${d.off} ${d.def} ${d.play} ${d.reb} ${d.space} ${d.rim} ${d.perd} ${d.usg}`); }
