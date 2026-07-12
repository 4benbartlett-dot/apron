"use client";

import { leagueToast } from "@/components/SiteEggs";
import type { Move } from "@/lib/league";

/** Team easter eggs — board showpieces, league jackpots, and mechanic gags.
 *
 * Every effect routes through the league-office queue below (co-fires play in
 * sequence, one moment each) and the cooldown policy (narrative one-timers
 * once per session, repeatable spectacles every ten minutes, the loudest
 * league-wide jackpots once a day via localStorage). Reduced motion collapses
 * each egg to its toast.
 */

const reducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- The league-office queue -------------------------------------------
 * One move can set off several teams at once (a blockbuster that sends a star
 * to one board card and a first-rounder to another). Rather than dogpile the
 * screen, their reactions PLAY IN SEQUENCE — each gets its own moment, like
 * the league office stamping one consequence, then the next. The first runs
 * immediately; the rest wait their turn behind a short breath. A card that
 * has since left the board just no-ops when its turn comes. */
type QueuedEgg = { key: string; ms: number; run: () => void };
let eggQueue: QueuedEgg[] = [];
let eggDraining = false;
const EGG_GAP = 480;
const EGG_QUEUE_MAX = 4;

/* Cooldowns keep the surprises surprising: the narrative one-timers play
 * once per session, the repeatable spectacles rest ten minutes between
 * shows, and the loudest league-wide jackpots land once a DAY (localStorage,
 * so a refresh doesn't reset the gag). (The 101st Blow throttles itself —
 * it IS the 5th move.) */
const EGG_DAY = 24 * 60 * 60_000;
const EGG_POLICY: Record<string, "once" | "day" | number> = {
  intro: "once",
  chalk: "once",
  beam: 10 * 60_000,
  strike: 10 * 60_000,
  subway: 10 * 60_000,
  heat: 10 * 60_000,
  premiere: "once",
  perfection: "once",
  lottery: "once",
  commish: "once",
  audit: "once",
  heist: "day",
  freeze: "once",
  hawkdive: 10 * 60_000,
  cigar: 10 * 60_000,
  swarm: 10 * 60_000,
  stampede: 10 * 60_000,
  paydirt: 10 * 60_000,
  assembly: 10 * 60_000,
  lightyears: 10 * 60_000,
  launch: 10 * 60_000,
  brickyard: 10 * 60_000,
  wall: 10 * 60_000,
  gritgrind: 10 * 60_000,
  whitehot: 10 * 60_000,
  antlers: 10 * 60_000,
  northern: 10 * 60_000,
  beads: 10 * 60_000,
  bingbong: 10 * 60_000,
  finale: 10 * 60_000,
  belltoll: 10 * 60_000,
  sunrise: 10 * 60_000,
  dametime: 10 * 60_000,
  north: 10 * 60_000,
  riff: 10 * 60_000,
  blossoms: 10 * 60_000,
};
function eggAllowed(key: string): boolean {
  const policy = EGG_POLICY[key] ?? EGG_POLICY[key.split(":")[0]!];
  if (!policy) return true;
  try {
    if (policy === "day") {
      const raw = localStorage.getItem(`apron_egg_day:${key}`);
      return !raw || Date.now() - Number(raw) >= EGG_DAY;
    }
    const raw = sessionStorage.getItem(`apron_egg_seen:${key}`);
    if (policy === "once") return !raw;
    return !raw || Date.now() - Number(raw) >= policy;
  } catch {
    return true;
  }
}
function markEggSeen(key: string) {
  const policy = EGG_POLICY[key] ?? EGG_POLICY[key.split(":")[0]!];
  if (!policy) return;
  try {
    if (policy === "day") localStorage.setItem(`apron_egg_day:${key}`, String(Date.now()));
    else sessionStorage.setItem(`apron_egg_seen:${key}`, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Is this egg off cooldown right now? The move-watcher's league chain uses
 * this so a rung whose show is already spent doesn't swallow the move —
 * exclusivity belongs to the rarest egg that will actually PLAY. */
export function eggReady(key: string): boolean {
  return eggAllowed(key);
}
/** A run that bails before showing anything hands its once-per-session slot
 * back — the gag wasn't seen, so it isn't spent. */
function reopenEgg(key: string) {
  try {
    sessionStorage.removeItem(`apron_egg_seen:${key}`);
  } catch {
    /* ignore */
  }
}

function queueEgg(key: string, ms: number, run: () => void) {
  // De-dupe within a batch; cap the parade so a wild multi-team deal can't
  // hold the screen hostage (extra reactions are all good news — losing the
  // 5th is fine). Cooldowns apply before anything is queued.
  if (!eggAllowed(key)) return;
  if (eggQueue.some((e) => e.key === key) || eggQueue.length >= EGG_QUEUE_MAX) return;
  markEggSeen(key);
  eggQueue.push({ key, ms, run });
  if (!eggDraining) drainEggQueue();
}
function drainEggQueue() {
  const next = eggQueue.shift();
  if (!next) {
    eggDraining = false;
    return;
  }
  eggDraining = true;
  try {
    next.run();
  } catch {
    /* a dead card / torn-down view just no-ops */
  }
  // Reduced motion collapses each egg to its toast — sequence those at a
  // readable clip instead of waiting out an animation that never plays.
  setTimeout(drainEggQueue, (reducedMotion() ? 2400 : next.ms) + EGG_GAP);
}

/** MIA — signing anyone to the MINIMUM is the most Miami transaction there is.
 * Routed through the queue + policy like everything else: the gag rests ten
 * minutes between shows instead of stamping every single minimum signing. */
export function heatCultureEgg(teamId: string, mechanismId: string | undefined | null) {
  if (teamId !== "MIA" || mechanismId !== "minimum") return;
  queueEgg("heat", 1800, () =>
    leagueToast("Heat culture", "He'll be in the best shape of his life by camp.", "heat", "Signing anyone to the minimum is the most Miami move there is."),
  );
}

/** Did this move involve the team at all? (Sends without receives still change
 * the projection — the beam only fires on gains, so erring loose is safe.) */
export function moveTouches(m: Move, team: string): boolean {
  switch (m.kind) {
    case "trade":
      return (
        m.players.some((p) => p.to === team) ||
        (m.picks ?? []).some((p) => p.to === team || p.from === team) ||
        (m.pickSwaps ?? []).some((s) => s.favoredTo === team || s.otherTeam === team)
      );
    case "sign":
      return m.teamId === team;
    case "sign_trade":
      return m.toTeam === team || m.fromTeam === team;
    case "renounce":
      return m.team === team;
    default:
      // extend/waive carry no team id — let the projection delta decide.
      return true;
  }
}

/** Board-card lookup + a decaying shake applied to the card itself. */
function cardOf(team: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-egg-team="${team}"]`);
}
function shake(card: HTMLElement, cls: "egg-shudder" | "egg-rumble", ms: number) {
  card.classList.add(cls);
  setTimeout(() => card.classList.remove(cls), ms);
}

/** OKC — The Strike. Another first enters the vault: the room dims for a
 * blink, a jagged bolt cracks from the top of the screen into the card with
 * a white flash, and the card shudders while the thunder rolls off. Instant
 * and violent where the beam is sustained and serene. */
export function strikeEgg(firstCount: number) {
  queueEgg("strike", 2000, () => strikeEggRun(firstCount));
}
function strikeEggRun(firstCount: number) {
  leagueToast("Filed", `That's ${firstCount} future first${firstCount === 1 ? "" : "s"}. Sam says thank you for calling.`, undefined, "A first-rounder landing in OKC adds to the vault.");
  if (reducedMotion()) return;
  const card = cardOf("OKC");
  if (!card || document.querySelector(".egg-strike")) return;
  const r = card.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const h = Math.max(r.top + 6, 90);
  // hand-jagged path from the sky to the card top, kinking back to center
  let d = `M ${x.toFixed(1)} 0`;
  const segs = 8;
  for (let i = 1; i <= segs; i++) {
    const y = (h / segs) * i;
    const cx = i === segs ? x : x + (i % 2 ? -1 : 1) * (7 + ((i * 11) % 20));
    d += ` L ${cx.toFixed(1)} ${y.toFixed(1)}`;
  }
  const wrap = document.createElement("div");
  wrap.className = "egg-strike";
  wrap.innerHTML =
    '<i class="st-dim"></i>' +
    `<svg class="st-bolt" width="${window.innerWidth}" height="${h}" viewBox="0 0 ${window.innerWidth} ${h}" fill="none">` +
    `<path d="${d}" stroke="#f2ecff" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="${d}" stroke="#fff" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>` +
    `<i class="st-flash" style="left:${x}px;top:${r.top}px"></i>`;
  document.body.appendChild(wrap);
  shake(card, "egg-shudder", 1400);
  setTimeout(() => wrap.remove(), 1900);
}

/** CHI — The Intro. A star arrives: the lights go DOWN and one spotlight
 * hunts the board — drifting slowly, pausing on the wrong teams the way a
 * real arena spotlight does — before finding and tightening on the player's
 * own roster row. The toast waits for the light to land. */
export function introEgg(playerName: string) {
  queueEgg("intro", 5200, () => introEggRun(playerName));
}
function introEggRun(playerName: string) {
  if (reducedMotion()) {
    leagueToast("And now…", `${playerName}. From parts elsewhere. Your newest Bull.`, undefined, "Any 60-overall-plus arrival in Chicago gets the spotlight.");
    return;
  }
  const card = cardOf("CHI");
  if (!card || document.querySelector(".egg-intro")) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // the player's own row inside the Bulls card — the innermost element that
  // names him and is row-sized. Falls back to the card header.
  const inView = (rc: DOMRect) => rc.top > 40 && rc.bottom < vh - 20;
  const row = [...card.querySelectorAll<HTMLElement>("div, span")]
    .filter((e) => (e.textContent || "").includes(playerName))
    .map((e) => ({ e, rc: e.getBoundingClientRect() }))
    .filter(({ rc }) => rc.height > 8 && rc.height < 56 && rc.width > 60)
    .sort((a, b) => a.rc.width * a.rc.height - b.rc.width * b.rc.height)[0];
  const cr = card.getBoundingClientRect();
  const target =
    row && inView(row.rc)
      ? { x: row.rc.left + row.rc.width / 2, y: row.rc.top + row.rc.height / 2 }
      : { x: cr.left + cr.width / 2, y: cr.top + Math.min(cr.height * 0.25, 150) };
  // the hunt visits the OTHER front offices first
  const others = [...document.querySelectorAll<HTMLElement>("[data-egg-team]")]
    .filter((c) => c.dataset.eggTeam !== "CHI")
    .map((c) => c.getBoundingClientRect())
    .filter((rc) => rc.top < vh && rc.bottom > 0)
    .slice(0, 2);
  const w1 = others[0]
    ? { x: others[0].left + others[0].width / 2, y: Math.max(others[0].top + 130, 120) }
    : { x: vw * 0.78, y: vh * 0.3 };
  const w2 = others[1]
    ? { x: others[1].left + others[1].width / 2, y: Math.max(others[1].top + 170, 160) }
    : { x: vw * 0.24, y: vh * 0.6 };
  const spot = 320; // roaming diameter; the landing iris tightens via scale
  const pt = (p: { x: number; y: number }) => `${(p.x - spot / 2).toFixed(0)}px, ${(p.y - spot / 2).toFixed(0)}px`;
  const wrap = document.createElement("div");
  wrap.className = "egg-intro";
  wrap.style.setProperty("--p0", pt({ x: vw * 0.12, y: -60 }));
  wrap.style.setProperty("--p1", pt(w1));
  wrap.style.setProperty("--p2", pt(w2));
  wrap.style.setProperty("--pf", pt(target));
  wrap.innerHTML = '<i class="in-spot"></i>';
  document.body.appendChild(wrap);
  // the PA waits until the light finds him
  setTimeout(() => leagueToast("And now…", `${playerName}. From parts elsewhere. Your newest Bull.`), 4100);
  setTimeout(() => wrap.remove(), 5700);
}


/** SAS — The 101st Blow. The Spurs' fifth move of the session: a hairline
 * crack draws across the card, pauses… then splits with a flash and dust
 * before healing. Persistence, rewarded — per the stonecutter. */
export function rockCrackEgg() {
  queueEgg("crack", 3000, () => rockCrackEggRun());
}
function rockCrackEggRun() {
  leagueToast("Pound the rock", "That was the hundred-and-first blow.", undefined, "Your fifth Spurs move splits the rock.");
  if (reducedMotion()) return;
  const card = cardOf("SAS");
  if (!card || document.querySelector(".egg-crack")) return;
  const r = card.getBoundingClientRect();
  const w = r.width;
  const midY = Math.min(r.height, 420) * 0.45;
  let d = `M 0 ${midY.toFixed(1)}`;
  const segs = 10;
  for (let i = 1; i <= segs; i++) {
    const px = (w / segs) * i;
    const py = midY + (i % 2 ? -1 : 1) * (4 + ((i * 7) % 14));
    d += ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
  }
  const wrap = document.createElement("div");
  wrap.className = "egg-crack";
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top}px`;
  wrap.style.width = `${w}px`;
  wrap.style.height = `${Math.min(r.height, 420)}px`;
  wrap.innerHTML =
    `<svg width="${w}" height="${Math.min(r.height, 420)}" fill="none">` +
    `<path class="ck-line" d="${d}" stroke="#4a4234" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path class="ck-glow" d="${d}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>` +
    '<i class="ck-dust" style="left:6%"></i><i class="ck-dust" style="left:88%"></i>';
  document.body.appendChild(wrap);
  // the split lands after the hairline finishes drawing
  setTimeout(() => {
    const c = cardOf("SAS");
    if (c) shake(c, "egg-shudder", 900);
  }, 1350);
  setTimeout(() => wrap.remove(), 3600);
}

/** BKN — Stand clear of the closing doors. Any Nets trade: a passing train —
 * low rumble through the card, twin headlights sweeping across it. */
export function subwayEgg() {
  queueEgg("subway", 2200, () => subwayEggRun());
}
function subwayEggRun() {
  leagueToast("Stand clear", "This is a Manhattan-bound B train. The next stop is: a rebuild.", undefined, "Any Nets trade. Stand clear of the closing doors.");
  if (reducedMotion()) return;
  const card = cardOf("BKN");
  if (!card || document.querySelector(".egg-subway")) return;
  const r = card.getBoundingClientRect();
  const wrap = document.createElement("div");
  wrap.className = "egg-subway";
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top}px`;
  wrap.style.width = `${r.width}px`;
  wrap.style.height = `${Math.min(r.height, 420)}px`;
  wrap.innerHTML = '<i class="sw-light" style="top:26%"></i><i class="sw-light" style="top:56%;animation-delay:0.5s"></i>';
  document.body.appendChild(wrap);
  shake(card, "egg-rumble", 1900);
  setTimeout(() => wrap.remove(), 2400);
}

/** CLE — The Chalk Toss. A star arrives in Cleveland: the lights dip and the
 * building goes still; a soft clap at the card's bottom edge, then the chalk
 * goes UP — three big blooming puffs and a fan of fine matte grains — each on
 * its own clock, decelerating into a hang at the apex while flashbulbs pop
 * around the dark, then drifting off on the arena draft and settling back
 * onto the ledger's bottom edge. */
export function chalkTossEgg(playerName: string) {
  queueEgg("chalk", 4600, () => chalkTossEggRun(playerName));
}
function chalkTossEggRun(playerName: string) {
  const stamp = "Ritual observed";
  const text = `${playerName}. The chalk goes up. The King is home.`;
  // leagueToast renders in the site toast layer (outside .egg-chalktoss), so
  // reduced-motion users still get the headline, statically.
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "Only the King coming home does this.");
    return;
  }
  const card = cardOf("CLE");
  if (!card || document.querySelector(".egg-chalktoss")) return;
  const r = card.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // burst origin: the exact bottom-center of the measured card, clamped
  // on-screen whether the card runs past the fold OR is scrolled above it
  const x = r.left + r.width / 2;
  const y = Math.max(Math.min(r.bottom, vh - 20), 20);
  const ch = Math.min(r.height, 460); // card scale drives rise height
  const dir = Math.random() < 0.5 ? -1 : 1; // one shared draft direction
  const BURST = 1200; // ms of dark stillness before the toss

  const wrap = document.createElement("div");
  wrap.className = "egg-chalktoss";
  wrap.style.left = `${x}px`;
  wrap.style.top = `${y}px`;

  // clap delay derives from BURST so tuning one can't desync the other
  let html = `<i class="ct-dim"></i><i class="ct-clap" style="animation-delay:${BURST - 150}ms"></i>`;

  // three large soft puffs — the body of the cloud, each with its own signed
  // hang micro-drift so the near-stillness shimmers instead of sliding
  const puffs = [
    { ax: -26, ay: -ch * 0.34, s: 92, b: 15, o: 0.62, d: 0 },
    { ax: 4, ay: -ch * 0.45, s: 118, b: 18, o: 0.55, d: 70 },
    { ax: 30, ay: -ch * 0.29, s: 82, b: 13, o: 0.66, d: 130 },
  ];
  for (const p of puffs) {
    const sx = p.ax + dir * (66 + Math.random() * 54);
    const sy = p.ay + 34 + Math.random() * 26;
    const jx = (Math.random() * 8 - 4).toFixed(1);
    const jy = (Math.random() * 10 - 5).toFixed(1);
    html +=
      `<i class="ct-puff" style="width:${p.s}px;height:${p.s}px;--pb:${p.b}px;--po:${p.o};` +
      `--jx:${jx}px;--jy:${jy}px;` +
      `--ax:${p.ax}px;--ay:${p.ay.toFixed(0)}px;--sx:${sx.toFixed(0)}px;--sy:${sy.toFixed(0)}px;` +
      `animation-delay:${BURST + p.d}ms"></i>`;
  }

  // fine grains — a fan of individual trajectories, tallest in the middle.
  // Per-grain duration jitter (±6%) smears apex arrival ~250ms so the fan
  // never peaks in lockstep; per-grain signed (--jx,--jy), some near zero,
  // keep the hang reading as suspended dust rather than a drifting lattice.
  const N = 15;
  for (let i = 0; i < N; i++) {
    const t = (i / (N - 1)) * 2 - 1; // -1..1 across the fan
    const ax = t * (26 + Math.random() * 58);
    const ay = -(ch * (0.3 + Math.random() * 0.2) + (1 - Math.abs(t)) * ch * 0.16);
    const sx = ax + dir * (58 + Math.random() * 84);
    const sy = ay + 30 + Math.random() * 56;
    const sz = 1.5 + Math.random() * 1.5; // fine: 1.5–3px at card scale
    const o = 0.55 + Math.random() * 0.4;
    const jx = (Math.random() * 10 - 5).toFixed(1);
    const jy = (Math.random() * 8 - 4).toFixed(1);
    const dur = 4600 * (0.94 + Math.random() * 0.12);
    const d = BURST + Math.random() * 120;
    html +=
      `<i class="ct-bit" style="width:${sz.toFixed(1)}px;height:${sz.toFixed(1)}px;--po:${o.toFixed(2)};` +
      `--jx:${jx}px;--jy:${jy}px;--ax:${ax.toFixed(0)}px;--ay:${ay.toFixed(0)}px;` +
      `--sx:${sx.toFixed(0)}px;--sy:${sy.toFixed(0)}px;` +
      `animation-duration:${dur.toFixed(0)}ms;animation-delay:${d.toFixed(0)}ms"></i>`;
  }

  // flashbulbs in the dark around the card — all six pops land inside the
  // 2490–3320ms hang (last starts ~3200ms, peaks ~3260ms)
  const bulbs = [
    { x: -r.width * 0.46, y: -ch * 0.82 },
    { x: r.width * 0.42, y: -ch * 0.6 },
    { x: -r.width * 0.28, y: -ch * 1.04 },
    { x: r.width * 0.5, y: -ch * 0.92 },
    { x: -r.width * 0.52, y: -ch * 0.38 },
    { x: r.width * 0.18, y: -ch * 1.14 },
  ];
  bulbs.forEach((p, i) => {
    const fx = Math.min(Math.max(p.x + (Math.random() * 24 - 12), 16 - x), vw - 16 - x);
    const fy = Math.max(p.y + (Math.random() * 20 - 10), 16 - y);
    const d = 2460 + i * 140 + Math.random() * 40;
    html += `<b class="ct-flash" style="left:${fx.toFixed(0)}px;top:${fy.toFixed(0)}px;animation-delay:${d.toFixed(0)}ms"></b>`;
  });

  // chalk residue settling back onto the card's bottom edge — its 4s delay
  // lands after the cloud has visibly drifted off the ledger
  html += `<i class="ct-residue" style="left:${(-r.width * 0.24).toFixed(0)}px;width:${(r.width * 0.48).toFixed(0)}px"></i>`;

  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  // the PA speaks at the top of the hang, between the first two flashes
  setTimeout(() => leagueToast(stamp, text), 2650);
  setTimeout(() => wrap.remove(), 6400);
}

// Design-preview convenience: lets the branch demo each board effect from the
// console without staging the exact trigger move. Dev builds only.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  const demo = <A extends unknown[]>(key: string, fn: (...a: A) => void) =>
    (...a: A) => {
      try {
        sessionStorage.removeItem(`apron_egg_seen:${key}`);
        localStorage.removeItem(`apron_egg_day:${key}`);
        for (const k of Object.keys(sessionStorage))
          if (k.startsWith(`apron_egg_seen:${key}:`)) sessionStorage.removeItem(k);
      } catch {
        /* ignore */
      }
      fn(...a);
    };
  (window as unknown as Record<string, unknown>).__apronEggs = {
    strikeEgg: demo("strike", strikeEgg),
    introEgg: demo("intro", introEgg),
    hawkDiveEgg: demo("hawkdive", hawkDiveEgg),
    cigarEgg: demo("cigar", cigarEgg),
    swarmEgg: demo("swarm", swarmEgg),
    stampedeEgg: demo("stampede", stampedeEgg),
    summitEgg: demo("paydirt", summitEgg),
    assemblyLineEgg: demo("assembly", assemblyLineEgg),
    lightYearsEgg: demo("lightyears", lightYearsEgg),
    launchEgg: demo("launch", launchEgg),
    brickyardEgg: demo("brickyard", brickyardEgg),
    theWallEgg: demo("wall", theWallEgg),
    premiereEgg: demo("premiere", premiereEgg),
    gritGrindEgg: demo("gritgrind", gritGrindEgg),
    whiteHotEgg: demo("whitehot", whiteHotEgg),
    antlersEgg: demo("antlers", antlersEgg),
    northernLightsEgg: demo("northern", northernLightsEgg),
    beadThrowEgg: demo("beads", beadThrowEgg),
    bingBongEgg: demo("bingbong", bingBongEgg),
    finaleEgg: demo("finale", finaleEgg),
    bellTollEgg: demo("belltoll", bellTollEgg),
    valleySunriseEgg: demo("sunrise", valleySunriseEgg),
    dameTimeEgg: demo("dametime", dameTimeEgg),
    theNorthEgg: demo("north", theNorthEgg),
    theRiffEgg: demo("riff", theRiffEgg),
    blossomsEgg: demo("blossoms", blossomsEgg),
    perfectionEgg: demo("perfection", perfectionEgg),
    lotteryEgg: demo("lottery", lotteryEgg),
    freezeEgg: demo("freeze", freezeEgg),
    auditEgg: demo("audit", auditEgg),
    commissionerEgg: demo("commish", commissionerEgg),
    heistEgg: demo("heist", heistEgg),
    rockCrackEgg: demo("crack", rockCrackEgg),
    subwayEgg: demo("subway", subwayEgg),
    chalkTossEgg: demo("chalk", chalkTossEgg),
    lightTheBeam: demo("beam", lightTheBeam),
    heatCultureEgg: demo("heat", heatCultureEgg),
  };
}

/** SAC — THE beam, v3. The Kings card is Golden 1 Center: a glowing roof
 * aperture opens on the card's top edge, the white-hot column erupts through
 * it into the sky (anchored to the card, so it scrolls WITH the building),
 * the arena's skin pulses violet while it burns, and a skyline glow answers
 * at the top of the screen. Only on improvement — that is the entire point
 * of the beam. */
export function lightTheBeam() {
  queueEgg("beam", 3800, () => lightTheBeamRun());
}
function lightTheBeamRun() {
  leagueToast("Beam lit", "Victory-grade improvement detected in Sacramento.", undefined, "Any move that improves the Kings lights it.");
  if (reducedMotion()) return;
  const card = cardOf("SAC");
  if (!card || card.querySelector(".egg-beam3")) return;
  const r = card.getBoundingClientRect();
  // The card IS Golden 1 Center. The column is anchored INSIDE the card
  // wrapper, so scrolling mid-animation carries the beam with the building —
  // and it's tall enough to run off the top of the screen from any scroll
  // position it could occupy while it burns.
  if (!card.style.position) card.style.position = "relative";
  const beamH = Math.round(Math.max(r.top, window.innerHeight) + 260);
  const beam = document.createElement("div");
  beam.className = "egg-beam3";
  beam.style.height = `${beamH}px`;
  beam.style.setProperty("--bh", `${beamH}px`);
  beam.innerHTML =
    '<i class="b3-glow"></i>' +
    '<i class="b3-col"></i>' +
    '<i class="b3-core"></i>' +
    [0, 1, 2, 3, 4].map((m) => `<i class="b3-mote" style="--m:${m}"></i>`).join("") +
    '<i class="b3-aperture"></i>' +
    '<i class="b3-rim"></i>';
  card.appendChild(beam);
  // the sky answers at the top of the SCREEN, centered over the arena
  const sky = document.createElement("div");
  sky.className = "b3-skyline";
  sky.style.setProperty("--bx", `${r.left + r.width / 2}px`);
  document.body.appendChild(sky);
  // the arena's skin pulses while the beam burns
  card.classList.add("egg-arena");
  setTimeout(() => {
    beam.remove();
    sky.remove();
    card.classList.remove("egg-arena");
  }, 4600);
}

/* =======================================================================
 * Ported showpieces — tranches 4+5, curated from eggs/showpieces-3.
 * Every effect routes through queueEgg (co-fire serialization) and the
 * cooldown policy above. Bodies are the design-review-approved versions.
 * ======================================================================= */

/** ATL — The Flight Path. A Hawks move adds a projected win: high above the
 * board a hawk circles twice — slow, patient — while its small blurred
 * shadow drifts across the card faces below (the sun-offset shadow is the
 * altitude; it shrinks as the bird climbs, then collapses onto it at
 * contact). It banks and HOLDS a full beat at the top of the climb, then
 * dives in one accelerating arc across the ATL card, pulling up off-screen.
 * The pass leaves a three-line talon rake that fades, a gust across the
 * paper, and two feathers that flutter down and settle exactly on the
 * card's measured top edge. The tower clears it the instant the talons
 * touch. */
export function hawkDiveEgg() {
  queueEgg("hawkdive", 8200, () => hawkDiveEggRun());
}
function hawkDiveEggRun() {
  const stamp = "Cleared to land";
  const line = "Flight path approved. The Hawks are circling.";
  if (reducedMotion()) {
    leagueToast(stamp, line, undefined, "Any move that lifts Atlanta's projection sends the hawk diving.");
    return;
  }
  if (document.querySelector(".egg-hawkdive")) return; // already on approach
  const card = cardOf("ATL");
  if (!card) {
    // card off the board: the move still gets its clearance
    leagueToast(stamp, line, undefined, "Any move that lifts Atlanta's projection sends the hawk diving.");
    return;
  }
  const r = card.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ch = Math.min(r.height, 420);
  // no stage, no show: r.top >= 8 keeps the feather landing line (r.top - 7)
  // and the rake band on-screen even when a tall card is part-scrolled; the
  // last clause guarantees the rake entry sits well BELOW the loop-top clamp
  // (ty >= 64), so the dive can never point upward through its own circling
  if (r.top < 8 || r.bottom < 120 || r.top > vh - 140 || r.top + ch * 0.32 < 110) {
    leagueToast(stamp, line, undefined, "Any move that lifts Atlanta's projection sends the hawk diving.");
    return;
  }
  // ---- the one timeline every beat rides ----
  const CIRCLE = 3900; // two loops — one inline path, drawn twice (matches hd-circle-kf 3.9s)
  const BANK = 1100; // rear-up, a 550ms HELD beat, wing-over (hd-bank-kf 1.1s)
  const DIVE = CIRCLE + BANK; // 5000 — the drop begins (hd-ccut-kf cuts at 5.06s, 60ms of overlap)
  const DIVE_MS = 940;
  // talons touch paper at the dive's 58% TIME frame (hd-dive-kf pins the
  // measured --hd-rs fraction there), so this is exact, not estimated
  const RAKE0 = DIVE + Math.round(DIVE_MS * 0.58); // 5545
  const RAKE_HOLD = 850; // the scratch lingers under the falling feathers, then fades (1.35s → 7745)
  const FEATHER_OUT = 7400; // both feathers down and rested; 0.5s fade → gone at 7.9s
  type Pt = { x: number; y: number };
  const fx = (n: number) => n.toFixed(1);
  // ---- the climb: a two-loop ellipse high over the board; the second loop
  // is 14% tighter and shares the top point T with the first — the hawk is
  // climbing the thermal, and T is where it will bank. The shadow rides a
  // sun-offset copy whose SECOND loop is offset further (dx2/dy2): higher
  // altitude, longer sun line — the shadow walks away as the bird climbs. ----
  const rx = Math.max(110, Math.min(vw * 0.24, 230, r.width * 0.62));
  const ry = Math.max(34, rx * 0.34);
  const ox = Math.min(Math.max(r.left + r.width / 2, rx + 24), Math.max(rx + 24, vw - rx - 24));
  const ty = Math.max(64, Math.min(r.top - 120, vh * 0.3)); // T rides well above the card when there's sky
  const oy = ty + ry;
  const loops = (dx: number, dy: number, dx2: number, dy2: number): string => {
    const rx2 = rx * 0.86;
    const ry2 = ry * 0.86;
    const t1 = `${fx(ox + dx)} ${fx(oy - ry + dy)}`;
    const t2x = ox + dx2;
    const t2y = oy - ry + dy2;
    const t2 = `${fx(t2x)} ${fx(t2y)}`;
    return (
      `M ${t1} A ${fx(rx)} ${fx(ry)} 0 1 1 ${fx(ox + dx)} ${fx(oy + ry + dy)} A ${fx(rx)} ${fx(ry)} 0 1 1 ${t1}` +
      ` L ${t2} A ${fx(rx2)} ${fx(ry2)} 0 1 1 ${fx(t2x)} ${fx(t2y + 2 * ry2)} A ${fx(rx2)} ${fx(ry2)} 0 1 1 ${t2}`
    );
  };
  // the sun sits up-left: the shadow rides the SAME loop keyframes offset
  // down-right, so bird and shadow stay frame-locked; loop two's offset is
  // 1.3x — the climb, told in shadow (the blur hides the seam at the join)
  const SDX = 26;
  const SDY = 44;
  const SDX2 = SDX * 1.3;
  const SDY2 = SDY * 1.3;
  // ---- the dive: T → rake entry → straight talon drag across the measured
  // face → pull-up off the top of the screen ----
  const T: Pt = { x: ox, y: oy - ry };
  const RS: Pt = { x: r.left + r.width * 0.14, y: r.top + ch * 0.32 };
  const RE: Pt = { x: r.left + r.width * 0.86, y: r.top + ch * 0.6 };
  const rakeLen = Math.hypot(RE.x - RS.x, RE.y - RS.y);
  const rd: Pt = { x: (RE.x - RS.x) / rakeLen, y: (RE.y - RS.y) / rakeLen };
  // near-vertical drop that hooks into the rake heading at entry
  const c1: Pt = { x: T.x + (RS.x - T.x) * 0.18, y: T.y + (RS.y - T.y) * 0.88 };
  // pull-up carries the rake momentum before bending skyward
  const c2: Pt = { x: RE.x + rd.x * 190, y: RE.y + rd.y * 190 };
  const EX: Pt = { x: RE.x + 420, y: -140 };
  // measure the dive's segment lengths so CSS can pin the rake to exact
  // moments: --hd-rs/--hd-re are true length fractions of the path
  const qlen = (p0: Pt, c: Pt, p1: Pt): number => {
    let len = 0;
    let px = p0.x;
    let py = p0.y;
    for (let i = 1; i <= 24; i++) {
      const t = i / 24;
      const u = 1 - t;
      const x = u * u * p0.x + 2 * u * t * c.x + t * t * p1.x;
      const y = u * u * p0.y + 2 * u * t * c.y + t * t * p1.y;
      len += Math.hypot(x - px, y - py);
      px = x;
      py = y;
    }
    return len;
  };
  const drop = qlen(T, c1, RS);
  const climb = qlen(RE, c2, EX);
  const total = drop + rakeLen + climb;
  const diveD =
    `M ${fx(T.x)} ${fx(T.y)} Q ${fx(c1.x)} ${fx(c1.y)} ${fx(RS.x)} ${fx(RS.y)}` +
    ` L ${fx(RE.x)} ${fx(RE.y)} Q ${fx(c2.x)} ${fx(c2.y)} ${fx(EX.x)} ${fx(EX.y)}`;
  // the shadow's last run: from its loop-two bank position it converges on
  // the rake entry, snuffing out at 0.545s = the exact contact frame — the
  // sun offset collapses with the altitude and neither outlives the touch
  const sB: Pt = { x: T.x + SDX2, y: T.y + SDY2 };
  const sC: Pt = { x: sB.x + (RS.x - sB.x) * 0.3, y: sB.y + (RS.y - sB.y) * 0.85 };
  const shadD = `M ${fx(sB.x)} ${fx(sB.y)} Q ${fx(sC.x)} ${fx(sC.y)} ${fx(RS.x)} ${fx(RS.y)}`;
  // ---- glyphs: clean silhouettes, deep Hawks red, drawn facing +x so
  // offset-rotate keeps the head on the heading ----
  const soar =
    '<svg class="hd-cglyph" width="46" height="40" viewBox="0 0 64 56" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path fill="#C8102E" d="M61 28 C57.6 25.2 53.6 24 49.2 24 C46.4 15 38.8 6.6 25 2.4 C28.8 9.6 30.6 15.8 30.2 21.6 C24.6 22.3 17.6 23.2 10.4 24.8 L3.4 25.6 C5.8 26.6 5.8 29.4 3.4 30.4 L10.4 31.2 C17.6 32.8 24.6 33.7 30.2 34.4 C30.6 40.2 28.8 46.4 25 53.6 C38.8 49.4 46.4 41 49.2 32 C53.6 32 57.6 30.8 61 28 Z"/>' +
    "</svg>";
  const stoop =
    `<svg class="hd-dglyph" width="50" height="44" viewBox="0 0 64 56" fill="none" xmlns="http://www.w3.org/2000/svg" style="animation-delay:${DIVE}ms">` +
    '<path fill="#C8102E" d="M59 28 C53.6 24.8 48 23.2 42 22.8 C35.6 15.2 26.4 8.4 13 3.6 C20.4 11.2 25.6 17.6 28.6 23.6 C21 24.4 12.4 25.6 3 27.2 L3 28.8 C12.4 30.4 21 31.6 28.6 32.4 C25.6 38.4 20.4 44.8 13 52.4 C26.4 47.6 35.6 40.8 42 33.2 C48 32.8 53.6 31.2 59 28 Z"/>' +
    "</svg>";
  const featherSvg =
    '<svg class="hd-fglyph" width="18" height="8" viewBox="0 0 18 8" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path fill="#A50D26" d="M1 6.6 C3.2 3 7.6 0.8 16.6 0.9 C15.2 3.6 11.6 6.2 7.4 7 C4.8 7.4 2.6 7.3 1 6.6 Z"/>' +
    '<path stroke="#E3A8B1" stroke-width="0.7" d="M1.6 6.4 C5.4 5 10.6 3 15.8 1.3"/>' +
    "</svg>";
  // ---- the rake: three talon lines along the dive line, inset from the
  // crossing, middle talon longest and deepest, hand-jittered. Draw AND
  // fade delays ride RAKE0 inline — the stylesheet holds no absolute time. ----
  const lx = (p: Pt) => fx(p.x - r.left);
  const ly = (p: Pt) => fx(p.y - r.top);
  const sep = Math.min(10, Math.max(6, r.width * 0.02));
  const perp: Pt = { x: -rd.y, y: rd.x };
  const talons: Array<[number, number, number, number]> = [
    [0.1, 0.9, -1, 2.2],
    [0.06, 0.94, 0, 2.8],
    [0.12, 0.88, 1, 2.2],
  ]; // [startFrac, endFrac, lane, strokeWidth]
  const rakeLines = talons
    .map(([a, b, lane, sw], i) => {
      const j = () => Math.random() * 3 - 1.5;
      const p0: Pt = {
        x: RS.x + rd.x * rakeLen * a + perp.x * lane * sep + j(),
        y: RS.y + rd.y * rakeLen * a + perp.y * lane * sep + j(),
      };
      const p1: Pt = {
        x: RS.x + rd.x * rakeLen * b + perp.x * lane * sep + j(),
        y: RS.y + rd.y * rakeLen * b + perp.y * lane * sep + j(),
      };
      return `<path class="hd-rk" pathLength="1" stroke-width="${sw}" d="M ${lx(p0)} ${ly(p0)} L ${lx(p1)} ${ly(p1)}" style="animation-delay:${RAKE0 + i * 35}ms, ${RAKE0 + RAKE_HOLD + i * 60}ms"/>`;
    })
    .join("");
  // the gust rides the exact rake line (static rotation; only the band moves)
  const mid: Pt = { x: (RS.x + RE.x) / 2, y: (RS.y + RE.y) / 2 };
  const ang = (Math.atan2(rd.y, rd.x) * 180) / Math.PI;
  const gust =
    `<i class="hd-gust" style="left:${fx(mid.x)}px;top:${fx(mid.y)}px;width:${fx(rakeLen * 1.12)}px;height:28px;transform:translate(-50%,-50%) rotate(${ang.toFixed(1)}deg)">` +
    `<b class="hd-gustb" style="animation-delay:${RAKE0 - 20}ms"></b></i>`;
  // two feathers shed at the pull-up (the bird reaches the rake exit at the
  // 76% dive frame ≈ 5714ms; each feather starts as it comes loose). Each is
  // positioned AT its landing point on the measured top edge, so touchdown
  // is translate(0,0) — precision by construction. They land at ~6960 and
  // ~7230, rest, and let go together at FEATHER_OUT.
  const feathers = [0, 1]
    .map((i) => {
      const landX = r.left + r.width * (0.57 + i * 0.15);
      const shedX = RE.x - 34 + i * 26;
      const f0x = shedX - landX;
      const f0y = -(58 + i * 20);
      const delay = RAKE0 + 165 + i * 170; // 5710 / 5880 — off the pull-up
      const dur = 1250 + i * 100;
      return (
        `<b class="hd-feather" style="left:${fx(landX - 9)}px;top:${fx(r.top - 7)}px;` +
        `--f0x:${fx(f0x)}px;--f0y:${f0y}px;--fsw:${i === 0 ? 1 : -1};--frl:${i === 0 ? -5 : 7}deg;` +
        `animation-delay:${delay}ms, ${FEATHER_OUT}ms;animation-duration:${dur}ms, 500ms">${featherSvg}</b>`
      );
    })
    .join("");
  const wrap = document.createElement("div");
  wrap.className = "egg-hawkdive";
  // measured dive-path fractions — hd-dive-kf pins these to its 58%/76%
  // time marks, which is what makes every downstream delay exact
  wrap.style.setProperty("--hd-rs", `${((drop / total) * 100).toFixed(2)}%`);
  wrap.style.setProperty("--hd-re", `${(((drop + rakeLen) / total) * 100).toFixed(2)}%`);
  // paint order: shadows lowest, rake + gust + feathers over them, and the
  // diving bird LAST — it crosses the card ABOVE its own scratch marks
  wrap.innerHTML =
    `<i class="hd-shadc" style="offset-path: path('${loops(SDX, SDY, SDX2, SDY2)}')"><b></b></i>` +
    `<i class="hd-circ" style="offset-path: path('${loops(0, 0, 0, 0)}')">${soar}</i>` +
    `<i class="hd-shadd" style="offset-path: path('${shadD}'); animation-delay:${DIVE}ms"><b style="animation-delay:${DIVE}ms"></b></i>` +
    `<svg class="hd-rake" style="left:${fx(r.left)}px;top:${fx(r.top)}px" width="${fx(r.width)}" height="${fx(ch)}" viewBox="0 0 ${fx(r.width)} ${fx(ch)}" fill="none">${rakeLines}</svg>` +
    gust +
    feathers +
    `<i class="hd-dive" style="offset-path: path('${diveD}'); animation-delay:${DIVE}ms, ${DIVE}ms">${stoop}</i>`;
  document.body.appendChild(wrap);
  // the tower speaks the instant the talons touch the paper
  setTimeout(() => leagueToast(stamp, line), RAKE0);
  setTimeout(() => wrap.remove(), 8200);
}

/** BOS — The Cigar. A Celtics move adds 3+ projected wins: parquet-angle
 * light sweeps the Garden floor (the card face) and clears, Red's victory
 * cigar settles onto the card's measured bottom-right corner, the ember
 * ignites — the toast fires on that first glow — and three smoke curls rise
 * on slow S-curves. */
export function cigarEgg() {
  queueEgg("cigar", 6900, () => cigarEggRun());
}
function cigarEggRun() {
  const stamp = "Filed";
  const line = "Eighteen banners. Red would have liked this one.";
  if (reducedMotion()) {
    leagueToast(stamp, line, undefined, "Three projected wins added in one move lights it.");
    return;
  }
  const card = cardOf("BOS");
  if (!card || document.querySelector(".egg-cigar")) return;
  const r = card.getBoundingClientRect();
  const vh = window.innerHeight;
  // the cigar balances on the card's REAL bottom-right corner point. If that
  // corner isn't actually on screen — card too short, scrolled fully above the
  // viewport, or the corner below the fold — there is no stage: skip the scene
  // and let the line land immediately instead of playing to an empty room.
  if (r.height < 140 || r.bottom < 60 || r.bottom > vh - 12) {
    leagueToast(stamp, line, undefined, "Three projected wins added in one move lights it.");
    return;
  }
  const wrap = document.createElement("div");
  wrap.className = "egg-cigar";
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top}px`;
  wrap.style.width = `${r.width}px`;
  wrap.style.height = `${r.height}px`;
  // per-curl S-curve character: sway direction and diverging final drift
  const curls = [
    { d: -1, x: "-26px" },
    { d: 1, x: "24px" },
    { d: -0.7, x: "-8px" },
  ];
  wrap.innerHTML =
    '<i class="cg-floor"><b class="cg-sweep"></b><b class="cg-grain"></b></i>' +
    '<i class="cg-warm"></i>' +
    // ash tip at LEFT (raised over the card), gold band + head at RIGHT
    '<svg class="cg-cigar" width="96" height="20" viewBox="0 0 96 20" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="cg-leaf" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#8a5632"/><stop offset="0.5" stop-color="#6b3f22"/><stop offset="1" stop-color="#4a2a14"/>' +
    "</linearGradient></defs>" +
    '<rect x="15" y="4" width="66" height="15" rx="7.5" fill="url(#cg-leaf)"/>' +
    '<path d="M32 4.5 L28 18.5 M47 4.5 L43 18.5 M76 4.5 L73 18.5" stroke="rgba(28,15,6,0.35)" stroke-width="1"/>' +
    '<rect x="20" y="5.6" width="56" height="2.6" rx="1.3" fill="rgba(255,244,214,0.16)"/>' +
    '<rect x="58" y="4" width="9" height="15" fill="#BA9653"/>' +
    '<path d="M58.6 4 V19 M66.4 4 V19" stroke="rgba(58,34,10,0.45)" stroke-width="0.8"/>' +
    '<circle cx="62.5" cy="11.5" r="2.6" fill="#f4f1e9"/><circle cx="62.5" cy="11.5" r="1.4" fill="#007A33"/>' +
    '<rect x="2" y="5" width="14" height="13" rx="5" fill="#b6b0a4"/>' +
    '<path d="M8 5.4 L7 17.6 M12 5.2 L11.2 17.8" stroke="rgba(96,90,80,0.55)" stroke-width="0.9"/>' +
    '<ellipse cx="4.6" cy="11.5" rx="2.8" ry="5.4" fill="#e07030"/>' +
    "</svg>" +
    '<i class="cg-flare"></i>' +
    '<i class="cg-ember"></i>' +
    curls.map((c, i) => `<i class="cg-curl" style="--c:${i};--cd:${c.d};--cx:${c.x}"></i>`).join("");
  document.body.appendChild(wrap);
  // the paper slips out the moment the ember first glows
  setTimeout(() => leagueToast(stamp, line), 2800);
  setTimeout(() => wrap.remove(), 6900);
}

/** CHA — The Swarm. One trade lands 3+ new assets in Charlotte: the hive
 * notices. A low hum first — the card vibrates a gentle 1px while a teal seep
 * breathes at its right edge and flares as the pour begins — then 32 hornets
 * slip out from BEHIND that edge: each orbit path starts over the card face,
 * where a clip-path hole (--clipA, evenodd, cut exactly to the measured card
 * rect) occludes the dot while it fades in, so it first becomes visible
 * sliding across the right edge. The hole wipes shut after the pour, the two
 * counter-tilted streams (same paths, per-dot phase and lap tempo) slide
 * through each other and cross at the corners for ~1.8 full-flock laps, then
 * the murmuration dives — decelerating — into a tight ball hovering just off
 * the card's measured top-right corner, holds one breath while the card
 * buzz-jitters (independent translate/rotate, composing with any transform
 * the card already carries) and the toast lands, then bursts outward from
 * the corner and is gone. Condensation trick: the orbits live in one
 * container that scales to 0.042 about the corner while each hornet
 * counter-scales in lockstep, so the ring collapses into a spiral but the
 * dots stay hornet-sized. Reduced motion: no scene, toast immediately. */
export function swarmEgg() {
  queueEgg("swarm", 7450, () => swarmEggRun());
}
function swarmEggRun() {
  const stamp = "The swarm";
  const text = "Three new hornets for the nest.";
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "Three assets landing in Charlotte in one trade wakes the hive.");
    return;
  }
  if (document.querySelector(".egg-swarm")) return; // hive already out
  const card = cardOf("CHA");
  if (!card) {
    // card off the board: the trade still gets its line
    leagueToast(stamp, text, undefined, "Three assets landing in Charlotte in one trade wakes the hive.");
    return;
  }
  const r = card.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // the money shot is the ball at the top-right corner — if that corner, its
  // glow (29px right / 27px above the corner), or the pour edge isn't fully
  // on stage, skip the scene and let the line land on its own instead of
  // playing to an empty room
  if (r.right < 70 || r.right > vw - 40 || r.top < 30 || r.top > vh - 70) {
    leagueToast(stamp, text, undefined, "Three assets landing in Charlotte in one trade wakes the hive.");
    return;
  }
  const ch = Math.min(r.height, 460);
  const cx = r.left + r.width / 2;
  const cy = r.top + ch / 2;
  const fx = (n: number) => n.toFixed(1);
  // two orbit ellipses hugging the measured card, tilted against each other
  // (+7deg / -9deg via their stream containers) so the streams cross near
  // the corners. Each path STARTS inside the card rect (between the angle
  // where the ellipse re-enters through the right edge and where it exits
  // through the top), so a hornet fades in while the clip hole hides it,
  // then sweeps clockwise out across the right edge — the emergence.
  const ell = (rx: number, ry: number) => {
    const thX = Math.acos(Math.min(0.98, r.width / 2 / rx));
    const thY = Math.asin(Math.min(0.98, ch / 2 / ry));
    const t0 = -(thX + Math.max(0, thY - thX) * 0.55);
    const pt = (a: number) => `${fx(cx + rx * Math.cos(a))} ${fx(cy + ry * Math.sin(a))}`;
    return `M ${pt(t0)} A ${fx(rx)} ${fx(ry)} 0 1 1 ${pt(t0 + Math.PI)} A ${fx(rx)} ${fx(ry)} 0 1 1 ${pt(t0)} Z`;
  };
  const paths = [ell(r.width / 2 + 30, ch / 2 + 24), ell(r.width / 2 + 46, ch / 2 + 8)];
  // the occluder: full viewport with an evenodd hole over the card (open),
  // animating to the same shape with the hole collapsed at the right edge
  const holed = (l: number) =>
    `polygon(evenodd, 0 0, 100vw 0, 100vw 100vh, 0 100vh, 0 0, ` +
    `${fx(l)}px ${fx(r.top - 2)}px, ${fx(l)}px ${fx(r.top + ch + 2)}px, ` +
    `${fx(r.right)}px ${fx(r.top + ch + 2)}px, ${fx(r.right)}px ${fx(r.top - 2)}px, ` +
    `${fx(l)}px ${fx(r.top - 2)}px)`;
  // the ball hovers just OFF the corner point — measured, plus a 4px float
  const ox = r.right + 4;
  const oy = r.top - 4;
  // scene clock: hum 0–1.35s · pour 0.95–2.05s · clip release 2.05–2.45s ·
  // full-flock orbit to 4.5s · dive 4.5–5.3s · ball hold (one breath)
  // 5.3–6.2s · burst 6.2–6.85s. The 7.5s condenser keyframes own every
  // downstream beat; these constants mirror it in JS.
  const BALL = 5300;
  const POUR0 = 950;
  const LIFE_END = 6700; // hornets extinguish mid-burst, before full spread
  let dotsA = "";
  let dotsB = "";
  for (let i = 0; i < 32; i++) {
    const sIdx = i % 2; // alternate streams so both fill evenly
    // the pour: one-by-one at 34ms cadence — all 32 in by ~2.03s
    const e = POUR0 + i * 34 + Math.random() * 22;
    // stream B laps slower — the two bands slide through each other
    const lap = (sIdx ? 1680 : 1360) * (0.92 + Math.random() * 0.16);
    const life = LIFE_END - e;
    const s = 2.4 + Math.random() * 0.6; // 2.4–3px long axis, spec-true
    const o = (0.7 + Math.random() * 0.3).toFixed(2);
    // per-hornet lane jitter: shifts its whole orbit ±4px → band thickness
    const tx = (Math.random() * 8 - 4).toFixed(1);
    const ty = (Math.random() * 8 - 4).toFixed(1);
    const tone = i % 3 === 2 ? "swm-k" : "swm-t"; // 2:1 teal to black
    const dot =
      `<i class="swm-h ${tone}" style="offset-path: path('${paths[sIdx]}'); translate: ${tx}px ${ty}px;` +
      `--e:${e.toFixed(0)}ms;--lap:${lap.toFixed(0)}ms;--life:${life.toFixed(0)}ms;--o:${o}">` +
      `<b style="width:${fx(s)}px;height:${fx(s * 0.6)}px"></b></i>`;
    if (sIdx) dotsB += dot;
    else dotsA += dot;
  }
  const wrap = document.createElement("div");
  wrap.className = "egg-swarm";
  wrap.innerHTML =
    // the seep — the hive light under the card's right edge, breathing with
    // the hum, flaring as the pour begins (it sits OUTSIDE the clip layer so
    // the card-rect hole never cuts it)
    `<i class="swm-seep" style="left:${fx(r.right - 7)}px;top:${fx(cy - ch * 0.22)}px;height:${fx(ch * 0.44)}px"></i>` +
    // the occluder wraps the orbital system: hole open during the pour so
    // hornets fade in hidden over the card face and emerge at the edge
    `<b class="swm-clip" style="--clipA:${holed(r.left - 2)};--clipB:${holed(r.right)}">` +
    // the condenser: everything orbital scales about the measured corner
    `<b class="swm-cond" style="transform-origin:${fx(ox)}px ${fx(oy)}px">` +
    `<b class="swm-tilt" style="transform-origin:${fx(cx)}px ${fx(cy)}px;transform:rotate(7deg)">${dotsA}</b>` +
    `<b class="swm-tilt" style="transform-origin:${fx(cx)}px ${fx(cy)}px;transform:rotate(-9deg)">${dotsB}</b>` +
    "</b></b>" +
    `<i class="swm-glow" style="left:${fx(ox)}px;top:${fx(oy)}px"></i>`;
  document.body.appendChild(wrap);
  // beat 1 — the hum: the card vibrates gently while the hive stirs
  card.classList.add("egg-swarm-hum");
  setTimeout(() => {
    const c = cardOf("CHA");
    if (c) c.classList.remove("egg-swarm-hum");
  }, 1400);
  // beat 3 — the ball: the card buzz-jitters ONLY while the swarm is
  // condensed (5.3–6.2s), and the stamp lands at the top of the hold.
  // Both add and remove re-query the card so a board re-render mid-buzz
  // can't strand the class on a stale node.
  setTimeout(() => {
    const c = cardOf("CHA");
    if (c) {
      c.classList.add("egg-swarm-buzz");
      setTimeout(() => {
        const c2 = cardOf("CHA");
        if (c2) c2.classList.remove("egg-swarm-buzz");
      }, 960);
    }
  }, BALL - 10);
  setTimeout(() => leagueToast(stamp, text), BALL + 60);
  setTimeout(() => wrap.remove(), 7450);
}

/** DAL — The Stampede. One trade sends two or more players out of Dallas:
 * a rumble builds from the west — haze gathering on the card's left horizon,
 * two-tone pebbles hopping on the ledger's measured bottom edge, the card
 * ITSELF trembling on an escalating envelope that never decays, only grows —
 * then the quake SLAMS as the dust front crosses the west edge and a rolling
 * three-layer ochre cloud sweeps the card left to right while, inside the
 * dust, cloven hoofprints stamp a measured low-left→high-right diagonal
 * across the face in gallop cadence (three quick beats, a suspension,
 * again). The dust drains off the trailing edge, the prints blow away
 * oldest-first, the ground goes dead still — the toast lands alone in that
 * clearing — and after a breath one lone star blooms top-center, settles,
 * holds a true still beat, and glints where the herd used to be. */
export function stampedeEgg() {
  queueEgg("stampede", 7800, () => stampedeEggRun());
}
function stampedeEggRun() {
  const stamp = "The herd has moved";
  const text = "Defense wins championships. Condolences on file.";
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "Three Mavericks out the door in one trade starts the run.");
    return;
  }
  // double-fire stays silent (the first run is already delivering the line)
  if (document.querySelector(".egg-stampede")) return;
  const card = cardOf("DAL");
  if (!card) {
    // no stage — the condolence note still lands, immediately
    leagueToast(stamp, text, undefined, "Three Mavericks out the door in one trade starts the run.");
    return;
  }
  const r = card.getBoundingClientRect();
  const vh = window.innerHeight;
  // no stage if the card is too short for a diagonal, or essentially
  // off-screen — the line still lands, immediately, to an empty plain
  if (r.height < 150 || r.bottom < 80 || r.top > vh - 80) {
    leagueToast(stamp, text, undefined, "Three Mavericks out the door in one trade starts the run.");
    return;
  }
  const ch = r.height; // fill the whole card
  const RUN = 70; // run-up margin either side, so the cloud enters/exits clean
  const SKY = 26; // billow room above the card's top edge
  const W = r.width + RUN * 2;
  const H = SKY + ch;
  const fx = (n: number) => n.toFixed(1);

  // ---- the measured diagonal: low-left to high-right across the card face
  const x0 = RUN + r.width * 0.09;
  const y0 = SKY + ch * 0.8;
  const x1 = RUN + r.width * 0.88;
  const y1 = SKY + ch * 0.3;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  const nx = -(y1 - y0) / len; // unit perpendicular — left/right hooves
  const ny = (x1 - x0) / len; //   straddle the line like real tracks

  // ---- hoofprints in gallop cadence: three quick beats, a suspension,
  // again (600ms stride, beats at +0/+125/+255). Older prints fade FIRST
  // (fade end walks left→right, 4.3s→5.02s), matching the dust draining
  // off the trailing edge. Each print carries its own ground-stain plate
  // (contrast on both themes) and its own stamp-poof.
  const N = 9;
  let prints = "";
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const off = (i % 2 ? 1 : -1) * (7 + Math.random() * 2.5);
    const px = x0 + (x1 - x0) * f + nx * off;
    const py = y0 + (y1 - y0) * f + ny * off;
    const d = 1780 + Math.floor(i / 3) * 600 + [0, 125, 255][i % 3];
    const life = 4300 + i * 90 - d;
    prints +=
      `<i class="sp-print" style="left:${fx(px)}px;top:${fx(py)}px;transform:translate(-50%,-50%) rotate(${ang.toFixed(1)}deg)">` +
      `<span class="sp-hoof" style="animation-delay:${d}ms,${d}ms;animation-duration:300ms,${life}ms"><u class="sp-plate"></u></span>` +
      `<b class="sp-poof" style="animation-delay:${d}ms"></b></i>`;
  }

  // ---- the dust: three layers on separate clocks — a big soft back wall
  // (softness baked into its gradient, no filter), mid rollers, and small
  // sharp foreground boulders that run OVER the prints (DOM order puts
  // prints between mid and fore, so the tracks read as INSIDE the cloud).
  // Layer starts at 1150/1250/1350ms put the visible front AT the west edge
  // for the ~1.5s quake-slam and comfortably past the first print's x by
  // its 1780ms stamp — the herd is never seen printing bare ledger.
  const puffs = (
    cls: string,
    L: { n: number; sz: number; szj: number; d0: number; step: number; dur: number; y0: number; y1: number; op: number }
  ) => {
    let out = "";
    for (let i = 0; i < L.n; i++) {
      const s = L.sz + Math.random() * L.szj;
      const top = (L.y0 + Math.random() * (L.y1 - L.y0)) * H - s / 2;
      const d = L.d0 + i * L.step + Math.random() * 110;
      const dur = L.dur * (0.92 + Math.random() * 0.16);
      const po = (L.op * (0.85 + Math.random() * 0.3)).toFixed(2);
      const rise = -(6 + Math.random() * 22);
      const gs = (1.15 + Math.random() * 0.35).toFixed(2);
      out +=
        `<i class="sp-puff ${cls}" style="left:${(-s).toFixed(0)}px;top:${fx(top)}px;width:${s.toFixed(0)}px;height:${s.toFixed(0)}px;` +
        `--po:${po};--tx:${(W + s * 2).toFixed(0)}px;--rise:${rise.toFixed(0)}px;--gs:${gs};` +
        `animation-duration:${dur.toFixed(0)}ms;animation-delay:${d.toFixed(0)}ms"></i>`;
    }
    return out;
  };

  // ---- anticipation props: pebbles hop on the card's measured bottom
  // edge while the ground shakes; a haze gathers at the west horizon
  const pebbles = [0.2, 0.38, 0.61, 0.8]
    .map((t, i) => `<b class="sp-peb" style="left:${fx(RUN + r.width * t)}px;top:${fx(SKY + ch - 5)}px;animation-delay:${420 + i * 260}ms"></b>`)
    .join("");
  const haze = `<i class="sp-haze" style="top:${fx(SKY + ch * 0.18)}px;height:${fx(ch * 0.55)}px"></i>`;
  // across the full card height the wash's bottom edge
  // is mid-card — round only the top corners so no phantom radius shows
  const radTok = (getComputedStyle(card).borderRadius || "8px").split(" ")[0] || "8px";
  const washRad = ch < r.height ? `${radTok} ${radTok} 0 0` : radTok;
  const wash = `<i class="sp-wash" style="left:${RUN}px;top:${SKY}px;width:${fx(r.width)}px;height:${fx(ch)}px;border-radius:${washRad}"></i>`;

  // ---- the lone star, anchored to the card's measured top-center. It
  // blooms at 5.2s — a full breath AFTER the 4.4s toast has had the
  // clearing to itself — settles ~5.9s, holds still, glints at 6.4s.
  const sx = RUN + r.width / 2;
  const sy = SKY + 34;
  const star =
    `<b class="sp-halo" style="left:${fx(sx)}px;top:${sy}px"></b>` +
    `<svg class="sp-star" style="left:${fx(sx)}px;top:${sy}px" width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">` +
    '<defs><linearGradient id="sp-star-g" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#f4f6f7"/><stop offset="0.55" stop-color="#c9d2d8"/><stop offset="1" stop-color="#9fb0ba"/>' +
    "</linearGradient></defs>" +
    '<path d="M 22 2 L 26.8 15.4 L 41 15.8 L 29.8 24.5 L 33.8 38.2 L 22 30.2 L 10.2 38.2 L 14.2 24.5 L 3 15.8 L 17.2 15.4 Z" fill="url(#sp-star-g)" stroke="#00285E" stroke-width="1.3" stroke-linejoin="round"/>' +
    "</svg>" +
    `<b class="sp-spark" style="left:${fx(sx + 9)}px;top:${sy - 11}px"></b>`;

  const wrap = document.createElement("div");
  wrap.className = "egg-stampede";
  wrap.style.left = `${fx(r.left - RUN)}px`;
  wrap.style.top = `${fx(r.top - SKY)}px`;
  wrap.style.width = `${fx(W)}px`;
  wrap.style.height = `${fx(H)}px`;
  wrap.innerHTML =
    wash +
    haze +
    pebbles +
    puffs("sp-back", { n: 5, sz: 120, szj: 55, d0: 1150, step: 190, dur: 2800, y0: 0.14, y1: 0.6, op: 0.34 }) +
    puffs("sp-mid", { n: 6, sz: 84, szj: 40, d0: 1250, step: 165, dur: 2600, y0: 0.32, y1: 0.86, op: 0.48 }) +
    prints +
    puffs("sp-fore", { n: 7, sz: 52, szj: 30, d0: 1350, step: 130, dur: 2300, y0: 0.5, y1: 1.04, op: 0.62 }) +
    star;
  document.body.appendChild(wrap);

  // ---- the ground: ONE escalating quake on the card itself — a sub-pixel
  // tremble that only GROWS through Act I, a hard slam keyed to the front
  // crossing the west edge (~1.5s), then a rolling decay that is dead still
  // by 4.4s, exactly when the toast asks for the quiet.
  card.classList.add("sp-quake");
  setTimeout(() => {
    (cardOf("DAL") ?? card).classList.remove("sp-quake");
  }, 4850);

  // the condolence note lands ALONE in the clearing — prints gone by 5.02s,
  // last dust draining east, a full breath BEFORE the star asks for the eye
  setTimeout(() => leagueToast(stamp, text), 4400);
  setTimeout(() => wrap.remove(), 7800);
}

/** DEN · The Summit — a Nuggets move makes them #1 in projected wins,
 * league-wide: altitude, literally. The card takes a breath — a 2.5px
 * crouch while its shadow sharpens underneath — then the CARD ITSELF rises
 * 12px off the ledger (one-shot lift class, applied like shake()); the
 * proof is under it: a soft shadow detaches from the measured footprint,
 * growing and blurring in keyframes that mirror the lift's master clock
 * beat for beat (with a true-black, cool-rimmed dark-theme variant so the
 * detach reads on the night ledger too). Two cloud wisps drift through the
 * gap BETWEEN the card and its shadow — near one low, fast, bright; far
 * one on the shadow line, slow, faint, opposite direction: the parallax
 * beat — under a clearance contract that keeps the near wisp out of the
 * card's pixels at the bob trough. A snowcap fades in along the measured
 * top edge the frame the card reaches altitude, wearing the card's own
 * corner radius; one gold sun-glint sweeps its exact width on the toast
 * beat, sparkles come off the snow through a 2.8s thin-air float, and the
 * card settles back down with a soft +0.8px touch. */
export function summitEgg() {
  queueEgg("paydirt", 4600, () => summitEggRun());
}
function summitEggRun() {
  const stamp = "Struck gold";
  const text = "First in the league, at altitude. The Nuggets hit paydirt.";
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "Denver just became the league's No. 1 projection.");
    return;
  }
  const card = cardOf("DEN");
  if (!card || document.querySelector(".egg-paydirt")) return;
  const r = card.getBoundingClientRect();
  const w = r.width;
  const h = r.height;
  const sx = w * 0.5; // strike point
  const sy = h * 0.3;
  // gold ore veins: jagged branches from the strike, drawn then held
  const vein = (a: number, len: number, kink: number): string => {
    let d = `M ${sx.toFixed(0)} ${sy.toFixed(0)}`;
    let x = sx, y = sy;
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      x = sx + Math.cos(a) * len * t + (i % 2 ? -kink : kink) * (1 - t);
      y = sy + Math.sin(a) * len * t + (i % 2 ? kink : -kink) * 0.5;
      d += ` L ${x.toFixed(0)} ${y.toFixed(0)}`;
    }
    return d;
  };
  const branches = [
    vein(2.5, h * 0.55, 14),
    vein(0.7, h * 0.5, 12),
    vein(1.9, h * 0.62, 16),
    vein(1.15, h * 0.42, 10),
  ];
  const veinSvg =
    `<svg class="pd-veins" width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" fill="none">` +
    branches.map((d, i) =>
      `<path class="pd-vein" pathLength="1" d="${d}" style="animation-delay:${350 + i * 90}ms"/>`
    ).join("") +
    "</svg>";
  // nuggets erupt from the strike and arc down over the card
  const nuggets = Array.from({ length: 14 }, (_, i) => {
    const ang = (i / 14) * Math.PI * 2;
    const spread = 40 + ((i * 17) % 70);
    const nx = Math.cos(ang) * spread;
    const ny = h * (0.5 + ((i * 11) % 40) / 100);
    const sz = 5 + (i % 4);
    return `<i class="pd-nug" style="left:${sx.toFixed(0)}px;top:${sy.toFixed(0)}px;--nx:${nx.toFixed(0)}px;--ny:${ny.toFixed(0)}px;width:${sz}px;height:${sz}px;animation-delay:${300 + (i * 45) % 500}ms"></i>`;
  }).join("");
  const wrap = document.createElement("div");
  wrap.className = "egg-paydirt";
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top}px`;
  wrap.style.width = `${w}px`;
  wrap.style.height = `${h}px`;
  wrap.style.setProperty("--pd-r", getComputedStyle(card).borderRadius || "8px");
  wrap.innerHTML =
    '<i class="pd-gleam"></i>' +
    `<i class="pd-flash" style="left:${sx.toFixed(0)}px;top:${sy.toFixed(0)}px"></i>` +
    veinSvg +
    nuggets +
    '<b class="pd-stamp stamp">Struck gold</b>';
  document.body.appendChild(wrap);
  setTimeout(() => leagueToast(stamp, text), 2200);
  setTimeout(() => wrap.remove(), 4600);
}

/** DET — The Assembly Line. Any Pistons signing: a press slab exactly as
 * wide as the card descends on its hydraulic rod — engage-jerk, a breath,
 * then the committed drop — CLUNKS the card into a held squash, sprays
 * exactly three sparks off the die–card seam, brands the face with a
 * crooked "DEEE-TROIT BASKETBALL" ink stamp, and lifts. Another shift. */
export function assemblyLineEgg() {
  queueEgg("assembly", 5200, () => assemblyLineEggRun());
}
function assemblyLineEggRun() {
  const toast = () => leagueToast("Deee-troit", "Basketball. Another shift on the line.");
  if (reducedMotion()) {
    toast();
    return;
  }
  if (document.querySelector(".egg-assembly-line")) return; // already mid-shift
  const card = cardOf("DET");
  if (!card) {
    // card off the board: the signing still gets its line
    toast();
    return;
  }
  const r = card.getBoundingClientRect();
  const ch = Math.min(r.height, 420);
  const pressH = 96;
  // press bottom must land exactly on the card's top edge; start off-screen
  const drop = Math.max(r.top, 200);
  // die follow-through = the card's REAL compression: scaleY(0.958) about a
  // bottom origin drops the top edge by 4.2% of the full measured height.
  // Fed to al-press-kf as --al-crush so the die rests on the squashed card.
  const crush = r.height * 0.042;
  const seam = r.top + crush; // where the die face meets the compressed card
  const CONTACT = 1864; // 100ms delay + 42% of the 4.2s press cycle (0.42 * 4200 + 100)
  // three sparks: left / center / right along the measured seam
  const sparks: [number, number, number][] = [
    [0.08, -52, -38],
    [0.5, 10, -56],
    [0.92, 58, -30],
  ];
  const wrap = document.createElement("div");
  wrap.className = "egg-assembly-line";
  wrap.innerHTML =
    `<i class="al-shadow" style="left:${r.left.toFixed(1)}px;top:${r.top.toFixed(1)}px;width:${r.width.toFixed(1)}px;height:${ch.toFixed(1)}px"></i>` +
    // stamp before the press in DOM (and z 2 < 3): ink under the iron
    `<b class="al-stamp stamp" style="left:${(r.left + r.width / 2).toFixed(1)}px;top:${(r.top + ch * 0.45).toFixed(1)}px;animation-delay:${CONTACT + 10}ms">DEEE-TROIT BASKETBALL</b>` +
    `<i class="al-press" style="left:${r.left.toFixed(1)}px;top:${(r.top - pressH).toFixed(1)}px;width:${r.width.toFixed(1)}px;height:${pressH}px;--drop:${drop.toFixed(1)}px;--al-crush:${crush.toFixed(1)}px">` +
    '<i class="al-rod"></i><b class="al-label">№ 313</b></i>' +
    `<i class="al-jolt" style="left:${r.left.toFixed(1)}px;top:${seam.toFixed(1)}px;width:${r.width.toFixed(1)}px;animation-delay:${CONTACT}ms"></i>` +
    sparks
      .map(
        ([fx, sx, sy], i) =>
          `<b class="al-spark" style="left:${(r.left + r.width * fx).toFixed(1)}px;top:${seam.toFixed(1)}px;--sx:${sx}px;--sy:${sy}px;animation-delay:${CONTACT + i * 45}ms"></b>`
      )
      .join("") +
    "";
  document.body.appendChild(wrap);
  // the clunk: card squashes the instant the die meets it, held while it dwells
  setTimeout(() => {
    const c = cardOf("DET");
    if (c) {
      c.classList.add("egg-clunk");
      setTimeout(() => c.classList.remove("egg-clunk"), 1600);
    }
  }, CONTACT - 20);
  setTimeout(toast, CONTACT + 60);
  setTimeout(() => wrap.remove(), 5200);
}

/** GSW — Light-Years. The projection first clears +10 wins over baseline: the
 * Warriors aren't just better, they're somewhere else. The card's own corners
 * ignite clockwise, a star field gathers and twinkles around it, holds a long
 * breath — then every star coils inward and streaks radially out from the
 * card's measured center IN UNISON (the card is the ship) while a blue-gold
 * nebula donut blooms around it; the dim layer carries a feathered hole at
 * the rect so the ship stays the brightest thing in the room. A rect-sized
 * flash, and a new sky snaps into place: still, one gold marker landing
 * exactly on the card's top-right corner. The stamp waits for genuine
 * stillness. */
export function lightYearsEgg() {
  queueEgg("lightyears", 6600, () => lightYearsEggRun());
}
function lightYearsEggRun() {
  const msg = "Not just better — better in a different way entirely.";
  if (reducedMotion()) {
    leagueToast("Light-years", msg, undefined, "Crossing ten wins above your day-one baseline does it.");
    return;
  }
  const card = cardOf("GSW");
  if (!card || document.querySelector(".egg-lightyears")) return;
  const r = card.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardH = Math.min(r.height, 420);
  const cx = r.left + r.width / 2;
  const cy = r.top + cardH / 2;
  const halfDiag = Math.hypot(r.width, cardH) / 2;
  // distance from the card's center to the viewport edge along angle a,
  // clamped at 0 so a half-scrolled card can never produce an inward ray
  const edge = (a: number) => {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const tx = dx > 0 ? (vw - cx) / dx : dx < 0 ? -cx / dx : Infinity;
    const ty = dy > 0 ? (vh - cy) / dy : dy < 0 ? -cy / dy : Infinity;
    return Math.max(Math.min(tx, ty), 0);
  };
  const deg = (a: number) => ((a * 180) / Math.PI).toFixed(1);
  const tint = ["ly-w", "ly-g", "ly-w", "ly-b"];
  let html = '<i class="ly-dim"></i>' +
    `<i class="ly-halo" style="left:${cx.toFixed(0)}px;top:${cy.toFixed(0)}px;width:${(r.width * 2.2).toFixed(0)}px;height:${(cardH * 1.7).toFixed(0)}px"></i>`;
  // the card's own corners ignite first, clockwise — its silhouette is the
  // ship, and at the jump these four fly the card's exact diagonals
  const corners: Array<[number, number]> = [
    [r.left, r.top],
    [r.right, r.top],
    [r.right, r.top + cardH],
    [r.left, r.top + cardH],
  ];
  corners.forEach(([px, py], i) => {
    const a = Math.atan2(py - cy, px - cx);
    const r0 = Math.hypot(px - cx, py - cy) + 6;
    const r1 = Math.max(edge(a) + 170, r0 + 220);
    html += `<i class="ly-star ly-g ly-c" style="--a:${deg(a)}deg;--r0:${r0.toFixed(1)}px;--r1:${r1.toFixed(0)}px;--d:${i * 70}ms;--s:5px"></i>`;
  });
  // the field: an annulus of stars scattered around the card, golden-angle
  // spacing with jitter, each clamped inside the viewport along its own ray.
  // No departure jitter — unison IS the jump; variation lives in --r1.
  for (let i = 0; i < 24; i++) {
    const a = (((i * 137.5 + 23) % 360) * Math.PI) / 180 + (Math.random() - 0.5) * 0.3;
    const rim = edge(a);
    const r0 = Math.max(28, Math.min(halfDiag * (0.72 + Math.random() * 1.15), rim - 20));
    const r1 = Math.max(rim + 170, r0 + 220);
    html += `<i class="ly-star ${tint[i % 4]}" style="--a:${deg(a)}deg;--r0:${r0.toFixed(1)}px;--r1:${r1.toFixed(0)}px;--d:${170 + ((i * 83) % 520)}ms;--s:${3 + (i % 2)}px"></i>`;
  }
  // arrival: a new sky, same card. The marker lands on the top-right corner
  // first; the constellation follows; everything then holds STILL.
  html += `<b class="ly-arr ly-g ly-mark" style="left:${r.right.toFixed(0)}px;top:${r.top.toFixed(0)}px;--d:3560ms;--s:6px"></b>`;
  for (let i = 0; i < 16; i++) {
    const a = (((i * 137.5 + 61) % 360) * Math.PI) / 180 + (Math.random() - 0.5) * 0.3;
    const rr = Math.max(30, Math.min(halfDiag * (0.7 + Math.random() * 1.2), edge(a) - 24));
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    html += `<b class="ly-arr ${tint[i % 4]}" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;--d:${3620 + ((i * 37) % 170)}ms;--s:${3 + (i % 2)}px"></b>`;
  }
  // the exit flash goes LAST so it composites above the streaks it masks
  html += '<i class="ly-flash"></i>';
  const wrap = document.createElement("div");
  wrap.className = "egg-lightyears";
  wrap.style.setProperty("--cx", `${cx.toFixed(0)}px`);
  wrap.style.setProperty("--cy", `${cy.toFixed(0)}px`);
  // feathered hole in the dim at the card rect (0.72 ≈ half-diagonal cover)
  wrap.style.setProperty("--hw", `${(r.width * 0.72 + 24).toFixed(0)}px`);
  wrap.style.setProperty("--hh", `${(cardH * 0.72 + 24).toFixed(0)}px`);
  // exit flash sized from the rect, like everything else in the scene
  wrap.style.setProperty("--fw", `${(r.width * 1.7).toFixed(0)}px`);
  wrap.style.setProperty("--fh", `${(cardH * 1.5).toFixed(0)}px`);
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  // the hull rumbles under thrust — house rumble at its full 1.9s duration
  // (engines spool at the arm, burn through the jump, settle by arrival)
  setTimeout(() => {
    const c = cardOf("GSW");
    if (c) shake(c, "egg-rumble", 1900);
  }, 2000);
  // the stamp waits for true arrival stillness — flash gone by 3.98s, last
  // constellation snap done by ~4.09s, a held beat, then the toast at 4.4s
  setTimeout(() => leagueToast("Light-years", msg), 4400);
  setTimeout(() => wrap.remove(), 6600);
}

export function launchEgg() {
  queueEgg("launch", 8000, () => launchEggRun());
}
function launchEggRun() {
  const stamp = "Liftoff";
  const text = "The launch window was open. Houston took it.";
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "Two projected wins added in one move is a launch.");
    return;
  }
  const card = cardOf("HOU");
  if (!card || document.querySelector(".egg-launch")) return;
  const r = card.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // the pad: BOTH bottom corners must sit on the visible board floor, the
  // ticker corner must be on screen, and the card must be inside the
  // viewport horizontally (a clipped card would put the chip or a whole jet
  // off-screen) — no stage, no scene; the call still goes out immediately
  // instead of playing to an empty room.
  if (
    r.height < 150 ||
    r.bottom < 90 ||
    r.bottom > vh - 14 ||
    r.top > vh - 140 ||
    r.top < 0 ||
    r.left < 8 ||
    r.right > vw - 8
  ) {
    leagueToast(stamp, text, undefined, "Two projected wins added in one move is a launch.");
    return;
  }
  // the metronome: every beat in the scene derives from these two numbers.
  // Rows at T0 + n·BEAT, lamp delay T0 / period BEAT, ignition (--ign and
  // the .lw-ign stamp via CSS) at T0 + 3·BEAT. Tune BEAT or T0 here and the
  // countdown, lamp, stamp, flash, jets, scorch, haze, and dim-cut all move
  // together — nothing can desync.
  const BEAT = 1000;
  const T0 = 700;
  const IGN = T0 + 3 * BEAT; // 3700ms
  const fx = (n: number) => n.toFixed(1);
  // the two nozzles: the card's measured bottom corners, nudged 3px inboard;
  // avail clamps every outward-moving element inside the viewport
  const jets = [
    { x: r.left + 3, jd: -1, jf: "0.22s", avail: Math.max(r.left - 24, 40) },
    { x: r.right - 3, jd: 1, jf: "0.26s", avail: Math.max(vw - r.right - 24, 40) },
  ];
  // 0) the room goes quiet — a faint dim under everything, cutting at --ign
  let html = '<i class="lw-dim"></i>';
  // 1) mission control — the ticker chip pinned to the top-right corner;
  //    right-alignment stacks the countdown digits into one tabular column.
  //    IGNITION carries no inline delay: its clock IS var(--ign) in CSS.
  html +=
    `<i class="lw-ticker" style="right:${fx(vw - r.right + 10)}px;top:${fx(r.top + 10)}px">` +
    '<b class="lw-th" style="animation-delay:350ms">HOU&nbsp;&middot;&nbsp;MCC' +
    `<i class="lw-dot" style="animation-delay:${T0}ms;animation-duration:${BEAT}ms"></i></b>` +
    `<b class="lw-tr" style="animation-delay:${T0}ms">T-MINUS&nbsp;3</b>` +
    `<b class="lw-tr" style="animation-delay:${T0 + BEAT}ms">2</b>` +
    `<b class="lw-tr" style="animation-delay:${T0 + 2 * BEAT}ms">1</b>` +
    '<b class="lw-tr lw-ign">IGNITION</b>' +
    "</i>";
  for (const j of jets) {
    // 2) ignition hardware at this measured corner: scorch pool, flash, jet
    //    (glow + sheath + core), and a ground-haze strip spreading outward
    html +=
      `<i class="lw-scorch" style="left:${fx(j.x)}px;top:${fx(r.bottom)}px"></i>` +
      `<b class="lw-flash" style="left:${fx(j.x)}px;top:${fx(r.bottom)}px"></b>` +
      `<i class="lw-jet" style="left:${fx(j.x)}px;top:${fx(r.bottom)}px;--jd:${j.jd};--jf:${j.jf}">` +
      '<b class="lw-glow"></b><b class="lw-flame"><b class="lw-core"></b></b></i>';
    const run = Math.min(j.avail, 170);
    html +=
      `<i class="lw-haze ${j.jd < 0 ? "lw-hl" : "lw-hr"}" style="left:${fx(j.jd < 0 ? j.x - run : j.x)}px;` +
      `top:${fx(r.bottom)}px;width:${fx(run)}px"></i>`;
    // 3) smoke — seven puffs per side, each on its own clock, billowing
    //    OUTWARD along y = the card's bottom edge, runs clamped on-screen
    for (let i = 0; i < 7; i++) {
      const sz = 26 + ((i * 17) % 26) + Math.random() * 8;
      const px = j.jd * Math.min(30 + i * 24 + Math.random() * 20, j.avail - 6);
      const py = -(6 + Math.random() * 14) - sz * 0.1;
      const d = IGN + 60 + i * 130 + Math.random() * 90;
      const dur = 2200 + Math.random() * 800;
      const o = 0.45 + Math.random() * 0.22;
      html +=
        `<i class="lw-puff" style="left:${fx(j.x)}px;top:${fx(r.bottom)}px;` +
        `width:${fx(sz)}px;height:${fx(sz * 0.82)}px;--px:${fx(px)}px;--py:${fx(py)}px;--po:${o.toFixed(2)};` +
        `animation-delay:${d.toFixed(0)}ms;animation-duration:${dur.toFixed(0)}ms"></i>`;
    }
  }
  const wrap = document.createElement("div");
  wrap.className = "egg-launch";
  wrap.style.setProperty("--ign", `${IGN}ms`);
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  // the engines spool under the last two counts; the house rumble runs its
  // full 1.9s and ENDS at 3400ms — 300ms of dead quiet before ignition
  setTimeout(() => {
    const c = cardOf("HOU");
    if (c) shake(c, "egg-rumble", 1900);
  }, IGN - 2200);
  // liftoff — the card is the vehicle (squat, rise, wobble hold, power-down,
  // touchdown compress, rebound; the chip and jet envelope carry the same
  // waypoints, so all three read as one rigid vehicle)
  setTimeout(() => {
    const c = cardOf("HOU");
    if (c) {
      c.classList.add("egg-liftoff");
      setTimeout(() => c.classList.remove("egg-liftoff"), 3400);
    }
  }, IGN);
  // the call goes out ON the ignition beat, not the trigger
  setTimeout(() => leagueToast(stamp, text), IGN + 40);
  setTimeout(() => wrap.remove(), 8000);
}

/** IND — The 500. The Pacers WIN a trade on the value meter: race day at
 * the Brickyard. A green pennant plants itself on the card's top-left
 * corner, drops in, and waves while the car — a light-streak comet, white-
 * gold head trailing to navy — revs on a painted yard-of-bricks start/
 * finish band. The flag SNAPS down (landing exactly on the launch) and the
 * comet takes one full clockwise lap around the card's measured border:
 * braking visibly into every turn (a red flare at each corner entry), back
 * on the throttle out of them, stepping out onto the bottom straight where
 * two faint tire marks stay behind in its wake. It takes the checkered
 * wipe flat-out at the line — the PA calls "One to go" ON the flag, not on
 * the trigger. The trail is seven time-lagged ghosts running the same lap
 * 50ms apart, so raw speed becomes comet LENGTH: long down the straights,
 * bunched tight in the corners — and as the lags expire at the line, the
 * whole field visibly compresses into the finish before fading. */
export function brickyardEgg() {
  queueEgg("brickyard", 7400, () => brickyardEggRun());
}
function brickyardEggRun() {
  const stamp = "One to go";
  const text = "Fastest lap in the trade. Gasoline Alley approves.";
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "Winning a trade by five-plus value units takes the flag.");
    return;
  }
  const card = cardOf("IND");
  if (!card || document.querySelector(".egg-brickyard")) return;
  const r = card.getBoundingClientRect();
  const w = r.width;
  // clamp the track to the visible region: the lap, the bottom turns, and
  // the tire marks all live on the rectangle's bottom edge, so it must be
  // on screen — shrink to fit, and if no real track survives (or there's
  // no headroom for the flag stand), the call still gets made, immediately
  const ch = Math.min(r.height, window.innerHeight - r.top - 8); // fill the whole card
  if (w < 200 || ch < 140 || r.top < 54) {
    leagueToast(stamp, text, undefined, "Winning a trade by five-plus value units takes the flag.");
    return;
  }
  const rr = Math.min(parseFloat(getComputedStyle(card).borderRadius) || 8, Math.min(w, ch) / 2);
  const fx = (n: number) => n.toFixed(1);
  // the start/finish line: painted on the top edge, just clear of turn 4
  const sx = rr + 26;
  // the racing line IS the card's rounded border, clockwise from the line
  const track =
    `M ${fx(sx)} 0 L ${fx(w - rr)} 0 A ${fx(rr)} ${fx(rr)} 0 0 1 ${fx(w)} ${fx(rr)} ` +
    `L ${fx(w)} ${fx(ch - rr)} A ${fx(rr)} ${fx(rr)} 0 0 1 ${fx(w - rr)} ${fx(ch)} ` +
    `L ${fx(rr)} ${fx(ch)} A ${fx(rr)} ${fx(rr)} 0 0 1 0 ${fx(ch - rr)} ` +
    `L 0 ${fx(rr)} A ${fx(rr)} ${fx(rr)} 0 0 1 ${fx(rr)} 0 Z`;
  // Cumulative lap distance at each turn's entry/exit. The by-lap keyframe
  // TIME schedule is fixed choreography; these vars pin its DISTANCE
  // waypoints to this card's real perimeter, so turn-in always happens at
  // the measured corner whatever the aspect ratio.
  const arc = (Math.PI / 2) * rr;
  const legs = [w - rr - sx, arc, ch - 2 * rr, arc, w - 2 * rr, arc, ch - 2 * rr, arc];
  const per = legs.reduce((a, b) => a + b, 0) + (sx - rr);
  const wrap = document.createElement("div");
  wrap.className = "egg-brickyard";
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top}px`;
  wrap.style.width = `${w}px`;
  wrap.style.height = `${ch}px`;
  wrap.style.setProperty("--track", `path("${track}")`);
  let run = 0;
  legs.forEach((leg, i) => {
    run += leg;
    wrap.style.setProperty(`--d${i + 1}`, `${((run / per) * 100).toFixed(3)}%`);
  });
  const GO = 1800; // the flag snap = launch; every later beat derives from it
  const LAP = 3200; // must match by-lap's animation-duration
  const at = (f: number) => Math.round(GO + f * LAP);
  // brake flares at each corner ENTRY (turn-in lives at 19/44/71/94% of the
  // lap in by-lap), each leading its apex by ~70ms like a real brake light
  const flares: Array<[number, number, number]> = [
    [w - rr, 0, at(0.19)],
    [w, ch - rr, at(0.44)],
    [rr, ch, at(0.71)],
    [0, rr, at(0.94)],
  ];
  const pagoda =
    '<svg class="by-pagoda" viewBox="0 0 44 64" fill="none">' +
    '<line x1="22" y1="5" x2="22" y2="11" stroke="currentColor" stroke-width="1.2"/>' +
    '<path d="M11 15 Q22 8 33 15" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M8 25 Q22 18 36 25" stroke="currentColor" stroke-width="1.3"/>' +
    '<path d="M6 35 Q22 28 38 35" stroke="currentColor" stroke-width="1.3"/>' +
    '<rect x="16" y="15" width="12" height="46" stroke="currentColor" stroke-width="1.2"/>' +
    '<line x1="19.5" y1="21" x2="19.5" y2="60" stroke="currentColor" stroke-width="0.7" opacity="0.55"/>' +
    '<line x1="24.5" y1="21" x2="24.5" y2="60" stroke="currentColor" stroke-width="0.7" opacity="0.55"/>' +
    "</svg>";
  let html =
    '<i class="by-bricks"></i>' +
    pagoda +
    `<i class="by-strip" style="left:${fx(sx - 5)}px"></i>` +
    '<b class="by-pen"><i class="by-pole"></i><i class="by-flag"></i></b>' +
    `<i class="by-rev" style="left:${fx(sx)}px"></i>` +
    flares
      .map(([px, py, d]) => `<b class="by-brake" style="left:${fx(px)}px;top:${fx(py)}px;animation-delay:${d - 70}ms"></b>`)
      .join("");
  // the comet: head + seven ghosts, all running the SAME lap 50ms apart.
  // The container fade waits for the LAST ghost to reach the line (head
  // arrival + 350ms of lag), so the field visibly compresses into the
  // finish — the bunched pack at the flag is the resolution image.
  html += `<b class="by-car" style="animation-delay:${GO + LAP + 350}ms">`;
  for (let i = 7; i >= 1; i--) {
    html += `<i class="by-ghost by-g${i}" style="animation-delay:${GO + i * 50}ms"></i>`;
  }
  html += `<i class="by-head" style="animation-delay:${GO}ms"></i></b>`;
  // two tire marks in the wake of the bottom pass (right-to-left): the car
  // crosses their span ~3.51–3.62s, and each finishes drawing just behind it
  const skidX = w * 0.6;
  html +=
    `<i class="by-skid" style="left:${fx(skidX)}px;top:${fx(ch - 6)}px;width:${fx(w * 0.15)}px;animation-delay:${at(0.53)}ms"></i>` +
    `<i class="by-skid" style="left:${fx(skidX - 9)}px;top:${fx(ch - 3)}px;width:${fx(w * 0.17)}px;animation-delay:${at(0.545)}ms"></i>` +
    `<i class="by-wipe" style="border-radius:${fx(rr)}px;animation-delay:${GO + LAP - 40}ms"><b></b></i>`;
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  // the call comes AT the checkered flag, as the head takes the line
  setTimeout(() => leagueToast(stamp, text), GO + LAP);
  setTimeout(() => wrap.remove(), 7400);
}

/** LAC — The Wall. Any Clippers move that improves the projection: Intuit
 * Dome's supporters' section reports to the card. A rail draws itself along
 * the card's measured bottom edge (done at 300ms), a row of heads stands up
 * raggedly from BELOW that edge starting at 700ms — the wrapper's clip
 * bottom IS the edge, so they emerge out of the line itself, and the crowd
 * contractually waits for the rail — holds one dead-still ~0.5s beat, then
 * two full wave passes, left→right and back, every head on its own per-dot
 * clock with a hang at the crest. A narrow roar glow travels the card face
 * in lockstep with each crest, the card hops once as each crest crosses its
 * midline, one superfan hoists a "51" placard the moment the first crest
 * reaches their seat, and the toast lands ON the first midpoint hop. Then
 * the section sits and slides back under the rail. The wrapper re-anchors
 * to the card's live rect on scroll so the edge precision survives the
 * scene's ~6.7s. */
export function theWallEgg() {
  queueEgg("wall", 4200, () => theWallEggRun());
}
function theWallEggRun() {
  const stamp = "The Wall";
  const text = "Section 51 is on its feet. The Intuit Dome is sold out.";
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "Two projected wins added sells out the Dome.");
    return;
  }
  const card = cardOf("LAC");
  if (!card || document.querySelector(".egg-thewall")) return;
  const r = card.getBoundingClientRect();
  const w = r.width;
  const h = r.height;
  // THE WALL — a dense supporters' grid filling the lower card, doing a wave
  const cols = Math.max(14, Math.round(w / 24));
  const rows = 6;
  const colors = ["#c8102e", "#1d428a", "#e9e9ec"];
  let crowd = "";
  for (let ry = 0; ry < rows; ry++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = ((cx + 0.5) / cols) * 100;
      const y = 46 + ry * 8.4; // rows fill 46%..88% of the card
      const wave = 750 + (cx / cols) * 1000; // wave sweeps left -> right
      const col = colors[(cx + ry) % 3];
      crowd += `<i class="iw-seat" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;background:${col};color:${col};animation-delay:${wave.toFixed(0)}ms"></i>`;
    }
  }
  // the Intuit Dome's swooping roofline arcs over the card
  const roof = `M 0 ${(h * 0.3).toFixed(0)} Q ${(w / 2).toFixed(0)} ${(h * 0.03).toFixed(0)} ${w.toFixed(0)} ${(h * 0.3).toFixed(0)}`;
  const roof2 = `M 0 ${(h * 0.36).toFixed(0)} Q ${(w / 2).toFixed(0)} ${(h * 0.1).toFixed(0)} ${w.toFixed(0)} ${(h * 0.36).toFixed(0)}`;
  const domeSvg =
    `<svg class="iw-dome" width="${w.toFixed(0)}" height="${h.toFixed(0)}" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" fill="none">` +
    `<path class="iw-shell" d="${roof} L ${w.toFixed(0)} 0 L 0 0 Z"/>` +
    `<path class="iw-roof" pathLength="1" d="${roof}"/>` +
    `<path class="iw-roof iw-roof-b" pathLength="1" d="${roof2}" style="animation-delay:120ms"/>` +
    "</svg>";
  const wrap = document.createElement("div");
  wrap.className = "egg-thewall";
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top}px`;
  wrap.style.width = `${w}px`;
  wrap.style.height = `${h}px`;
  wrap.style.setProperty("--iw-r", getComputedStyle(card).borderRadius || "8px");
  wrap.innerHTML =
    '<i class="iw-glow"></i>' +
    domeSvg +
    '<i class="iw-halo"></i>' +
    crowd +
    '<b class="iw-stamp stamp">The Wall</b>';
  document.body.appendChild(wrap);
  setTimeout(() => leagueToast(stamp, text), 1900);
  setTimeout(() => wrap.remove(), 4200);
}

/** LAL — Seventeen-and-Counting. A max player arrives via trade: purple and
 * gold confetti pours over the Lakers card only, and a small pennant rises
 * to the rafters (the card's top edge). */
export function premiereEgg() {
  queueEgg("premiere", 4400, () => premiereEggRun());
}
function premiereEggRun() {
  const stamp = "As foretold";
  const text = "The Lakers always get their guy. It's in the CBA somewhere. (It isn't.)";
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "A max-money star arriving by trade gets the searchlights.");
    return;
  }
  if (document.querySelector(".egg-premiere")) return;
  const card = cardOf("LAL");
  if (!card) {
    reopenEgg("premiere");
    return;
  }
  const r = card.getBoundingClientRect();
  const edges: Array<[number, number]> = [[6, 14], [92, 20], [16, 84], [84, 88], [-2, 48], [100, 42], [50, -4]];
  const flashes = edges
    .map(([x, y], i) => `<i class="pr-flash" style="left:${x}%;top:${y}%;animation-delay:${900 + i * 220}ms"></i>`)
    .join("");
  const wrap = document.createElement("div");
  wrap.className = "egg-premiere";
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top}px`;
  wrap.style.width = `${r.width}px`;
  wrap.style.height = `${r.height}px`;
  wrap.style.setProperty("--pr-r", getComputedStyle(card).borderRadius || "8px");
  wrap.innerHTML =
    '<i class="pr-carpet"></i>' +
    '<i class="pr-light pr-l1"></i><i class="pr-light pr-l2"></i>' +
    '<b class="pr-star"></b>' +
    '<i class="pr-shimmer"></i>' +
    flashes +
    '<b class="pr-stamp stamp">As foretold</b>';
  document.body.appendChild(wrap);
  setTimeout(() => leagueToast(stamp, text), 2350);
  setTimeout(() => wrap.remove(), 4400);
}

export function gritGrindEgg() {
  queueEgg("gritgrind", 7200, () => gritGrindEggRun());
}
function gritGrindEggRun() {
  const stamp = "All heart";
  const line = "Took the heavier contract. Grit, grind, filed.";
  if (reducedMotion()) {
    leagueToast(stamp, line, undefined, "Taking back more salary than you sent out. That's grit.");
    return;
  }
  const card = cardOf("MEM");
  if (!card || document.querySelector(".egg-gritgrind")) return;
  const r = card.getBoundingClientRect();
  const w = r.width;
  const ch = r.height; // fill the whole card
  const radius = getComputedStyle(card).borderRadius || "10px";
  // Three rakes, upper-right → lower-left, one at a time with real pauses.
  // The third is the kill stroke: its tail lands EXACTLY on the measured
  // bottom edge (y = ch at x = 0.34w) — the sparks grind off that point.
  const rakes = [
    { x0: w * 0.86, y0: ch * 0.1, x1: w * 0.3, y1: ch * 0.46, t: 900, dur: 170 },
    { x0: w * 0.72, y0: ch * 0.3, x1: w * 0.16, y1: ch * 0.68, t: 1750, dur: 180 },
    { x0: w * 0.95, y0: ch * 0.42, x1: w * 0.34, y1: ch, t: 2600, dur: 210 },
  ];
  // the moment the third claw reaches the bottom edge — every exit-point
  // clock (hit flash, sparks, shudder, toast) derives from this so
  // retuning the rakes array can never desync them
  const impact = rakes[2].t + rakes[2].dur; // 2810ms
  const HEAL = [4650, 4900, 5150]; // zip-shut clocks: first wound closes first

  const wrap = document.createElement("div");
  wrap.className = "egg-gritgrind";
  // absolute page coordinates: the wounds scroll with the card for free
  wrap.style.left = `${(r.left + window.scrollX).toFixed(1)}px`;
  wrap.style.top = `${(r.top + window.scrollY).toFixed(1)}px`;
  wrap.style.width = `${w.toFixed(1)}px`;
  wrap.style.height = `${ch.toFixed(1)}px`;
  wrap.style.setProperty("--gg-r", radius);
  // the FULL card height — .gg-face spans it so the dusk and iron cover
  // the whole card even when the rake geometry spans the full card
  wrap.style.setProperty("--ch", `${r.height.toFixed(0)}px`);

  // 1) the room: navy dusk gathers under the growl, holds through the wounds
  //    and the torn beat; the iron sheen passes during the heal (delay
  //    derived from the heal clocks so a retune moves it too)
  let html =
    '<i class="gg-face"><i class="gg-dusk"></i>' +
    `<i class="gg-iron" style="animation-delay:${HEAL[0] + 250}ms"></i></i>`;

  rakes.forEach((k, ri) => {
    const dx = k.x1 - k.x0;
    const dy = k.y1 - k.y0;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len; // unit perpendicular — the curled-lip side
    const ny = dx / len;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    // jagged tear: lerp with perpendicular jitter; endpoints stay exact so
    // rake 3's tail truly sits on the bottom edge
    const segs = 6;
    let d = `M ${k.x0.toFixed(1)} ${k.y0.toFixed(1)}`;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const j = i === segs ? 0 : (Math.random() * 2 - 1) * (3 + Math.random() * 3);
      d += ` L ${(k.x0 + dx * t + nx * j).toFixed(1)} ${(k.y0 + dy * t + ny * j).toFixed(1)}`;
    }
    // 2) the claw catches light at the entry point right before it lands
    html +=
      `<b class="gg-glint" style="left:${k.x0.toFixed(1)}px;top:${k.y0.toFixed(1)}px;` +
      `--ga:${ang.toFixed(1)}deg;animation-delay:${k.t - 170}ms"></b>`;
    // 3) the wound: one wrapper per rake carries the contact jolt so the
    //    strokes AND the flaps rooted on them jerk as one sheet of paper
    html +=
      `<i class="gg-wound" style="--jx:${((dx / len) * 3).toFixed(1)}px;` +
      `--jy:${((dy / len) * 3).toFixed(1)}px;animation-delay:${k.t + 30}ms">`;
    //    under-shadow, dark cut, stock-colored curled lip — three strokes
    //    sharing one jagged path (pathLength="1" is REQUIRED on each: the
    //    dasharray:1 draw renders nothing without it), drawn as one swipe
    //    (lip 45ms behind the claw), each carrying its own (draw, heal)
    //    delay pair
    const off = (s: number) => `translate(${(nx * s).toFixed(2)} ${(ny * s).toFixed(2)})`;
    html +=
      `<svg class="gg-rake" width="${w.toFixed(0)}" height="${ch.toFixed(0)}" ` +
      `viewBox="0 0 ${w.toFixed(0)} ${ch.toFixed(0)}" fill="none">` +
      `<path class="gg-under" pathLength="1" d="${d}" transform="${off(-2.1)}" ` +
      `style="animation-duration:${k.dur}ms, 700ms;animation-delay:${k.t + 10}ms, ${HEAL[ri]}ms"/>` +
      `<path class="gg-cut" pathLength="1" d="${d}" ` +
      `style="animation-duration:${k.dur}ms, 700ms;animation-delay:${k.t}ms, ${HEAL[ri]}ms"/>` +
      `<path class="gg-lip" pathLength="1" d="${d}" transform="${off(2.3)}" ` +
      `style="animation-duration:${k.dur}ms, 700ms;animation-delay:${k.t + 45}ms, ${HEAL[ri] + 40}ms"/>` +
      "</svg>";
    // 4) paper flaps peel up along the gash just behind the claw (pop delay
    //    tracks the swipe's progress), breathe CONTINUOUSLY through the
    //    torn hold — per-flap iteration count sized from pop-end to its
    //    flatten, ±8% duration jitter so no lockstep — and flatten on their
    //    wound's heal clock. Inside .gg-wound so they ride the jolt.
    [0.22, 0.5, 0.78].forEach((tt, ci) => {
      const px = k.x0 + dx * tt;
      const py = k.y0 + dy * tt;
      const cw = 13 + Math.random() * 8 + (ri === 2 ? 3 : 0);
      const chh = cw * 0.45;
      const side = (ci + ri) % 2 ? 0 : 180; // alternate sides of the tear
      const pop = k.t + k.dur * tt + 30;
      const bStart = pop + 300; // the moment the pop settles
      const bDur = 900 * (0.92 + Math.random() * 0.16); // ±8%
      const flat = HEAL[ri] + ci * 60;
      // enough alternate cycles to wobble until the flatten takes over
      // (flatten is last in the animation list, so it wins mid-cycle)
      const bIter = Math.max(2, Math.ceil((flat - bStart) / bDur));
      html +=
        `<b class="gg-curl" style="left:${px.toFixed(1)}px;top:${py.toFixed(1)}px;` +
        `width:${cw.toFixed(1)}px;height:${chh.toFixed(1)}px;` +
        `margin:${(-chh).toFixed(1)}px 0 0 ${(-cw / 2).toFixed(1)}px;` +
        `--ca:${(ang + side).toFixed(1)}deg;` +
        `animation-duration:300ms, ${bDur.toFixed(0)}ms, 550ms;` +
        `animation-delay:${pop.toFixed(0)}ms, ${bStart.toFixed(0)}ms, ${flat}ms;` +
        `animation-iteration-count:1, ${bIter}, 1"></b>`;
    });
    html += "</i>";
  });

  // 5) grind sparks off the measured bottom edge, at the exact point where
  //    rake 3 exits the card — a hot pop whose 16% peak lands ON impact
  //    (delay = impact − 50ms, derived, never hardcoded in CSS), then eight
  //    gold streaks fanning down-left from impact − 30ms, each on its own
  //    clock. Siblings of .gg-face — inside it, overflow:hidden would clip
  //    the whole spray below the card's bottom edge.
  const sx = w * 0.34;
  html +=
    `<b class="gg-hit" style="left:${sx.toFixed(1)}px;top:${ch.toFixed(0)}px;` +
    `animation-delay:${impact - 50}ms"></b>`;
  for (let i = 0; i < 8; i++) {
    const th = ((95 + i * 15 + Math.random() * 10) * Math.PI) / 180;
    const dist = 46 + Math.random() * 46;
    const kx = Math.cos(th) * dist;
    const ky = Math.sin(th) * dist * (0.55 + Math.random() * 0.4);
    const sa = (Math.atan2(ky, kx) * 180) / Math.PI;
    html +=
      `<b class="gg-spark" style="left:${sx.toFixed(1)}px;top:${ch.toFixed(0)}px;` +
      `--kx:${kx.toFixed(0)}px;--ky:${ky.toFixed(0)}px;--sa:${sa.toFixed(0)}deg;` +
      `animation-duration:${(480 + Math.random() * 180).toFixed(0)}ms;` +
      `animation-delay:${(impact - 30 + i * 26 + Math.random() * 50).toFixed(0)}ms"></b>`;
  }

  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  // the growl before the first strike — one FULL egg-rumble-kf cycle (1.9s)
  // so the class never lifts mid-keyframe; it still comfortably precedes
  // the first rake at 900ms. The shudder rides the kill stroke into impact.
  shake(card, "egg-rumble", 1900);
  setTimeout(() => {
    const c = cardOf("MEM");
    if (c) shake(c, "egg-shudder", 900);
  }, impact - 170);
  // the slip files at the peak — third rake through, sparks still flying
  setTimeout(() => leagueToast(stamp, line), impact + 10);
  setTimeout(() => wrap.remove(), 7200);
}

/** MIA — White Hot. The Heat's SECOND minimum signing of the session: the
 * culture is compounding. The air above the card shimmers first, then flame
 * tongues catch up both measured edges — deep-red core, orange mid, white
 * tips — the card's own border glows ember (chasing the flames, never
 * leading them), haze keeps rippling above the burn, and embers lift off
 * the top. Full burn holds ~2.5s (toast lands at the peak), then it dies
 * to wisps. The wrapper is absolute in page coordinates so the fire rides
 * the card through scroll. */
export function whiteHotEgg() {
  queueEgg("whitehot", 6400, () => whiteHotEggRun());
}
function whiteHotEggRun() {
  if (reducedMotion()) {
    leagueToast("White hot", "The culture is compounding.", undefined, "The second minimum signing of your summer burns white.");
    return;
  }
  const card = cardOf("MIA");
  if (!card || document.querySelector(".egg-whitehot")) return;
  const r = card.getBoundingClientRect();
  const h = Math.min(r.height, 460);
  const wrap = document.createElement("div");
  wrap.className = "egg-whitehot";
  // absolute page coordinates: the flames scroll with the card for free
  wrap.style.left = `${r.left + window.scrollX}px`;
  wrap.style.top = `${r.top + window.scrollY}px`;
  wrap.style.width = `${r.width}px`;
  wrap.style.height = `${h}px`;
  // the ember frame traces the card's real corner radius AND full height,
  // so its rounded bottom corners land on the real edge even when the
  // wrapper spans the full card
  wrap.style.setProperty("--wr", getComputedStyle(card).borderRadius || "10px");
  wrap.style.setProperty("--ch", `${r.height.toFixed(0)}px`);
  // 1) heat shimmer above the card — staggered 0–640ms via --sd
  let html = "";
  for (let i = 0; i < 6; i++) {
    const x = 8 + i * 15 + Math.random() * 6;
    const sd = i * 110 + Math.random() * 90;
    const sh = 44 + ((i * 29) % 34);
    html += `<i class="wh-shimmer" style="left:${x.toFixed(1)}%;--sh:${sh}px;--sd:${sd.toFixed(0)}ms"></i>`;
  }
  // 1b) looping haze that outlives the shimmer — the air above a raging
  //     fire keeps moving through the full burn, fading with the wisps
  for (let i = 0; i < 3; i++) {
    const x = 18 + i * 28 + Math.random() * 8;
    const hd = 1500 + i * 260;
    html += `<i class="wh-haze" style="left:${x.toFixed(1)}%;--hd:${hd}ms"></i>`;
  }
  // 2) the border itself goes ember (CSS delays it until ignition)
  html += '<b class="wh-frame"></b>';
  // 3) base fire + five tongues per side, straddling the measured edges,
  //    distributed ALONG each edge (--tb spans 5%–81% of card height),
  //    heights varied, catching bottom-up with jittered stagger. --tn is
  //    an even flicker-iteration count sized to end at the 4.1s collapse
  //    on the identity pose — the envelope alone owns the death.
  html += '<i class="wh-edge wh-left"></i><i class="wh-edge wh-right"></i>';
  for (const side of ["wh-left", "wh-right"] as const) {
    for (let i = 0; i < 5; i++) {
      const tb = h * (0.05 + i * 0.19) + (Math.random() * 14 - 7);
      const th = 52 + ((i * 37) % 46) + Math.random() * 12;
      const tw = 15 + ((i * 7) % 9);
      const td = 1100 + i * 90 + Math.random() * 120;
      const tfMs = 260 + (i % 3) * 70;
      const tn = 2 * Math.max(2, Math.round((4100 - td) / (2 * tfMs)));
      html +=
        `<i class="wh-tongue ${side}" style="--tb:${tb.toFixed(0)}px;` +
        `--th:${th.toFixed(0)}px;--tw:${tw}px;--td:${td.toFixed(0)}ms;` +
        `--tf:${(tfMs / 1000).toFixed(2)}s;--tn:${tn}"><b class="wh-flame"></b></i>`;
    }
  }
  // 4) embers detach from the top edge once the burn is established
  //    (--ed spans 1.7–3.6s — never before the fire exists)
  for (let i = 0; i < 8; i++) {
    const ex = 12 + ((i * 31) % 76);
    const ed = 1700 + i * 250 + Math.random() * 150;
    const edx = ((i % 2 ? 1 : -1) * (10 + ((i * 13) % 22))).toFixed(0);
    html += `<i class="wh-ember" style="left:${ex}%;--edx:${edx}px;--ed:${ed.toFixed(0)}ms"></i>`;
  }
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  // the paper slip lands at the top of the full burn, not the trigger
  setTimeout(() => leagueToast("White hot", "The culture is compounding."), 2050);
  setTimeout(() => wrap.remove(), 6400);
}

/** MIL — Fear the Deer. A Buck extends: antler racks draw themselves inward
 * from the card's two top corners — beams first, tines settling at their own
 * moments — hold proud while a forest dapple passes across the card face,
 * then fade like breath on glass. The toast lands a settle-beat after the
 * last tine. */
export function antlersEgg(playerName: string) {
  queueEgg("antlers", 5600, () => antlersEggRun(playerName));
}
function antlersEggRun(playerName: string) {
  if (reducedMotion()) {
    leagueToast("Fear the deal", `${playerName}, extended. The herd stays together.`, undefined, "Any Bucks extension raises the antlers.");
    return;
  }
  const card = cardOf("MIL");
  if (!card || document.querySelector(".egg-antlers")) return;
  const r = card.getBoundingClientRect();
  const radius = getComputedStyle(card).borderRadius || "8px";
  const w = r.width;
  const rise = 148; // headroom above the card; local y=148 IS the card's top edge
  const cardH = r.height; // dapple the whole card
  // Each rack: main beam + brow/mid/high tines, rooted at local (0, 148) —
  // the exact top-left corner (the right rack is the same geometry, lightly
  // jittered, mirrored about x = w so its root sits on the exact top-right).
  // [path, drawDelayMs, drawDurationMs] — tines settle at distinct moments,
  // no two on a side within 100ms:
  // L completes 1350/1450/1660/1800 · R completes 1440/1560/1720/1860.
  const rackL: Array<[string, number, number]> = [
    ["M 0 148 C 6 112 18 74 46 48 C 68 28 96 18 126 20", 350, 1000],
    ["M 7 116 C 16 102 28 94 42 90", 780, 670],
    ["M 44 50 C 48 34 56 20 70 10", 960, 700],
    ["M 90 24 C 98 12 108 4 120 0", 1180, 620],
  ];
  const rackR: Array<[string, number, number]> = [
    ["M 0 148 C 5 110 20 72 50 46 C 72 27 98 19 124 23", 430, 1010],
    ["M 8 114 C 18 101 30 95 44 92", 900, 660],
    ["M 47 48 C 52 33 61 20 74 11", 1040, 680],
    ["M 93 22 C 102 11 112 4 122 1", 1300, 560],
  ];
  const stroke = ([d, delay, dur]: [string, number, number]) =>
    `<path class="an-t" pathLength="1" d="${d}" style="animation-delay:${delay}ms;animation-duration:${dur}ms"/>`;
  const wrap = document.createElement("div");
  wrap.className = "egg-antlers";
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top - rise}px`;
  wrap.style.width = `${w}px`;
  wrap.style.height = `${rise + cardH}px`;
  // wrapper-local seeds for the hush: the card's two top corners
  wrap.style.setProperty("--aw", `${w.toFixed(1)}px`);
  wrap.style.setProperty("--ay", `${rise}px`);
  wrap.innerHTML =
    '<i class="an-hush"></i>' +
    `<svg class="an-rack" width="${w}" height="${rise + 2}" viewBox="0 0 ${w} ${rise + 2}" fill="none" stroke="#eee1c6" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">` +
    '<g class="an-all">' +
    rackL.map(stroke).join("") +
    `<g transform="translate(${w.toFixed(1)} 0) scale(-1 1)">` +
    rackR.map(stroke).join("") +
    "</g></g></svg>" +
    `<b class="an-root" style="left:-4px;top:${rise - 4}px"></b>` +
    `<b class="an-root" style="left:${(w - 5).toFixed(1)}px;top:${rise - 4}px"></b>` +
    `<i class="an-face" style="top:${rise}px;height:${cardH}px;border-radius:${radius}"><i class="an-dapple"></i></i>`;
  document.body.appendChild(wrap);
  // last tine sets at 1860ms; the announcement lands a ~190ms settle-beat later
  setTimeout(() => leagueToast("Fear the deal", `${playerName}, extended. The herd stays together.`), 2050);
  setTimeout(() => wrap.remove(), 5600);
}

/** MIN — Northern Lights. The Wolves duck back UNDER the second apron and
 * the sky clears: an arctic night settles over the card's column, three
 * translucent aurora ribbons fade in across the card's exact measured width
 * (each gradient extinguishing at the card's edges; lateral drift and scaleY
 * breathing decoupled onto separate elements with non-commensurate periods
 * and phases) while sparse fine snow loops down past the card for the whole
 * scene. At the collective crest, one wolf-howl ring — sized from the card's
 * measured width — expands from the card's center, and the paper slip lands
 * on that beat. The slowest egg on the board, because that's what the sky
 * does. Reduced motion gets a static night-and-ribbon tableau, toast first. */
export function northernLightsEgg() {
  queueEgg("northern", 4300, () => northernLightsEggRun());
}
function northernLightsEggRun() {
  const stamp = "Clear skies";
  const text = "Under the second apron. Minnesota knows this maneuver from experience.";
  const rm = reducedMotion();
  if (rm) leagueToast(stamp, text);
  const card = cardOf("MIN");
  if (!card || document.querySelector(".egg-northernlights")) return;
  const r = card.getBoundingClientRect();
  const w = r.width;
  const cardH = Math.min(r.height, 420);
  const skyH = Math.round(Math.max(96, Math.min(r.top - 8, 170)));
  const wrap = document.createElement("div");
  wrap.className = "egg-northernlights";
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top - skyH}px`;
  wrap.style.width = `${w}px`;
  wrap.style.height = `${skyH + cardH}px`;
  wrap.style.setProperty("--w", `${w.toFixed(1)}px`);
  wrap.style.setProperty("--fh", `${skyH + cardH}px`);
  // the night cast centers on the sky band, in wrapper-local coords
  // (.nl-night is absolute inside the wrapper, so the cast stays in-column)
  wrap.style.setProperty("--nx", `${(w / 2).toFixed(0)}px`);
  wrap.style.setProperty("--ny", `${(skyH / 2).toFixed(0)}px`);
  const rh = Math.round(skyH * 0.52);
  // One aurora band: an svg stroke arcing the exact card width, its gradient
  // dying to transparent precisely at both measured edges. The wrapper <i>
  // carries the 6s life-cycle (delay d, crest peak); the svg drifts laterally
  // on its own period/phase (drift/dd) while the inner <g> breathes on a
  // different, non-commensurate period/phase (breathe/bd).
  const band = (o: {
    i: number;
    top: number;
    arc: number;
    tilt: number;
    sw: number;
    stops: [string, string, string];
    peak: number;
    d: number;
    drift: number;
    dd: number;
    breathe: number;
    bd: number;
    amp: number;
  }) => {
    const y = rh * 0.72;
    const path =
      `M 0 ${y.toFixed(1)}` +
      ` C ${(w * 0.22).toFixed(1)} ${(y - o.arc).toFixed(1)}, ${(w * 0.44).toFixed(1)} ${(y - o.arc * 1.12).toFixed(1)}, ${(w * 0.6).toFixed(1)} ${(y - o.arc * 0.72 + o.tilt).toFixed(1)}` +
      ` S ${(w * 0.87).toFixed(1)} ${(y - o.arc * 0.1).toFixed(1)}, ${w.toFixed(1)} ${(y + o.tilt * 0.6).toFixed(1)}`;
    const vars =
      `--d:${o.d}ms;--ddur:${o.drift}ms;--dd:${o.dd}ms;` +
      `--bdur:${o.breathe}ms;--bd:${o.bd}ms;--amp:${o.amp}px;--peak:${o.peak}`;
    return (
      `<i class="nl-rib${o.i === 0 ? " nl-r0" : ""}" style="top:${o.top}px;${vars}">` +
      `<svg width="${w.toFixed(0)}" height="${rh}" viewBox="0 0 ${w.toFixed(0)} ${rh}" fill="none">` +
      `<defs><linearGradient id="nl-g${o.i}" x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0" stop-color="${o.stops[0]}" stop-opacity="0"/>` +
      `<stop offset="0.2" stop-color="${o.stops[0]}" stop-opacity="0.85"/>` +
      `<stop offset="0.52" stop-color="${o.stops[1]}" stop-opacity="0.8"/>` +
      `<stop offset="0.8" stop-color="${o.stops[2]}" stop-opacity="0.75"/>` +
      `<stop offset="1" stop-color="${o.stops[2]}" stop-opacity="0"/>` +
      `</linearGradient></defs>` +
      `<g class="nl-bre">` +
      `<path d="${path}" stroke="url(#nl-g${o.i})" stroke-width="${o.sw}" stroke-linecap="round"/>` +
      `<path d="${path}" stroke="url(#nl-g${o.i})" stroke-width="${(o.sw * 0.4).toFixed(1)}" stroke-linecap="round" opacity="0.8"/>` +
      `</g></svg></i>`
    );
  };
  const ribs =
    band({ i: 0, top: Math.round(skyH * 0.04), arc: rh * 0.42, tilt: 4, sw: 26, stops: ["#78be20", "#a5e8f2", "#8a63e8"], peak: 0.95, d: 400, drift: 4900, dd: -900, breathe: 3600, bd: -1300, amp: 11 }) +
    band({ i: 1, top: Math.round(skyH * 0.3), arc: rh * 0.34, tilt: -6, sw: 20, stops: ["#a5e8f2", "#78be20", "#a5e8f2"], peak: 0.8, d: 900, drift: 3900, dd: -2100, breathe: 3000, bd: -600, amp: 9 }) +
    band({ i: 2, top: Math.round(skyH * 0.46), arc: rh * 0.26, tilt: 3, sw: 15, stops: ["#8a63e8", "#a5e8f2", "#78be20"], peak: 0.65, d: 1300, drift: 5400, dd: -3300, breathe: 4200, bd: -2500, amp: 13 });
  // sparse fine snow, confined to the column: each flake loops on its own
  // staggered delay (0–3s) and duration (2.6–4.2s), so snowfall is sparse and
  // continuous; the wrapper master-fade tapers it out with the clearing sky
  let snow = "";
  for (let i = 0; i < 16; i++) {
    const left = (i * 61) % 100;
    const fd = (i * 431) % 3000;
    const fdur = 2600 + ((i * 383) % 1600);
    const size = (1.5 + (i % 3) * 0.5).toFixed(1);
    const sway = ((i * 17) % 18) - 9;
    const fo = (0.45 + ((i * 7) % 4) * 0.07).toFixed(2);
    snow += `<i class="nl-flake" style="left:${left}%;width:${size}px;height:${size}px;--fd:${fd}ms;--fdur:${fdur}ms;--sw:${sway}px;--fo:${fo}"></i>`;
  }
  // the howl leaves from the card's measured center
  const cy = (skyH + cardH / 2).toFixed(0);
  wrap.innerHTML =
    '<i class="nl-night"></i>' +
    ribs +
    `<i class="nl-snow">${snow}</i>` +
    `<b class="nl-glint" style="top:${cy}px"></b>` +
    `<b class="nl-howl" style="top:${cy}px"></b>` +
    `<b class="nl-howl nl-echo" style="top:${cy}px"></b>`;
  document.body.appendChild(wrap);
  // the slip lands on the aurora's collective crest, as the howl ring expands
  if (!rm) setTimeout(() => leagueToast(stamp, text), 4300);
  setTimeout(() => wrap.remove(), rm ? 4200 : 8000);
}

/** NOP — The Throw. Mardi Gras on the parade route: three bead strands
 * (green, gold, purple — one color per strand, 8–9 beads riding the same
 * flight path with per-bead delay so they read as strings) arc over the
 * board from off-screen upper-left, staged as three DISTINCT throws:
 * green at 120ms sails clean past; gold at 1300ms goes higher and longer
 * as green exits; purple at 2050ms terminates EXACTLY on the Pelicans
 * card's measured top-left corner at 3200ms. A compact spark, a whip
 * around the pivot with the fastest frame exactly at the hang line,
 * two decaying pendulum swings (overshoot capped so it grazes the roster
 * rows), a lagging lower half so the rope flexes, then it settles hanging
 * dead straight down the card edge while three doubloons shake loose and
 * glint on the way down. Every downstream beat rides one constant, CATCH,
 * mirrored to CSS as --catch. The hung strand fades in bead-by-bead, each
 * bead crossfading with its flight twin as the twin melts into the corner,
 * so the string never doubles at the money shot. The barker's toast waits
 * for the whip to resolve (3550ms), not the trigger. Fires on any Pelicans
 * move that improves the projection. */
export function beadThrowEgg() {
  queueEgg("beads", 6750, () => beadThrowEggRun());
}
function beadThrowEggRun() {
  if (reducedMotion()) {
    leagueToast("Parade route", "Throw me somethin', mister. Filed.", undefined, "A trade that improves the Pelicans starts the parade.");
    return;
  }
  const card = cardOf("NOP");
  if (!card || document.querySelector(".egg-beadthrow")) return;
  const r = card.getBoundingClientRect();
  const vw = window.innerWidth;
  const cx = r.left + 1; // the caught corner, measured
  const cy = r.top + 1;
  const apexY = Math.max(24, r.top - 150); // the sky above the card
  // the one timing constant every downstream beat rides (spark, whip,
  // hang, coins, toast, fade) — restage the throws and this moves with them
  const P3_AT = 2050; // purple launch
  const P3_MS = 1150; // purple flight
  const CATCH = P3_AT + P3_MS; // 3200 — lead bead meets the corner
  const fx = (n: number) => n.toFixed(1);
  // flight paths: two clean passes over the board, and one that terminates
  // exactly on the corner, descending into it from the upper-left
  const p1 = `M -90 ${fx(apexY + 84)} Q ${fx(vw * 0.4)} ${fx(apexY - 34)} ${fx(vw + 90)} ${fx(apexY + 128)}`;
  const p2 = `M -90 ${fx(apexY + 46)} Q ${fx(vw * 0.52)} ${fx(apexY - 56)} ${fx(vw + 90)} ${fx(apexY + 172)}`;
  const p3 = `M -90 ${fx(apexY + 30)} Q ${fx((cx - 90) * 0.42)} ${fx(apexY - 44)} ${fx(cx)} ${fx(cy)}`;
  // a strand: n beads on one path, staggered so they read as a string;
  // every third bead runs larger, like real parade beads
  const strand = (cls: string, path: string, n: number, base: number, dur: number, step: number, caught: boolean) => {
    let dots = "";
    for (let i = 0; i < n; i++) {
      const s = i % 3 === 1 ? 11 : 9;
      dots += `<i class="bt-d${caught ? " bt-dc" : ""}" style="offset-path: path('${path}'); width:${s}px; height:${s}px; animation-duration:${dur}ms; animation-delay:${base + i * step}ms"></i>`;
    }
    return `<b class="bt-str ${cls}">${dots}</b>`;
  };
  // the caught strand re-hung from the corner: four beads in the pivoting
  // upper arm, four in the lagging tail that makes the rope flex. `start`
  // continues the chain position so the big-bead cadence (1, 4, 7) and the
  // per-bead fade-in both run through the arm/tail joint: hung bead k only
  // appears as its flight twin (delay k*55ms behind the lead) melts into
  // the corner — no doubled string at the money shot.
  const hangDots = (top0: number, start: number) =>
    [0, 1, 2, 3]
      .map((i) => {
        const k = start + i;
        const s = k % 3 === 1 ? 11 : 9;
        const d = CATCH + k * 55 - 110; // 120ms fade-in overlaps the twin's melt
        return `<i class="bt-hd" style="top:${top0 + i * 14}px; width:${s}px; height:${s}px; margin-left:${-s / 2}px; animation-delay:${d}ms"></i>`;
      })
      .join("");
  // doubloons shaken loose at the catch — staggered, drifting, spun
  const coins = [
    { x: cx - 8, y: cy - 12, cd: -20, cs: 2.2, d: CATCH + 120 },
    { x: cx + 5, y: cy - 6, cd: 12, cs: 3, d: CATCH + 330 },
    { x: cx + 15, y: cy - 15, cd: 30, cs: 2.6, d: CATCH + 550 },
  ]
    .map(
      (c) =>
        `<i class="bt-coin" style="left:${fx(c.x)}px; top:${fx(c.y)}px; --cd:${c.cd}px; --cs:${c.cs}; animation-delay:${c.d}ms"><b class="bt-glint"></b></i>`
    )
    .join("");
  const wrap = document.createElement("div");
  wrap.className = "egg-beadthrow";
  wrap.style.setProperty("--catch", `${CATCH}ms`);
  wrap.style.setProperty("--cfall", `${fx(Math.min(Math.max(r.height * 0.62, 170), 320))}px`);
  wrap.innerHTML =
    strand("bt-s1", p1, 8, 120, 1400, 62, false) + // green — first throw, clean pass
    strand("bt-s2", p2, 9, 1300, 1350, 55, false) + // gold — second throw as green exits
    strand("bt-s3", p3, 8, P3_AT, P3_MS, 55, true) + // purple — the one that catches
    `<i class="bt-spark" style="left:${fx(cx)}px; top:${fx(cy)}px"></i>` +
    `<b class="bt-hang" style="left:${fx(cx)}px; top:${fx(cy)}px">` +
    `<b class="bt-swing">${hangDots(2, 0)}<b class="bt-tail">${hangDots(0, 4)}</b></b></b>` +
    coins;
  document.body.appendChild(wrap);
  // the barker waits for the whip to resolve, not the throw
  setTimeout(() => leagueToast("Parade route", "Throw me somethin', mister. Filed."), CATCH + 350);
  setTimeout(() => wrap.remove(), 6750);
}

/** NYK — Bing Bong. MSG marquee night: the room dims warm, 18–24 bulbs screw
 * themselves in one by one clockwise around the card's actual rounded border,
 * chase the perimeter two Broadway laps, go fully dark for one held breath —
 * then every bulb flashes twice in unison. The bing. The bong. Afterglow,
 * and the house lights come back up. The paper slip starts sliding in during
 * the dark breath so it LANDS exactly on the first unison flash, and the
 * whole marquee rides an anchor group that follows the page scroll. */
export function bingBongEgg() {
  queueEgg("bingbong", 3745, () => bingBongEggRun());
}
function bingBongEggRun() {
  if (reducedMotion()) {
    leagueToast("Bing bong", "The Garden approves.", undefined, "Any Knicks move that adds a projected win. Bing bong.");
    return;
  }
  const card = cardOf("NYK");
  if (!card || document.querySelector(".egg-bingbong")) return;
  const r = card.getBoundingClientRect();
  const w = r.width;
  const h = r.height;
  // The visible card is the .panel inside the egg wrapper — read its real
  // corner radius so the frame and the corner bulbs trace the actual outline.
  const panel = card.querySelector<HTMLElement>(".panel") ?? card;
  const rr = Math.min(
    parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 8,
    Math.min(w, h) / 2
  );
  const edgeW = w - 2 * rr;
  const edgeH = h - 2 * rr;
  const arc = (Math.PI / 2) * rr;
  const per = 2 * edgeW + 2 * edgeH + 4 * arc;
  // Even bulb count (18–24) so the orange/blue alternation closes the loop.
  const n = Math.min(24, Math.max(18, 2 * Math.round(per / 150)));
  // Distance s along the ROUNDED border, clockwise from the start of the top
  // edge, → point exactly ON the card outline (corner bulbs ride the arcs).
  const pt = (s: number): { x: number; y: number } => {
    let t = ((s % per) + per) % per;
    if (t < edgeW) return { x: r.left + rr + t, y: r.top };
    t -= edgeW;
    if (t < arc) {
      const a = (t / arc) * (Math.PI / 2) - Math.PI / 2;
      return { x: r.right - rr + rr * Math.cos(a), y: r.top + rr + rr * Math.sin(a) };
    }
    t -= arc;
    if (t < edgeH) return { x: r.right, y: r.top + rr + t };
    t -= edgeH;
    if (t < arc) {
      const a = (t / arc) * (Math.PI / 2);
      return { x: r.right - rr + rr * Math.cos(a), y: r.bottom - rr + rr * Math.sin(a) };
    }
    t -= arc;
    if (t < edgeW) return { x: r.right - rr - t, y: r.bottom };
    t -= edgeW;
    if (t < arc) {
      const a = (t / arc) * (Math.PI / 2) + Math.PI / 2;
      return { x: r.left + rr + rr * Math.cos(a), y: r.bottom - rr + rr * Math.sin(a) };
    }
    t -= arc;
    if (t < edgeH) return { x: r.left, y: r.bottom - rr - t };
    t -= edgeH;
    const a = (t / arc) * (Math.PI / 2) + Math.PI;
    return { x: r.left + rr + rr * Math.cos(a), y: r.top + rr + rr * Math.sin(a) };
  };
  const LAP = 950; // ms per chase lap — must match bb-chase duration
  const CHASE0 = 1450; // last bulb settles ~1320ms; a 130ms stillness, then lights
  let bulbs = "";
  for (let i = 0; i < n; i++) {
    // bulb 0 sits dead-center on the top edge — the marquee crown
    const p = pt(edgeW / 2 + (i * per) / n);
    const inD = 120 + Math.round((i * 700) / n); // install owns the whole first beat
    const chD = CHASE0 + Math.round((i * LAP) / n);
    bulbs +=
      `<i class="bb-bulb ${i % 2 ? "bb-b" : "bb-o"}" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px;--in:${inD}ms;--ch:${chD}ms"><b></b></i>`;
  }
  const wrap = document.createElement("div");
  wrap.className = "egg-bingbong";
  wrap.innerHTML =
    '<i class="bb-night"></i>' +
    '<span class="bb-anchor">' +
    `<i class="bb-frame" style="left:${r.left}px;top:${r.top}px;width:${w}px;height:${h}px;border-radius:${rr}px"></i>` +
    `<i class="bb-bloom" style="left:${(r.left + w / 2).toFixed(1)}px;top:${(r.top + h / 2).toFixed(1)}px;width:${(w * 1.5).toFixed(0)}px;height:${(h * 1.15).toFixed(0)}px"></i>` +
    bulbs +
    "</span>";
  document.body.appendChild(wrap);
  // If the page scrolls mid-scene, slide the whole marquee with the card.
  const sx0 = window.scrollX;
  const sy0 = window.scrollY;
  const anchor = wrap.querySelector<HTMLElement>(".bb-anchor");
  const onScroll = () => {
    if (anchor)
      anchor.style.transform = `translate(${(sx0 - window.scrollX).toFixed(1)}px, ${(sy0 - window.scrollY).toFixed(1)}px)`;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  // The PA calls it ON the BING: toast-in becomes visible 280ms after firing
  // (10% of 2.8s), so 3745ms lands the slip exactly on the 4025ms flash peak.
  setTimeout(() => leagueToast("Bing bong", "The Garden approves."), 3745);
  setTimeout(() => {
    window.removeEventListener("scroll", onScroll);
    wrap.remove();
  }, 6700);
}

/** ORL — The Finale. Any Magic move that improves the projection: the park
 * closes the night the right way. The room dims to park-dark, one shooting
 * star arcs high over the castle (the card) — its whole path clamped above
 * the measured top edge, so it passes behind the castle, never through it —
 * and dies — a held dark breath — then three shells launch from the card's
 * MEASURED top edge (the parapet), each rising on its own clock and blooming
 * asymmetrically like a real finale: left-low blue, right-high silver,
 * center-crown mixed. Every bloom is a ring of 11–14 sparks that decelerate
 * into a duplicated-pose apex hang, then gravity droops them; ember rain
 * follows each burst, and the last embers settle as pixie dust EXACTLY along
 * the card's top edge — a 2px sink-and-recover touchdown, then round motes
 * and the logo idle's eight-point glitter stars glimmer a full second while
 * the night lets go. The toast lands ON the crown bloom, not the trigger. */
export function finaleEgg() {
  queueEgg("finale", 8200, () => finaleEggRun());
}
function finaleEggRun() {
  const stamp = "The finale";
  const text = "Fireworks over the kingdom. Every night at nine.";
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "Two projected wins added queues the nine o'clock show.");
    return;
  }
  const card = cardOf("ORL");
  if (!card || document.querySelector(".egg-finale")) return;
  const r = card.getBoundingClientRect();
  const vh = window.innerHeight;
  // the show needs sky above the castle and the parapet (the card's top
  // edge) on screen — no stage, no scene: the line lands on its own
  if (r.top < 150 || r.top > vh - 60) {
    leagueToast(stamp, text, undefined, "Two projected wins added queues the nine o'clock show.");
    return;
  }
  const sky = r.top - 24; // headroom between viewport top and the parapet
  const cardH = Math.min(r.height, 420);
  const radius = getComputedStyle(card).borderRadius || "8px";
  const fx = (n: number) => n.toFixed(1);
  // every star-path point is clamped into the band [10px below the viewport
  // top, 16px above the parapet]; a quadratic stays inside the hull of its
  // three points, so the whole arc is guaranteed above the card face
  const skyY = (f: number) => Math.min(r.top - 16, Math.max(10, r.top - sky * f));
  // burst centers are floored at ring-radius + margin so the overlay's
  // overflow:hidden can never clip the crown bloom on a high card
  const burstY = (f: number, rad: number) => Math.max(rad + 12, r.top - sky * f);

  // ---- choreography constants — every downstream beat derives from these.
  // The open is tight (500ms night settle, CHI-style): the pause that
  // matters is the 450ms dark breath AFTER the star, not dead air before it.
  const STAR = 500; // the star waits only for the night to settle
  const STAR_MS = 1300; // dies at 1800; first launch 2250 — a 450ms held breath
  // three shells, staged asymmetrically like a real finale: left-low blue,
  // right-high silver, center-crown mixed. Radii scale with available sky.
  const rad1 = Math.min(84, sky * 0.3);
  const rad2 = Math.min(112, sky * 0.37);
  const rad3 = Math.min(134, sky * 0.44);
  const bursts = [
    { at: 2250, rise: 520, x: r.left + r.width * 0.3, y: burstY(0.46, rad1), rad: rad1, n: 11 },
    { at: 3150, rise: 600, x: r.left + r.width * 0.78, y: burstY(0.72, rad2), rad: rad2, n: 13 },
    { at: 4150, rise: 660, x: r.left + r.width * 0.46, y: burstY(0.9, rad3), rad: rad3, n: 14 },
  ];
  const B3 = bursts[2].at + bursts[2].rise; // 4810 — the crown blooms
  // each shell leans a little off vertical, alternating sides
  const leans = bursts.map((_, i) => (i % 2 ? -1 : 1) * (6 + Math.random() * 9));

  let html = '<i class="fw-night"></i>';

  // 1) anticipation — one shooting star, high over the castle, then gone
  const starPath =
    `M ${fx(r.left - 90)} ${fx(skyY(0.58))}` +
    ` Q ${fx(r.left + r.width * 0.44)} ${fx(skyY(1.28))}` +
    ` ${fx(r.left + r.width + 100)} ${fx(skyY(0.66))}`;
  html += `<b class="fw-star" style="offset-path: path('${starPath}'); animation-delay:${STAR}ms; animation-duration:${STAR_MS}ms"><i class="fw-tail"></i></b>`;

  // 2) the three acts — mortar pop on the parapet, rising shell, bloom
  bursts.forEach((b, bi) => {
    const bloom = b.at + b.rise;
    const bx = b.x + leans[bi]; // where the leaning shell actually bursts
    html +=
      `<b class="fw-muzzle" style="left:${fx(b.x)}px;top:${fx(r.top)}px;animation-delay:${b.at}ms"></b>` +
      `<i class="fw-shell" style="left:${fx(b.x)}px;top:${fx(r.top)}px;--lean:${fx(leans[bi])}px;--rise:${fx(b.y - r.top)}px;animation-delay:${b.at}ms;animation-duration:${b.rise}ms"><b></b></i>`;
    // bloom flash at the burst point + its light washing down the facade —
    // the shine carries the card's computed border-radius (runtime contract)
    // so the wash is clipped to the real rounded facade
    const core = b.rad * 0.62;
    html +=
      `<i class="fw-core ${bi === 1 ? "fw-cs" : "fw-cb"}" style="left:${fx(bx)}px;top:${fx(b.y)}px;width:${fx(core)}px;height:${fx(core)}px;animation-delay:${bloom}ms"></i>` +
      `<i class="fw-shine ${bi === 1 ? "fw-shs" : "fw-shb"}" style="left:${fx(r.left)}px;top:${fx(r.top)}px;width:${fx(r.width)}px;height:${fx(cardH)}px;border-radius:${radius};--sx:${fx(((bx - r.left) / r.width) * 100)}%;animation-delay:${bloom}ms"></i>`;
    // the ring: 11–14 sparks, whole-ring rotation seed + per-spark jitter so
    // no two bursts share an orientation; droop scales with burst size
    const a0 = Math.random() * Math.PI;
    for (let s = 0; s < b.n; s++) {
      const a = a0 + (s / b.n) * Math.PI * 2 + (Math.random() - 0.5) * 0.14;
      const rr = b.rad * (0.86 + Math.random() * 0.26);
      const dx1 = Math.cos(a) * rr;
      const dy1 = Math.sin(a) * rr * 0.96;
      const droop = 26 + Math.random() * 22 + b.rad * 0.2;
      const sz = 3 + Math.random() * 1.6;
      const tint = bi === 1 || (bi === 2 && s % 2 === 1) ? "fw-sv" : "fw-bl";
      html +=
        `<i class="fw-spark ${tint}" style="left:${fx(bx)}px;top:${fx(b.y)}px;width:${fx(sz)}px;height:${fx(sz)}px;` +
        `--fo:${(0.8 + Math.random() * 0.2).toFixed(2)};--dx1:${fx(dx1)}px;--dy1:${fx(dy1)}px;` +
        `--dx2:${fx(dx1 * 1.22)}px;--dy2:${fx(dy1 * 1.08 + droop)}px;` +
        `animation-delay:${Math.round(bloom + Math.random() * 70)}ms;animation-duration:${Math.round(1300 + Math.random() * 280)}ms"></i>`;
    }
    // ember rain under the bloom — bursts 1 and 2 die in the air; burst 3's
    // hand off to the pixie dust below
    for (let e = 0; e < 3; e++) {
      html +=
        `<i class="fw-ember" style="left:${fx(bx + (Math.random() - 0.5) * b.rad * 1.1)}px;top:${fx(b.y + Math.random() * b.rad * 0.5)}px;` +
        `--ex:${fx((Math.random() - 0.5) * 36)}px;--ey:${fx(80 + Math.random() * 70)}px;` +
        `animation-delay:${Math.round(bloom + 420 + Math.random() * 480)}ms;animation-duration:${Math.round(950 + Math.random() * 350)}ms"></i>`;
    }
  });

  // 3) resolution — the last embers settle as pixie dust EXACTLY along the
  // card's measured top edge. Each mote is positioned AT its landing point
  // (top: r.top) and falls in via --fx/--fy: it sinks 2px past the edge with
  // a squash, recovers to translate(0,0), and holds — an earned landing,
  // precise by construction. Every other piece is the logo idle's eight-point
  // glitter star; the inner <b> twinkles on its own clock, starting at
  // touchdown (sink hits at 36% of 2.5s = d + 900) with duration x iterations
  // capped at 320–400ms x (2|4), so the worst case (900 + 4x400 = 2500ms)
  // dies exactly inside the outer mote's window.
  const bx3 = bursts[2].x + leans[2];
  const DUST0 = B3 + 150;
  const nd = Math.max(10, Math.min(14, Math.round(r.width / 32)));
  for (let i = 0; i < nd; i++) {
    const lx = r.left + r.width * ((i + 0.5) / nd) + (Math.random() * 10 - 5);
    const d = Math.round(DUST0 + Math.random() * 380);
    const gd = Math.round(320 + Math.random() * 80);
    html +=
      `<i class="fw-dust${i % 2 ? " fw-dstar" : ""}" style="left:${fx(lx)}px;top:${fx(r.top)}px;` +
      `--fx:${fx((bx3 - lx) * 0.16 + (Math.random() * 12 - 6))}px;--fy:${fx(-(56 + Math.random() * 56))}px;` +
      `animation-delay:${d}ms"><b style="animation-delay:${d + 900}ms;animation-duration:${gd}ms;animation-iteration-count:${2 * (1 + Math.round(Math.random()))}"></b></i>`;
  }
  // a soft glimmer pooling along the same measured edge, under the motes
  html += `<i class="fw-dustline" style="left:${fx(r.left)}px;top:${fx(r.top)}px;width:${fx(r.width)}px;animation-delay:${B3 + 620}ms"></i>`;

  const wrap = document.createElement("div");
  wrap.className = "egg-finale";
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  // the announcer calls it ON the crown: the slip becomes visible ~280ms
  // after firing, so B3 − 280 lands it exactly on the third bloom
  setTimeout(() => leagueToast(stamp, text), B3 - 280);
  setTimeout(() => wrap.remove(), 8200);
}

/** PHI — The Toll. A Sixers move adds two or more projected wins: the
 * Liberty Bell itself is lowered from the rafters on a rope, slowing to a
 * stop just above the card. One held beat of stillness. Then it TOLLS
 * twice — each strike flashes at the struck lip, throws a ring-wave across
 * the whole board from where the mouth actually is at that extreme, and
 * every visible card sways 1–2px radially away from the bell as the
 * wavefront reaches it — scheduled from its measured distance, pushed
 * along its measured bell→card vector — so the wave is felt crossing the
 * room, Sixers first. The crack, as ever, holds. A 600ms held rest, then
 * the bell is hoisted home. The paper slip lands ON the second toll. */
export function bellTollEgg() {
  queueEgg("belltoll", 2600, () => bellTollEggRun());
}
function bellTollEggRun() {
  const stamp = "Let it ring";
  const text = "Heard from the steps to the harbor.";
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "Two projected wins added in one move rings it.");
    return;
  }
  const card = cardOf("PHI");
  if (!card || document.querySelector(".egg-belltoll")) return;
  const r = card.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // the stage is the air just above the card's measured top edge; if that
  // point isn't on screen (card below the fold, or scrolled almost out the
  // top) there is no stage — let the line land alone.
  if (r.top > vh - 90 || r.bottom < 120) {
    leagueToast(stamp, text, undefined, "Two projected wins added in one move rings it.");
    return;
  }
  const BELL_H = 116; // svg sprite height; the lip band rides at y 91–103
  const bellX = r.left + r.width / 2;
  // rest pose: the lip hangs 12px above the card top, clamped so a high
  // card can never push the yoke off-screen
  const bellTop = Math.max(r.top - 12 - 103, 10);
  const mouthY = bellTop + 100; // the strike zone — every wave leaves here
  const drop = bellTop + BELL_H + 30; // travel: starts fully above the viewport
  const ropeH = bellTop + drop + 34; // rope top stays off-screen at launch AND at rest
  // the toll clock — every downstream beat rides these three constants
  const T1 = 2900; // first strike = swing delay 2550ms + 350ms to the extreme
  const T2 = 4150; // second strike (2550 + 1600) — the money beat
  const RING = 1150; // ms for a wavefront to reach the farthest corner — also emitted inline as each ring's animation-duration, so CSS can't drift from it
  const maxDist = Math.max(
    Math.hypot(bellX, mouthY),
    Math.hypot(vw - bellX, mouthY),
    Math.hypot(bellX, vh - mouthY),
    Math.hypot(vw - bellX, vh - mouthY)
  );
  // the board answers: every card actually on screen (both axes) measured
  // once, swaying as the wavefront passes. The visible band rides at 92.5%
  // of the ring's radius, so it reaches a card at (dist/(0.925·maxDist))
  // ·RING ms; the sway's own peak is 24% of 680ms = 163ms in, so that ramp
  // is pre-subtracted — the card peaks AS the band crosses it. Amplitude
  // decays 2px → 1px with range, split along the measured bell→card unit
  // vector so the push is truly radial (a card straight below bobs down).
  const cards = [...document.querySelectorAll<HTMLElement>("[data-egg-team]")]
    .map((c) => ({ c, rc: c.getBoundingClientRect() }))
    .filter(
      ({ rc }) =>
        rc.bottom > 0 && rc.top < vh && rc.right > 0 && rc.left < vw && rc.width > 0
    )
    .map(({ c, rc }) => {
      const dx = rc.left + rc.width / 2 - bellX;
      const dy = rc.top + Math.min(rc.height, 420) / 2 - mouthY;
      const dist = Math.hypot(dx, dy);
      const amp = 1 + Math.max(0, 1 - dist / maxDist);
      const ux = dist > 0 ? dx / dist : 0; // degenerate case: push straight down
      const uy = dist > 0 ? dy / dist : 1;
      return {
        c,
        lag: Math.max(0, Math.round((dist / (0.925 * maxDist)) * RING) - 163),
        swx: ux * amp,
        swy: uy * amp,
      };
    });
  for (const { c, lag, swx, swy } of cards) {
    c.style.setProperty("--swx", `${swx.toFixed(2)}px`);
    c.style.setProperty("--swy", `${swy.toFixed(2)}px`);
    for (const t of [T1, T2]) {
      setTimeout(() => {
        c.classList.remove("egg-tollsway");
        void c.offsetWidth; // reflow: restart the decay clean on the second toll
        c.classList.add("egg-tollsway");
      }, t + lag);
    }
  }
  // ring-waves: a gold band per toll (the bell) with a Sixers-blue echo
  // 140ms behind it — four wavefronts, one linear speed. Each pair hatches
  // from where the mouth IS at its strike: the 93px-deep mouth swings
  // ~22px right at −13.5° and ~19px left at +12°, so waves never bloom
  // from empty air. (maxDist and the sway distances stay measured from the
  // rest pose — a 20px origin shift is sub-frame over a room-scale wave.)
  const rings = [
    { d: T1, o: 0.85, x: bellX + 22, blu: false },
    { d: T1 + 140, o: 0.5, x: bellX + 22, blu: true },
    { d: T2, o: 0.95, x: bellX - 19, blu: false },
    { d: T2 + 140, o: 0.55, x: bellX - 19, blu: true },
  ]
    .map(
      (g) =>
        `<b class="tl-ring${g.blu ? " tl-blu" : ""}" style="left:${g.x.toFixed(1)}px;` +
        `animation-delay:${g.d}ms;animation-duration:${RING}ms;--ro:${g.o}"></b>`
    )
    .join("");
  // the bell: yoke, crown strap, bronze profile, sound bow, clapper — and
  // THE crack, drawn last so it crosses the lip band like the real one
  const bell =
    '<svg class="tl-bell" width="120" height="116" viewBox="0 0 120 116" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<defs><linearGradient id="tl-bz" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#7a5a22"/><stop offset="0.28" stop-color="#d9b366"/>' +
    '<stop offset="0.55" stop-color="#b88f3f"/><stop offset="1" stop-color="#6e4c1c"/></linearGradient>' +
    '<linearGradient id="tl-lp" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#6e4c1c"/><stop offset="0.3" stop-color="#caa452"/>' +
    '<stop offset="0.62" stop-color="#a37e30"/><stop offset="1" stop-color="#5f4118"/></linearGradient></defs>' +
    '<rect x="30" y="2" width="60" height="14" rx="4" fill="#6b4a2c"/>' +
    '<rect x="32" y="3.5" width="56" height="4" rx="2" fill="rgba(255,235,200,0.16)"/>' +
    '<circle cx="60" cy="9" r="2.6" fill="#3a2a16"/>' +
    '<rect x="52" y="14" width="16" height="9" rx="2" fill="#8a6526"/>' +
    '<path d="M46 22 C46 36 42 52 32 70 C28 78 22 84 17 89 L17 91 L103 91 L103 89 C98 84 92 78 88 70 C78 52 74 36 74 22 Z" fill="url(#tl-bz)"/>' +
    '<path d="M43 40 H77" stroke="rgba(58,38,10,0.4)" stroke-width="1.4"/>' +
    '<path d="M41.5 46 H78.5" stroke="rgba(58,38,10,0.28)" stroke-width="1.2"/>' +
    '<path d="M47 30 C46 46 42 58 35 72" stroke="rgba(255,241,214,0.38)" stroke-width="5" stroke-linecap="round"/>' +
    '<rect x="12" y="91" width="96" height="12" rx="5" fill="url(#tl-lp)"/>' +
    '<rect x="16" y="92.5" width="88" height="2.4" rx="1.2" fill="rgba(255,238,200,0.22)"/>' +
    '<ellipse cx="60" cy="105" rx="7" ry="4.5" fill="#4a3416"/>' +
    '<path d="M57 103 L61 92 L55 81 L62 68 L58 57 L61 49" stroke="#3a2a12" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M58.8 103 L62.8 92.5" stroke="rgba(255,240,214,0.3)" stroke-width="1"/>' +
    "</svg>";
  const wrap = document.createElement("div");
  wrap.className = "egg-belltoll";
  wrap.style.setProperty("--bx", `${bellX.toFixed(1)}px`); // fallback ring left; each ring's real left is per-strike inline
  wrap.style.setProperty("--by", `${mouthY.toFixed(1)}px`);
  wrap.style.setProperty("--rw", `${(2 * maxDist).toFixed(0)}px`);
  wrap.style.setProperty("--drop", `${(-drop).toFixed(0)}px`);
  // glints: strike 1 swings the bell right, so the clapper lands on the
  // LEFT lip (14px); strike 2 mirrors to the right lip (106px)
  wrap.innerHTML =
    '<i class="tl-dim"></i>' +
    rings +
    `<i class="tl-rig" style="left:${bellX.toFixed(1)}px;top:${bellTop.toFixed(1)}px">` +
    `<i class="tl-rope" style="height:${ropeH.toFixed(0)}px;top:${(4 - ropeH).toFixed(0)}px"></i>` +
    `<i class="tl-swing">${bell}` +
    `<b class="tl-glint" style="left:14px;top:92px;animation-delay:${T1 - 40}ms"></b>` +
    `<b class="tl-glint" style="left:106px;top:92px;animation-delay:${T2 - 40}ms"></b>` +
    "</i></i>";
  document.body.appendChild(wrap);
  // the slip needs ~270ms to slide in — fired here, it LANDS on the bong
  setTimeout(() => leagueToast(stamp, text), T2 - 270);
  setTimeout(() => {
    wrap.remove();
    for (const { c } of cards) {
      c.classList.remove("egg-tollsway");
      c.style.removeProperty("--swx");
      c.style.removeProperty("--swy");
    }
  }, 8300);
}

/** PHX — Valley Sunrise. Any Suns move that improves the projection: dawn
 * comes to the ledger. A cool-violet horizon line draws itself outward from
 * behind the card, the sky above washes deep violet while the last stars
 * twinkle out, a false-dawn glow gathers at the emergence point and holds
 * one genuinely still breath — then the sun disc rises from directly BEHIND
 * the card's measured top edge, occluded by the real card at first (the sky
 * band's bottom is pinned to the measured edge and overflow-clipped),
 * clearing it on a decelerating west-to-east arc. The toast fires the
 * moment its lower limb lifts off the edge (~3.3s); only then do the
 * god-rays fan open, center-out on staggered per-ray clocks, shimmering
 * through the daylight hold. Two saguaros standing on the card's bottom
 * corners catch a rim of light, the ledger face warms to full daylight,
 * holds a beat, and the valley dissolves — the sun the last thing to go.
 * NOTE: the .vs-hz horizon segments are appended as SIBLINGS of .vs-sky
 * (never children — the band's overflow clip would halve the 2px line). */
export function valleySunriseEgg() {
  queueEgg("sunrise", 7600, () => valleySunriseEggRun());
}
function valleySunriseEggRun() {
  const stamp = "The Valley";
  const text = "Sunrise over the ledger.";
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "Any move that brightens the Suns raises the valley.");
    return;
  }
  const card = cardOf("PHX");
  if (!card || document.querySelector(".egg-valleysunrise")) return;
  const r = card.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // one rounded origin for ALL geometry, so horizon endpoints, the card
  // wash, and the saguaro feet land pixel-true on the card's real edges
  const rL = Math.round(r.left);
  const rR = Math.round(r.right);
  const rT = Math.round(r.top);
  const cw = rR - rL;
  // the stage: sky headroom above the card for the sun to rise into, card
  // face below for the desert floor. Card pinned to the viewport top or
  // scrolled past the fold → no stage: land the line immediately instead
  // of playing a sunrise nobody can see.
  // Floor the sky so the disc always has somewhere to rise even on a
  // busy board; the dawn WASH on the card face is the real payoff, so we
  // only bail when the card itself isn't on screen.
  const skyH = Math.max(Math.min(rT - 10, 190), 74);
  const cardH = Math.round(Math.min(r.height, vh - rT - 12));
  if (cardH < 150) {
    leagueToast(stamp, text, undefined, "Any move that brightens the Suns raises the valley.");
    return;
  }
  const padL = Math.max(Math.min(96, rL - 4), 0);
  const padR = Math.max(Math.min(96, vw - rR - 4), 0);
  // disc diameter scales with the card but always fits the sky with the
  // full 1.19d apex clearance (d * 1.72 + 24 ≤ skyH by construction)
  const d = Math.round(Math.min(72, Math.max(50, cw * 0.16), (skyH - 24) / 1.72));
  const drop = Math.round(d * 1.81); // start: disc fully behind the edge
  const mid = Math.round(drop * 0.38); // the 52% keyframe = lower limb ON the edge
  const dx = Math.round(d * 0.36); // west→east arc drift
  const sunX = padL + Math.round(cw * 0.42); // apex x — dawn breaks east of center
  const emX = sunX - dx; // emergence x: where the limb first appears
  const sunY = skyH - Math.round(d * 1.19); // apex center, band-local
  const CLEAR = 3258; // 1750ms delay + 52% of the 2.9s rise — keep with vs-rise
  // seven rays fan CENTER-OUT from the disc: each holds its closed pose
  // behind a per-ray delay (vertical ray first at 3.10s, outermost last,
  // 70ms steps) so the fan opens just after the clear-flash and toast;
  // durations jitter per ray so the shimmer never syncs into a pop
  const rayGeom: Array<[number, number, number]> = [
    [-72, 0.6, 2.34],
    [-48, 0.74, 2.16],
    [-24, 0.66, 2.4],
    [0, 0.92, 2.22],
    [24, 0.68, 2.28],
    [48, 0.78, 2.44],
    [72, 0.62, 2.12],
  ];
  const rays = rayGeom
    .map(
      ([a, s, dur]) =>
        `<b class="vs-ray" style="--ra:${a}deg;--rs:${s};--rd:${3100 + Math.round((Math.abs(a) / 24) * 70)}ms;--rdur:${dur}s"></b>`
    )
    .join("");
  // three last stars in the violet, each twinkling on its own phase
  const stars = [
    { x: 16, y: 26, sd: 0 },
    { x: 47, y: 14, sd: 420 },
    { x: 82, y: 33, sd: 760 },
  ]
    .map((s) => `<b class="vs-star" style="left:${s.x}%;top:${s.y}%;--sd:${s.sd}ms"></b>`)
    .join("");
  // a saguaro: round-capped strokes — trunk, low west arm, high east arm.
  // The taller one guards the left corner; the right is smaller and
  // mirrored in CSS so the pair doesn't read as a stamp.
  const cactus = (cls: string, x: number, cWd: number, cHt: number): string =>
    `<i class="vs-cactus ${cls}" style="left:${x}px">` +
    `<svg width="${cWd}" height="${cHt}" viewBox="0 0 36 64" fill="none" stroke="#190f3d" stroke-width="7" stroke-linecap="round">` +
    '<path d="M18 60 L18 10"/><path d="M17 36 Q7 36 7 27 L7 18"/><path d="M19 29 Q29 29 29 21 L29 13"/>' +
    "</svg></i>";
  const clx = padL + 8; // left saguaro foot, just inside the corner
  const crx = padL + cw - 8 - 26; // right saguaro (26px wide)
  const wrap = document.createElement("div");
  wrap.className = "egg-valleysunrise";
  wrap.style.left = `${rL - padL}px`;
  wrap.style.top = `${rT - skyH}px`;
  wrap.style.width = `${cw + padL + padR}px`;
  wrap.style.height = `${skyH + cardH}px`;
  wrap.style.setProperty("--vs-skyh", `${skyH}px`);
  wrap.style.setProperty("--vs-d", `${d}px`);
  wrap.style.setProperty("--vs-drop", `${drop}px`);
  wrap.style.setProperty("--vs-mid", `${mid}px`);
  wrap.style.setProperty("--vs-dx", `${dx}px`);
  wrap.style.setProperty("--vs-sx", `${sunX}px`);
  wrap.style.setProperty("--vs-ex", `${emX}px`);
  // the visible card is the .panel inside the egg anchor — read ITS radius
  const panel = card.querySelector<HTMLElement>(".panel") ?? card;
  wrap.style.setProperty("--vs-cr", getComputedStyle(panel).borderRadius || "10px");
  // .vs-hz segments intentionally OUTSIDE .vs-sky: siblings, never children
  wrap.innerHTML =
    '<i class="vs-sky">' +
    '<b class="vs-night"></b><b class="vs-dawn"></b>' +
    stars +
    '<b class="vs-bloom"></b>' +
    `<i class="vs-sun" style="left:${sunX}px;top:${sunY}px">${rays}<b class="vs-disc"></b></i>` +
    "</i>" +
    `<b class="vs-hz vs-hzl" style="left:0;width:${padL}px;--hd:380ms"></b>` +
    `<b class="vs-hz vs-hzr" style="left:${padL + cw}px;width:${padR}px;--hd:540ms"></b>` +
    `<i class="vs-card" style="left:${padL}px;top:${skyH}px;width:${cw}px;height:${cardH}px"></i>` +
    `<b class="vs-chalo" style="left:${clx + 17 - 46}px;top:${skyH + cardH - 46}px"></b>` +
    `<b class="vs-chalo" style="left:${crx + 13 - 46}px;top:${skyH + cardH - 46}px"></b>` +
    cactus("vs-cl", clx, 34, 60) +
    cactus("vs-cr", crx, 26, 46);
  document.body.appendChild(wrap);
  // the toast fires the moment the lower limb lifts off the card's edge
  setTimeout(() => leagueToast(stamp, text), CLEAR + 40);
  setTimeout(() => wrap.remove(), 7600); // 7.1s master + 500ms margin
}

/** POR — Dame Time. A Blazers move executed while the wall clock reads
 * 12-something AM (the CALLER checks the clock — this egg is a legend
 * precisely because it only exists at midnight): Portland rain streaks the
 * card first, thin and quiet; a watch face materializes onto the card's
 * measured bottom-right corner; the hands scream through geared turns and
 * decelerate exactly onto 12:00 — hour, minute, second parking in cascade,
 * the second hand onto :57; then the escapement steps the last three
 * seconds home (tick… tick… tick — real pauses, widening into midnight,
 * each rung with a pulse ring, the third ringing hardest) and on midnight
 * a red DAME TIME stamp slams diagonally across the lower ledger and holds
 * at full ink before the lights come down. The rain falls through all of
 * it, and the whole scene rides the page scroll on an anchor group. */
export function dameTimeEgg() {
  queueEgg("dametime", 2600, () => dameTimeEggRun());
}
function dameTimeEggRun() {
  const stampTxt = "Dame Time";
  const line = "It is exactly midnight in Portland.";
  if (reducedMotion()) {
    leagueToast(stampTxt, line, undefined, "A 75-plus arrival in Portland — or any Blazers move at midnight.");
    return;
  }
  const card = cardOf("POR");
  if (!card || document.querySelector(".egg-dametime")) return;
  const r = card.getBoundingClientRect();
  const vh = window.innerHeight;
  // the watch balances on the card's REAL bottom-right corner and the stamp
  // needs the lower face above it — if that stage isn't on screen (card too
  // short or too NARROW for the 118px watch + the stamp, corner scrolled
  // above the header, or still below the fold), skip the scene and let the
  // line land immediately instead of playing to an empty room.
  if (r.height < 240 || r.width < 260 || r.bottom < 240 || r.bottom > vh - 12) {
    leagueToast(stampTxt, line, undefined, "A 75-plus arrival in Portland — or any Blazers move at midnight.");
    return;
  }
  const w = r.width;
  const h = r.height;

  // one clock rules the beats: hands launch together at SPIN_AT and park in
  // cascade (hour 3200 · minute 3320 · second 3460, onto :57); after a
  // 760ms held stillness the tick stepper owns the last three seconds — its
  // 30% / 60% / 97% keyframes ARE the ticks (600ms, then a 740ms rit into
  // midnight) — so every downstream beat (pulse rings, stamp, shudder,
  // toast) derives from the same two constants and can never desync.
  const SPIN_AT = 1700;
  const TICKS_AT = 3620;
  const TICK_MS = 2000;
  const t1 = Math.round(TICKS_AT + TICK_MS * 0.3); // 4220 — :58
  const t2 = Math.round(TICKS_AT + TICK_MS * 0.6); // 4820 — :59
  const t3 = Math.round(TICKS_AT + TICK_MS * 0.97); // 5560 — 12:00:00
  const STAMP_AT = t3 + 150; // a held breath after midnight lands

  const wrap = document.createElement("div");
  wrap.className = "egg-dametime";
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top}px`;
  wrap.style.width = `${w}px`;
  wrap.style.height = `${h}px`;
  // rain clips to the card's real outline and falls its full measured height
  wrap.style.setProperty("--dtr", getComputedStyle(card).borderRadius || "8px");
  wrap.style.setProperty("--dh", `${(h + 80).toFixed(0)}px`);

  // thin, quiet Portland rain — two depths, every drop on its own loop;
  // --dl carries each streak's length (the CSS declares height from it)
  let drops = "";
  for (let i = 0; i < 18; i++) {
    const near = i % 3 === 0;
    const left = (i * 53 + 7) % 97;
    const dur = near ? 760 + ((i * 67) % 180) : 1060 + ((i * 97) % 380);
    const delay = (i * 211) % 1300;
    const len = near ? 40 + ((i * 13) % 12) : 26 + ((i * 11) % 10);
    const op = near ? 0.34 + ((i * 7) % 3) * 0.04 : 0.16 + ((i * 5) % 4) * 0.03;
    drops += `<i class="dt-drop${near ? " dt-near" : ""}" style="left:${left}%;--dl:${len}px;--ro:${op.toFixed(2)};animation-duration:${dur}ms;animation-delay:${delay}ms"></i>`;
  }

  // the dial: paper face, silver case, ink markers — and the 12 index in
  // Blazers red, because that is the number this whole scene is about
  let marks = "";
  for (let i = 0; i < 12; i++) {
    const twelve = i === 0;
    const quarter = i % 3 === 0;
    marks +=
      `<line x1="59" y1="${twelve ? 8 : 10}" x2="59" y2="${twelve ? 18.5 : quarter ? 17 : 15.5}" ` +
      `stroke="${twelve ? "#E03A3E" : "#413c30"}" stroke-width="${twelve ? 3.4 : quarter ? 2.6 : 1.8}" ` +
      `stroke-linecap="round"${twelve ? "" : ' opacity="0.72"'} transform="rotate(${i * 30} 59 59)"/>`;
  }

  // Portland, not just a clock: "RIP CITY" on the dial and a City-of-Roses
  // rose at six — the red 12 above already names the hour this is about.
  marks +=
    '<text x="59" y="41" text-anchor="middle" font-size="6.6" letter-spacing="1.2" ' +
    'fill="#E03A3E" opacity="0.82" font-weight="700" font-family="inherit">RIP CITY</text>' +
    '<g transform="translate(59 82)">' +
    '<path d="M-5 4 C -6.5 0.5 -4 -3.5 0 -4.5 M5 4 C 6.5 0.5 4 -3.5 0 -4.5" fill="none" stroke="#2b7a3f" stroke-width="0.9" opacity="0.5"/>' +
    '<path d="M0 -3 C 3.2 -3 4.4 0.6 1.6 2.6 C 3.8 3.2 3.2 6.2 0 5.2 C -3.2 6.2 -3.8 3.2 -1.6 2.6 C -4.4 0.6 -3.2 -3 0 -3 Z" fill="none" stroke="#E03A3E" stroke-width="1" opacity="0.78"/>' +
    '<circle r="1.7" fill="#E03A3E" opacity="0.85"/></g>';

  // tick pulses — the escapement, drawn; the third (midnight) rings hardest
  const pulses = [t1, t2, t3]
    .map((t, i) => `<b class="dt-pulse${i === 2 ? " dt-p3" : ""}" style="animation-delay:${t}ms"></b>`)
    .join("");

  // the stamp lives on the LOWER ledger even on short cards: 195px above
  // the bottom edge, floored at 55% of the card's height
  const stampTop = Math.max(h * 0.55, h - 195);
  const fs = Math.min(34, Math.max(23, w * 0.072));
  wrap.innerHTML =
    '<span class="dt-anchor">' +
    '<i class="dt-wash"></i>' +
    `<i class="dt-rain">${drops}</i>` +
    `<i class="dt-watch" style="left:${(w - 74).toFixed(1)}px;top:${(h - 68).toFixed(1)}px">` +
    '<svg width="118" height="118" viewBox="0 0 118 118" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<circle cx="59" cy="59" r="56" fill="#f7f3ea" stroke="#b3bac1" stroke-width="3.5"/>' +
    '<circle cx="59" cy="59" r="51.5" fill="none" stroke="rgba(33,29,19,0.16)" stroke-width="1"/>' +
    marks +
    "</svg>" +
    `<b class="dt-hand dt-hr" style="animation-delay:${SPIN_AT}ms;animation-duration:1500ms"></b>` +
    `<b class="dt-hand dt-mn" style="animation-delay:${SPIN_AT}ms;animation-duration:1620ms"></b>` +
    `<b class="dt-hand dt-sc" style="animation-delay:${SPIN_AT}ms,${TICKS_AT}ms;animation-duration:1760ms,${TICK_MS}ms"></b>` +
    '<b class="dt-pin"></b>' +
    pulses +
    "</i>" +
    `<b class="dt-stamp stamp" style="left:${(w * 0.47).toFixed(1)}px;top:${stampTop.toFixed(1)}px;font-size:${fs.toFixed(0)}px;animation-delay:${STAMP_AT}ms">DAME TIME</b>` +
    "</span>";
  document.body.appendChild(wrap);
  // the scene runs long — if the page scrolls mid-beat, slide the whole
  // stage with the card (the bingBong anchor pattern)
  const sx0 = window.scrollX;
  const sy0 = window.scrollY;
  const anchor = wrap.querySelector<HTMLElement>(".dt-anchor");
  const onScroll = () => {
    if (anchor)
      anchor.style.transform = `translate(${(sx0 - window.scrollX).toFixed(1)}px, ${(sy0 - window.scrollY).toFixed(1)}px)`;
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  // the slam jolts the ledger, and the league office speaks ON the stamp
  setTimeout(() => {
    const c = cardOf("POR");
    if (c) shake(c, "egg-shudder", 1200);
  }, STAMP_AT + 20);
  setTimeout(() => leagueToast(stampTxt, line), STAMP_AT + 70);
  setTimeout(() => {
    window.removeEventListener("scroll", onScroll);
    wrap.remove();
  }, 8700);
}

/** TOR — The North. The Raptors trade FOR an expiring contract (the Kawhi
 * precedent): winter arrives from the top. A snow flurry sweeps DOWN the
 * card while frost crystallizes center-out along the card's measured top
 * border — a growing rime of skew-cut segments plus hoarfrost sprigs
 * standing on the line. A sheen glides across the finished rim (2.15–2.85s);
 * a TRUE held breath (2.85–3.2s, nothing but tail flakes); then a shadow
 * dives for half a second, its landing frame-locked to the first claw —
 * and the paw rakes three streaks down through the frost. The gash
 * segments ARE rim segments cut at the claw's exact angle, so each streak
 * clears precisely the frost it crosses (masked reveal by construction)
 * and leaves a red score scratched into the ledger. Four hundred
 * milliseconds of scarred quiet. Then a single red maple leaf flutters
 * down on three decelerating sways and sets down exactly on the measured
 * team-name text, rests there tilted a full beat, and slides off the
 * card's left edge on the same north wind. The toast waits for the
 * landing. Reduced motion gets a motionless keepsake, not a bare toast. */
export function theNorthEgg() {
  queueEgg("north", 9400, () => theNorthEggRun());
}
function theNorthEggRun() {
  const stamp = "The North";
  const text = "One year is enough. It was before.";
  const LEAF_SVG =
    '<svg width="26" height="27" viewBox="0 0 32 34" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M16 .8 L18.4 5.2 L21.5 3.3 L20.6 8.1 L26.7 6.2 L24.4 10.9 L30.7 10.3 L26.2 14.5 L31.3 18.7 L23.6 18 L25.4 22.9 L18.8 20.6 L17.1 25.5 L17 28.3 L17.7 33 L14.3 33 L15 28.3 L14.9 25.5 L13.2 20.6 L6.6 22.9 L8.4 18 L.7 18.7 L5.8 14.5 L1.3 10.3 L7.6 10.9 L5.3 6.2 L11.4 8.1 L10.5 3.3 L13.6 5.2 Z" fill="#CE1141"/>' +
    '<path d="M16 4.5 V27" stroke="#8f0b2e" stroke-width="1.1" stroke-linecap="round" opacity="0.55"/></svg>';
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "An expiring contract landing in Toronto raises the flag.");
    // motionless keepsake so the toast still has its scene: the rime at
    // final opacity, one red score, and the leaf already at rest on the
    // team name — fading in and out on opacity alone
    const c = cardOf("TOR");
    if (!c || document.querySelector(".egg-thenorth-still")) return;
    const rc = c.getBoundingClientRect();
    if (rc.width < 220) return;
    const nEl = c.querySelector<HTMLElement>('a[href="/team/TOR"]');
    const nrc = nEl ? nEl.getBoundingClientRect() : null;
    const padS = nrc && nrc.width > 40 && nrc.top > rc.top && nrc.top < rc.top + 80 ? nrc : null;
    const sxp = (padS ? padS.left + padS.width * 0.66 : rc.left + 108) - rc.left;
    const syp = (padS ? padS.top + padS.height * 0.42 : rc.top + 26) - rc.top;
    const still = document.createElement("div");
    still.className = "egg-thenorth-still";
    still.style.left = `${rc.left}px`;
    still.style.top = `${rc.top}px`;
    still.style.width = `${rc.width}px`;
    still.style.height = `${Math.min(rc.height, 460)}px`;
    still.innerHTML =
      '<i class="tn-still-rim"></i>' +
      `<b class="tn-still-score" style="left:${(rc.width / 2).toFixed(1)}px"></b>` +
      `<b class="tn-still-leaf" style="left:${(sxp - 13).toFixed(1)}px;top:${(syp - 13.5).toFixed(1)}px">${LEAF_SVG}</b>`;
    document.body.appendChild(still);
    setTimeout(() => still.remove(), 3800);
    return;
  }
  const card = cardOf("TOR");
  if (!card || document.querySelector(".egg-thenorth")) return;
  const r = card.getBoundingClientRect();
  const vh = window.innerHeight;
  // the whole scene hangs off the card's TOP border — if that edge is not
  // comfortably on screen there is no stage; the line lands by itself
  if (r.top < 8 || r.top > vh - 140 || r.width < 220) {
    leagueToast(stamp, text, undefined, "An expiring contract landing in Toronto raises the flag.");
    return;
  }
  const w = r.width;
  const cardH = Math.min(r.height, 460);
  const sky = Math.round(Math.max(48, Math.min(r.top - 4, 120))); // headroom above the border
  const bandH = 16; // the rime's reach down the card face
  const TAN = Math.tan((38 * Math.PI) / 180); // the claw's lean — shared by every cut part
  const cx0 = w / 2;
  const spread = Math.min(58, w * 0.16);
  const gxs = [cx0 - spread, cx0, cx0 + spread]; // the three claws, on the border
  const gw = 17; // gash width where each claw crosses the band
  const SLASH = 3700; // first claw contact; the paw drags +80ms per claw
  const LAND = 6520; // leaf touchdown — the toast beat
  const LEAF_MS = 4100; // leaf animation length
  const TOUCH = 0.44; // touchdown keyframe — translate(0,0) by construction
  const fx = (n: number) => n.toFixed(1);

  // landing pad: the team-name link in the header, measured. Trust it only
  // if it looks like a header name row; otherwise a fixed header fallback.
  const nameEl = card.querySelector<HTMLElement>('a[href="/team/TOR"]');
  const nr = nameEl ? nameEl.getBoundingClientRect() : null;
  const pad = nr && nr.width > 40 && nr.top > r.top && nr.top < r.top + 80 ? nr : null;
  const lx = pad ? pad.left + pad.width * 0.66 : r.left + 108;
  const ly = pad ? pad.top + pad.height * 0.42 : r.top + 26;

  const panel = card.querySelector<HTMLElement>(".panel") ?? card;
  const radius = getComputedStyle(panel).borderRadius || "8px";

  // 1) the cold settles over the card face, heaviest at the border
  let html = `<i class="tn-cast" style="top:${sky}px;height:${cardH}px;border-radius:${radius}"></i>`;

  // 2) two gust veils sweep down over the card — the flurry's body
  const vy = Math.round(sky + cardH * 0.55);
  html +=
    `<i class="tn-veil" style="left:-12%;--vd:120ms;--vy:${vy}px"></i>` +
    `<i class="tn-veil" style="left:6%;--vd:760ms;--vy:${vy}px"></i>`;

  // 3) the flurry: twenty flakes, each on its own clock, all leaning on the
  //    same north wind (down-left — the claw and the leaf obey it later);
  //    the last stragglers drift through the held breath, which is allowed
  for (let i = 0; i < 20; i++) {
    const left = (i * 53) % 100;
    const d = (i * 271) % 1100;
    const dur = 1650 + ((i * 379) % 850);
    const size = (1.6 + (i % 3) * 0.8).toFixed(1);
    const drift = -(18 + ((i * 29) % 56)) + ((i * 7) % 10);
    const fyv = Math.round((sky + cardH * 0.85) * (0.66 + ((i * 13) % 30) / 100));
    const fo = (0.5 + ((i * 11) % 5) * 0.09).toFixed(2);
    html += `<i class="tn-flake${i % 3 === 2 ? " tn-fsoft" : ""}" style="left:${left}%;width:${size}px;height:${size}px;--fx:${drift}px;--fy:${fyv}px;--fo:${fo};animation-duration:${dur}ms;animation-delay:${d}ms"></i>`;
  }

  // 4) the rime: the card's measured top border, tiled by segments that all
  //    share the claw's skew. Segments crystallize center-out (--gd grows
  //    with distance from the card's midline); the three that sit exactly
  //    where the claws will cross carry a clear clock (--cd) too.
  let riv = "";
  const seg = (x0: number, x1: number, gash: number) => {
    const segCx = (x0 + x1) / 2;
    const gd = Math.round(300 + (Math.min(Math.abs(segCx - cx0), cx0) / cx0) * 1000 + Math.random() * 120);
    const fa = (0.78 + Math.random() * 0.2).toFixed(2);
    const clear = gash >= 0 ? `;--cd:${SLASH + gash * 80 + 40}ms` : "";
    riv += `<i class="tn-riv${gash >= 0 ? " tn-gash" : ""}" style="left:${fx(x0)}px;width:${fx(x1 - x0 + 0.7)}px;--gd:${gd}ms;--fa:${fa}${clear}"></i>`;
  };
  let cur = -14; // overhang past the corner so the skew leaves no bare notch
  gxs.forEach((g, gi) => {
    const l = g - gw / 2;
    const n = Math.max(1, Math.round((l - cur) / 24));
    for (let i = 0; i < n; i++) seg(cur + ((l - cur) * i) / n, cur + ((l - cur) * (i + 1)) / n, -1);
    seg(l, g + gw / 2, gi);
    cur = g + gw / 2;
  });
  {
    const end = w + 14;
    const n = Math.max(1, Math.round((end - cur) / 24));
    for (let i = 0; i < n; i++) seg(cur + ((end - cur) * i) / n, cur + ((end - cur) * (i + 1)) / n, -1);
  }
  html +=
    `<i class="tn-band" style="top:${sky}px;height:${bandH}px">${riv}` +
    `<b class="tn-sheen" style="--tw:${fx(w + 170)}px"></b></i>`;

  // 5) hoarfrost sprigs standing on the border line, drawn stroke by stroke
  //    outward with the rim. Sprigs in a claw's swath get a cut clock (--hd).
  let paths = "";
  for (const f of [0.09, 0.23, 0.37, 0.5, 0.63, 0.76, 0.9]) {
    const sx = f * w + (Math.random() * 12 - 6);
    const h = 11 + Math.random() * 8;
    const lean = Math.random() * 6 - 3;
    const d0 = Math.round(560 + (Math.min(Math.abs(sx - cx0), cx0) / cx0) * 900);
    const p = [
      `M ${fx(sx)} 22 L ${fx(sx + lean)} ${fx(22 - h)}`,
      `M ${fx(sx + lean * 0.45)} ${fx(22 - h * 0.42)} L ${fx(sx + lean * 0.45 - 4.5)} ${fx(22 - h * 0.42 - 4)}`,
      `M ${fx(sx + lean * 0.62)} ${fx(22 - h * 0.6)} L ${fx(sx + lean * 0.62 + 4)} ${fx(22 - h * 0.6 - 3.4)}`,
    ];
    const hitG = gxs.findIndex((g) => Math.abs(sx - g) < 15);
    paths +=
      `<g${hitG >= 0 ? ` class="tn-cut" style="--hd:${SLASH + hitG * 80 + 60}ms"` : ""}>` +
      p.map((dd, pi) => `<path class="tn-sp" pathLength="1" d="${dd}" style="animation-delay:${d0 + pi * 90}ms"/>`).join("") +
      "</g>";
  }
  html += `<svg class="tn-sprigs" style="top:${sky - 22}px" width="${fx(w)}" height="22" viewBox="0 0 ${fx(w)} 22" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">${paths}</svg>`;

  // 6) anticipation: after the true stillness, something passes overhead —
  //    a soft shadow diving toward the border for half a second, its final
  //    frame the first claw's contact frame (delay derives from SLASH so
  //    tuning one can never desync the other). Top is clamped inside the
  //    wrapper so a tight sky never beheads it.
  html += `<i class="tn-paw" style="left:${fx(cx0 + 40)}px;top:${Math.max(2, sky - 74)}px;animation-delay:${SLASH - 500}ms"></i>`;

  // 7) the claw: per claw, a silver rake sweeping down the cut line, a
  //    contact glint, three ice shards, and the red score it leaves behind.
  //    Streak/score anchors are shifted by TAN·(overhang) so their rotated
  //    line passes through the gash segment's skewed cut exactly. The last
  //    claw's shards live shorter so the pre-leaf quiet is genuinely quiet.
  gxs.forEach((g, gi) => {
    const sd = SLASH + gi * 80;
    const above = gi === 1 ? 20 : 14; // the middle claw digs longest
    const below = gi === 1 ? 16 : 10;
    const sh = bandH + above + below;
    html +=
      `<b class="tn-streak" style="left:${fx(g + TAN * above - 2.5)}px;top:${sky - above}px;height:${sh + 8}px;animation-delay:${sd}ms"></b>` +
      `<b class="tn-nick" style="left:${fx(g - TAN * 2)}px;top:${sky + 2}px;animation-delay:${sd + 60}ms"></b>` +
      `<b class="tn-score" style="left:${fx(g + TAN * (above - 4) - 1.1)}px;top:${sky - above + 4}px;height:${sh - 6}px;animation-delay:${sd + 90}ms"></b>`;
    for (let k = 0; k < 3; k++) {
      const shx = (k - 1) * 9 - 6 - Math.random() * 8;
      const shy = 12 + k * 6 + Math.random() * 8;
      html += `<b class="tn-shard" style="left:${fx(g - TAN * (4 + k * 4))}px;top:${sky + 3 + k * 4}px;--sx:${fx(shx)}px;--sy:${fx(shy)}px;animation-duration:${gi === 2 ? 320 : 420}ms;animation-delay:${sd + 70 + k * 30}ms"></b>`;
    }
  });

  // 8) the leaf, positioned AT its landing point on the measured team name —
  //    touchdown is the translate(0,0) frame, precision by construction. Its
  //    entrance waits for last-shard-death + 400ms of scarred quiet, and its
  //    entry frame sits fully inside the wrapper (no clipped first look).
  const lxL = lx - r.left;
  const lyL = ly - (r.top - sky);
  const leafW = 26;
  const lsx = 52 + Math.random() * 26; // enters from up and to the right
  const lsy = -(lyL - leafW / 2 - 2);
  const lex = -(lxL + 48); // exits past the card's left edge (wrapper clips it)
  const leafDelay = Math.round(LAND - LEAF_MS * TOUCH); // 4716ms
  html +=
    `<i class="tn-lshadow" style="left:${fx(lxL - 10)}px;top:${fx(lyL + 5)}px;animation-delay:${leafDelay}ms"></i>` +
    `<b class="tn-leaf" style="left:${fx(lxL - leafW / 2)}px;top:${fx(lyL - leafW / 2)}px;--lsx:${fx(lsx)}px;--lsy:${fx(lsy)}px;--lex:${fx(lex)}px;--ley:30px;animation-delay:${leafDelay}ms">${LEAF_SVG}</b>`;

  const wrap = document.createElement("div");
  wrap.className = "egg-thenorth";
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top - sky}px`;
  wrap.style.width = `${w}px`;
  wrap.style.height = `${sky + cardH}px`;
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  // the slip files at touchdown; its slide-in finishes during the settle,
  // so it reads while the leaf is resting on the name
  setTimeout(() => leagueToast(stamp, text), LAND);
  setTimeout(() => wrap.remove(), 9400);
}

/** UTA — The Riff. The Jazz take their THIRD pick of the session: the card's
 * measured bottom edge becomes a 12-key piano. The keybed assembles left to
 * right under a stage lamp, a hand-glow settles over the first key, one held
 * beat of stillness — then the run: swing eighths (long-short pairs, never
 * evenly spaced) with two grace-note stutters, each key dipping 2px and
 * flashing gold with a string decay while an eighth-note lifts off it in the
 * same rhythm. A 365ms breath, then the resolving chord — a dyad on the last
 * two keys — sustains with vibrato, the whole keybed settles 1px in unison,
 * a held note hangs at its apex, and the cymbal answers: a gold glitter wave
 * and a sheen sweeping the card face. Every post-resolution beat (shimmer,
 * settle, halo, lamp die-off, wrapper fade, toast, cleanup) rides FINAL,
 * which is DERIVED from the score and mirrored to CSS as --fin — restage the
 * run and the whole back half moves with it. */
export function theRiffEgg() {
  queueEgg("riff", 2600, () => theRiffEggRun());
}
function theRiffEggRun() {
  const stamp = "The riff";
  const text = "Third pick of the summer. The band is getting bigger.";
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "Your third acquired pick of the summer starts the riff.");
    return;
  }
  const card = cardOf("UTA");
  if (!card || document.querySelector(".egg-theriff")) return;
  const r = card.getBoundingClientRect();
  const vh = window.innerHeight;
  // the keybed IS the card's measured bottom edge. If that edge isn't on
  // screen — card below the fold, scrolled past, too narrow to seat twelve
  // keys, or too short for the notes to rise inside the card — there is
  // no piano: let the line land on its own.
  if (r.width < 240 || r.height < 150 || r.bottom < 90 || r.bottom > vh - 12) {
    leagueToast(stamp, text, undefined, "Your third acquired pick of the summer starts the riff.");
    return;
  }
  const w = r.width;
  const face = Math.min(r.height, 440); // the stage: card face above the keys
  const kw = w / 12;
  // ---- the score ----------------------------------------------------
  // Swing eighths relative to RUN0: long ≈ 240ms, short ≈ 140ms (a 12/8
  // lilt, deliberately NOT a grid). Two grace-note stutters land 70ms
  // ahead of their main notes, a gathered beat sets up the rush home, and
  // a held 365ms breath (1615 → 1980) resolves into the chord — a dyad on
  // the last two keys, so every key on the bed gets played.
  const RUN0 = 1450;
  const hits: Array<{ k: number; t: number; g?: boolean; c?: boolean }> = [
    { k: 0, t: 0 },
    { k: 1, t: 240 },
    { k: 2, t: 380 },
    { k: 3, t: 620 },
    { k: 4, t: 760 },
    { k: 5, t: 930, g: true }, // grace stutter one…
    { k: 6, t: 1000 }, // …into its note
    { k: 7, t: 1240 },
    { k: 8, t: 1545, g: true }, // grace stutter two…
    { k: 9, t: 1615 }, // …and the run rushes home
    { k: 10, t: 1980, c: true }, // the breath, then the chord: upper voice…
    { k: 11, t: 1980, c: true }, // …and the root, together
  ];
  // FINAL is derived from the score — edit the hits and every downstream
  // beat (CSS --fin, toast, cleanup) moves with the actual last strike.
  const FINAL = RUN0 + Math.max(...hits.map((h) => h.t));
  // ---- the cymbal: fine gold glitter, delays keyed to a left→right wave.
  // Speck size lives in CSS (three grain depths); JS scatters left/top
  // across the card face and hands each grain its wave offset --gd.
  let specks = "";
  for (let i = 0; i < 24; i++) {
    const f = i / 23;
    const sx = f * 96 + Math.random() * 3;
    const sy = 10 + ((i * 37) % 70) + Math.random() * 6;
    const gd = f * 430 + Math.random() * 70;
    const size = i % 3 === 0 ? " rf-sps" : i % 3 === 2 ? " rf-spl" : "";
    const pale = i % 4 === 2 ? " rf-sp2" : "";
    specks +=
      `<b class="rf-sp${size}${pale}" style="left:${sx.toFixed(1)}%;` +
      `top:${sy.toFixed(1)}%;--gd:${gd.toFixed(0)}ms"></b>`;
  }
  // the face-clipped stage inherits the card's real corners — measured
  const radius = getComputedStyle(card).borderRadius || "8px";
  // sustain halo waits behind the dyad for the chord (--fin); its 66px
  // ellipse is clamped so it never spills past the card's right edge
  const holdX = Math.min(11 * kw, w - 33);
  let html =
    `<i class="rf-stage" style="border-radius:${radius}">` +
    '<i class="rf-lamp"></i><b class="rf-sheen"></b>' +
    specks +
    "</i>" +
    '<b class="rf-rail" style="--in:60ms"></b>' +
    `<i class="rf-hold" style="left:${holdX.toFixed(1)}px"></i>`;
  // ---- the keys: entrance ripples L→R; each face carries its own strike.
  // The chord's two voices get the pedaled-hammer variants (root deepest).
  for (const h of hits) {
    const cls = h.c ? (h.k === 11 ? " rf-ff" : " rf-fc") : h.g ? " rf-gf" : "";
    html +=
      `<i class="rf-key" style="left:${(h.k * kw).toFixed(1)}px;width:${(kw - 1).toFixed(1)}px;--in:${80 + h.k * 28}ms">` +
      `<b class="rf-kf${cls}" style="--hit:${RUN0 + h.t}ms"></b></i>`;
  }
  // sharps ride the key boundaries in real octave clusters (2 + 3), fade
  // in after the ivories, and settle with the rail on the chord
  [0, 1, 3, 4, 5, 7, 8, 10].forEach((s, si) => {
    html +=
      `<b class="rf-sharp" style="left:${((s + 1) * kw - kw * 0.26).toFixed(1)}px;` +
      `width:${(kw * 0.52).toFixed(1)}px;--in:${430 + si * 24}ms"></b>`;
  });
  // the pianist's breath over key 0 — the anticipation before the strike
  html += '<i class="rf-hand"></i>';
  // ---- the notes: one per strike, same rhythm; graces get pale ghosts.
  // The chord's upper voice folds into the ONE big held note off the root,
  // which rises from the dyad's center and hangs at its apex.
  for (const h of hits) {
    if (h.c && h.k !== 11) continue;
    const fin = h.k === 11;
    const x = fin ? 11 * kw : (h.k + 0.5) * kw;
    // three run sizes for depth; graces small, the held note the biggest
    const fs = fin ? 24 : h.g ? 11 : 13 + (h.k % 3) * 2;
    // the held note drifts back over the card, never off its right edge
    const nx = fin
      ? (-(6 + Math.random() * 6)).toFixed(0)
      : ((h.k % 2 ? 1 : -1) * (8 + ((h.k * 7) % 12)) + (Math.random() * 4 - 2)).toFixed(0);
    const ny = -(fin ? Math.min(112, face - 54) : 64 + ((h.k * 29) % 46));
    const nr = ((h.k % 2 ? -1 : 1) * (10 + ((h.k * 11) % 12))).toFixed(0);
    const no = h.g ? 0.5 : 0.9;
    const cls = fin ? " rf-nf" : h.g ? " rf-ng" : "";
    html +=
      `<b class="rf-note${cls}" style="left:${x.toFixed(1)}px;font-size:${fs}px;` +
      `--nx:${nx}px;--ny:${ny}px;--nr:${nr}deg;--no:${no};` +
      `animation-delay:${RUN0 + h.t + 30}ms">${h.k % 3 === 1 ? "♫" : "♪"}</b>`;
  }
  const wrap = document.createElement("div");
  wrap.className = "egg-theriff";
  wrap.style.left = `${r.left.toFixed(1)}px`;
  wrap.style.top = `${(r.bottom - face).toFixed(1)}px`;
  wrap.style.width = `${w.toFixed(1)}px`;
  wrap.style.height = `${face.toFixed(1)}px`;
  wrap.style.setProperty("--fin", `${FINAL}ms`);
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  // the stamp lands ON the chord — the shimmer is still crossing the face
  // as the slip arrives
  setTimeout(() => leagueToast(stamp, text), FINAL + 30);
  // cleanup rides FINAL too: the fade starts at FINAL + 2600ms, runs
  // 800ms, and the wrapper leaves 300ms after the paper is dark
  setTimeout(() => wrap.remove(), FINAL + 3700);
}

/** WAS — The Blossoms. D.C. in April: the projection improves and a dozen
 * cherry petals spill across the card from the upper-right on a lazy S-wind,
 * each on its own phase, speed, and flutter — all clear of the sky by the
 * time the moment needs quiet. One breaks from the flock at the flock's own
 * pace, hovers, and sets down exactly on the committed-salary figure in the
 * header — rests there 1.26s while the card blushes the faintest pink — then
 * the wind reclaims it off the card's edge. The toast waits for the
 * touchdown. Reduced motion gets a motionless keepsake: the blush plus one
 * petal already at rest on the figure. */
export function blossomsEgg() {
  queueEgg("blossoms", 7500, () => blossomsEggRun());
}
function blossomsEggRun() {
  const card = cardOf("WAS");
  if (reducedMotion()) {
    leagueToast("In bloom", "The blossoms came early this year.", undefined, "Any move that improves Washington scatters the petals.");
    if (!card || document.querySelector(".egg-blossoms-still")) return;
    const rc = card.getBoundingClientRect();
    const tabRm = card.querySelector<HTMLElement>(".tabular");
    const figRm = tabRm ? (tabRm.querySelector<HTMLElement>(".total-rule") ?? tabRm) : null;
    const fRm = figRm ? figRm.getBoundingClientRect() : null;
    const sx = fRm ? fRm.left + fRm.width * 0.62 : rc.left + 100;
    const sy = fRm ? fRm.top + fRm.height * 0.3 : rc.top + 52;
    const still = document.createElement("div");
    still.className = "egg-blossoms-still";
    still.style.left = `${rc.left}px`;
    still.style.top = `${rc.top}px`;
    still.style.width = `${rc.width}px`;
    still.style.height = `${Math.min(rc.height, 460)}px`;
    still.style.setProperty("--wbr", getComputedStyle(card).borderRadius || "8px");
    still.innerHTML =
      '<i class="bl-still-wash"></i>' +
      `<b class="bl-still-petal" style="left:${(sx - rc.left - 7.5).toFixed(1)}px;top:${(sy - rc.top - 6).toFixed(1)}px"></b>`;
    document.body.appendChild(still);
    setTimeout(() => still.remove(), 3600);
    return;
  }
  if (!card || document.querySelector(".egg-blossoms")) return;
  const r = card.getBoundingClientRect();
  // stage: the card plus sky above and a gust's worth of margin either side
  const left = r.left - 60;
  const top = r.top - 110;
  const width = r.width + 150;
  const height = Math.min(r.height, 460) + 130;
  // the landing pad — the committed-salary figure: the header's first
  // .tabular, and the ruled total inside it when present
  const tab = card.querySelector<HTMLElement>(".tabular");
  const fig = tab ? (tab.querySelector<HTMLElement>(".total-rule") ?? tab) : null;
  const fr = fig ? fig.getBoundingClientRect() : null;
  const lx = fr ? fr.left + fr.width * 0.62 : r.left + 100;
  const ly = fr ? fr.top + fr.height * 0.3 : r.top + 52;
  const heroW = 15;
  const heroH = 12;
  const hx = lx - left - heroW / 2;
  const hy = ly - top - heroH / 2;
  const wrap = document.createElement("div");
  wrap.className = "egg-blossoms";
  wrap.style.left = `${left}px`;
  wrap.style.top = `${top}px`;
  wrap.style.width = `${width}px`;
  wrap.style.height = `${height}px`;
  // the wash inherits the card's own corners — measured, not assumed
  wrap.style.setProperty("--wbr", getComputedStyle(card).borderRadius || "8px");
  // eleven ambient petals, right-biased spawn INSIDE the sky band (no
  // clipping pop-in), every phase its own — but delay + duration is capped
  // at 4.6s so the flock has thinned by touchdown and cleared before the
  // hero's rest ends; flutter/tip get finite counts sized to the drift
  let petals = "";
  for (let i = 0; i < 11; i++) {
    const px = 36 + ((i * 37) % 62);
    const py = 8 + ((i * 23) % 36);
    const dx = -(90 + ((i * 53) % 150));
    const del = (i * 173) % 1300;
    const dur = Math.min(3800 + ((i * 271) % 900), 4600 - del);
    const dy = Math.round(height * (0.7 + ((i * 17) % 26) / 100) - py);
    const w = 9 + (i % 4) * 2;
    const h = Math.round(w * 0.78);
    const fd = 1050 + ((i * 131) % 500);
    const fi = Math.ceil(dur / fd);
    const ti = Math.ceil(dur / (fd * 1.7));
    const r0 = ((i * 47) % 70) - 35;
    const po = (72 + ((i * 13) % 24)) / 100;
    petals += `<i class="bl-petal" style="left:${px}%;top:${py}px;width:${w}px;height:${h}px;--dx:${dx}px;--dy:${dy}px;--dur:${dur}ms;--del:${del}ms;--fd:${fd}ms;--fi:${fi};--ti:${ti};--r0:${r0}deg;--po:${po}"></i>`;
  }
  // the hero starts inside the box (y = 8) and is positioned AT the landing
  // point, so its touchdown frame is translate 0 0 — precision by construction
  wrap.innerHTML =
    `<i class="bl-wash" style="left:${r.left - left}px;top:${r.top - top}px;width:${r.width}px;height:${Math.min(r.height, 460)}px"></i>` +
    petals +
    `<i class="bl-shadow" style="left:${(lx - left - 8.5).toFixed(1)}px;top:${(ly - top + 4).toFixed(1)}px"></i>` +
    `<b class="bl-hero" style="left:${hx.toFixed(1)}px;top:${hy.toFixed(1)}px;--hsx:${(width * 0.92 - hx).toFixed(1)}px;--hsy:${(8 - hy).toFixed(1)}px;--hex:${(r.left - 26 - lx).toFixed(1)}px;--hey:22px"></b>`;
  document.body.appendChild(wrap);
  // the toast waits for the touchdown — 55% of the hero's 7s flight
  setTimeout(() => leagueToast("In bloom", "The blossoms came early this year."), 3850);
  setTimeout(() => wrap.remove(), 7500);
}

/** LEAGUE — Perfection. Any board team's projection reaches 82 wins: the
 * page sinks to vault-black (heavier and slower than the Intro — this is a
 * vault, not an arena). The record-holder's OWN measured card glows in
 * acknowledgment FIRST, then a gold mote lifts off it and its arrival at
 * dead-center visibly ignites the counter's bloom. The odometer sits
 * readable at 60 for a beat, ROLLS through a long tick-by-tick
 * deceleration, crawls into 81, holds one full cruel beat while the dim
 * deepens a shade in sync, then seats 82 with a mechanical over-travel
 * clunk. The gold-leaf PERFECTION stamp slams in crooked with a room
 * blink, a thud ring, and a burst of fine gold flecks; "82–0 · TEAM"
 * letterpresses beneath on one line; a sheen crosses the settled leaf; a
 * full held beat of stillness; then the dim lifts first and the gold
 * tableau lingers in the returning light before fading. The notary's slip
 * fires on the stamp's impact frame, not the trigger. */
export function perfectionEgg(teamName: string) {
  queueEgg("perfection", 2600, () => perfectionEggRun(teamName));
}
function perfectionEggRun(teamName: string) {
  const stampTxt = "Perfection";
  const line = `${teamName}, eighty-two and oh. Filed and notarized. The '96 Bulls send a fruit basket.`;
  if (reducedMotion()) {
    leagueToast(stampTxt, line, undefined, "You just projected an 82-0 season. That is the whole trigger.");
    return;
  }
  if (document.querySelector(".egg-perfection")) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // THE timing knob. ROLL is when the reels start rolling; SLAM is the
  // stamp's impact frame (= ROLL + 4.6s reel + 50ms seat beat + 260ms to
  // the slam's 52% keyframe). Both are stamped onto the wrapper as custom
  // properties, and every delay in the CSS derives from them via calc() —
  // one constant, no prose contract. (The three master keyframe blocks
  // pf-room/pf-dim/pf-pool are percentage-keyed to these defaults; if ROLL
  // moves, re-derive those three in CSS.)
  const ROLL = 2350;
  const SLAM = ROLL + 4910;
  const TOTAL = 10800;
  const wrap = document.createElement("div");
  wrap.className = "egg-perfection";
  wrap.style.setProperty("--pf-roll-delay", `${ROLL}ms`);
  wrap.style.setProperty("--pf-slam", `${SLAM}ms`);
  // the mote's destination is the counter's stage (50% / 44%), in px so the
  // flight keyframes and the fixed center agree exactly
  wrap.style.setProperty("--m1x", `${(vw / 2).toFixed(1)}px`);
  wrap.style.setProperty("--m1y", `${(vh * 0.44).toFixed(1)}px`);
  // the precision beat: the projection lifts off the record-holder's own
  // card — identified by its TITLE link's exact text, so a "via Boston"
  // trade note inside another team's card can't false-match — measured
  // once, real border-radius and all. If the card is off the board or
  // off-screen, the garnish is skipped and the vault opens regardless:
  // this egg is league-wide.
  const card =
    Array.from(document.querySelectorAll<HTMLElement>("[data-egg-team]")).find((c) =>
      Array.from(c.querySelectorAll<HTMLAnchorElement>('a[href^="/team/"]')).some(
        (a) => (a.textContent ?? "").trim() === teamName
      )
    ) ?? null;
  let source = "";
  if (card) {
    const r = card.getBoundingClientRect();
    if (r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw) {
      const ch = Math.min(r.height, 460);
      const mx = Math.min(Math.max(r.left + r.width / 2, 16), vw - 16);
      const my = Math.min(Math.max(r.top + ch / 2, 16), vh - 16);
      wrap.style.setProperty("--m0x", `${mx.toFixed(1)}px`);
      wrap.style.setProperty("--m0y", `${my.toFixed(1)}px`);
      source =
        `<i class="pf-source" style="left:${r.left.toFixed(1)}px;top:${r.top.toFixed(1)}px;width:${r.width.toFixed(1)}px;height:${ch.toFixed(1)}px;border-radius:${getComputedStyle(card).borderRadius || "8px"}"></i>` +
        '<b class="pf-mote"></b>';
    }
  }
  // odometer reels: tens carries 6→7→8; ones runs 24 cells (indices 0–23):
  // 60's "0" at cell 0 up through 82's "2" at cell 22, plus a spare "3" at
  // cell 23 that peeks during the -22.14em over-travel before the reel
  // settles back to -22em
  const cells = (seq: number[]) => seq.map((d) => `<b>${d}</b>`).join("");
  const ones = cells(Array.from({ length: 24 }, (_, k) => k % 10));
  const tens = cells([6, 7, 8]);
  // gold flecks kicked loose by the slam: an elliptical up-and-out burst,
  // then a slow drift down — every fleck on its own clock keyed off SLAM,
  // three golds, every third one a rectangular leaf-flake that tumbles
  let flecks = "";
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + Math.random() * 0.55;
    const rad = 46 + Math.random() * 112;
    const bx = Math.cos(a) * rad * 1.3;
    const by = Math.sin(a) * rad * 0.6 - 24 - Math.random() * 26;
    const fy = 92 + Math.random() * 88;
    const w = i % 3 === 0 ? 4 : 2 + (i % 2);
    const h = i % 3 === 0 ? 3 : w;
    flecks +=
      `<b class="pf-fleck" style="width:${w}px;height:${h}px;` +
      `background:${["#f6e27a", "#d9b54a", "#b8860b"][i % 3]};` +
      `--bx:${bx.toFixed(0)}px;--by:${by.toFixed(0)}px;--fy:${fy.toFixed(0)}px;` +
      `--rz:${(Math.random() * 340 - 170).toFixed(0)}deg;` +
      `animation-duration:${(1300 + Math.random() * 500).toFixed(0)}ms;` +
      `animation-delay:${(SLAM + Math.random() * 420).toFixed(0)}ms"></b>`;
  }
  wrap.innerHTML =
    '<i class="pf-dim"></i>' +
    '<i class="pf-pool"></i>' +
    source +
    '<i class="pf-flash"></i>' +
    '<i class="pf-center">' +
    '<i class="pf-kicker"><b></b>Projected wins<b></b></i>' +
    '<i class="pf-count">' +
    `<i class="pf-clunk"><b class="pf-reel pf-tens"><i class="pf-strip">${tens}</i></b><b class="pf-reel pf-ones"><i class="pf-strip">${ones}</i></b></i>` +
    '<b class="pf-thud"></b>' +
    flecks +
    `<b class="pf-stamp stamp">${stampTxt}<i class="pf-sheenclip"><i class="pf-sheen"></i></i></b>` +
    "</i>" +
    `<i class="pf-sub">82–0 · ${teamName}</i>` +
    "</i>";
  document.body.appendChild(wrap);
  // the notary speaks ON the stamp's impact frame
  setTimeout(() => leagueToast(stampTxt, line), SLAM);
  setTimeout(() => wrap.remove(), TOTAL + 400);
}

/** LEAGUE · The Lottery. Any board team's projection reaches ZERO wins: the
 * room dims and the hopper spins up — the card itself rumbles (the shipped
 * .egg-rumble, globals.css), the machine exhales one huff of air at its
 * measured top edge timed from the first ball's actual release — then
 * fourteen numbered ping-pong balls spill from the sky above the card in a
 * shuffled release order, each bouncing off that exact top edge on its own
 * elasticity (per-ball bounce heights, flight duration, lateral drift),
 * dribbling out, tipping off the lip from rest, falling the card face on a
 * slow-start ease-in, and landing directly at its solved rest height along
 * the bottom edge. The tray line is one theme-aware quadratic Bezier drawn
 * at the card's measured bottom edge, and every ball's rest height is
 * solved from that same quadratic, so the finished row of balls IS the
 * drawn curve. A held beat of stillness. Then whichever ball happened to
 * land carrying number 1 glows warm — the other thirteen recede 300ms
 * later, once the eye has found it — leaves a print on the tray, gathers
 * with a small dip, and rises slowly up the card face, its number
 * resolving to "#1" in the decelerating leg of the rise. The paper slip
 * rides the rise, not the trigger, and the apex holds through two halo
 * breaths before the scene fades. Ball translation runs on two nested
 * clocks (drift on .lot-x, gravity on .lot-y) with the tumble on a third,
 * so each axis eases independently. Every downstream beat — including the
 * scene's total length — derives from the measured settle of the last
 * ball, so tuning the stagger can never eat the hold. */
export function lotteryEgg(team: string) {
  queueEgg("lottery", 2600, () => lotteryEggRun(team));
}
function lotteryEggRun(team: string) {
  const stamp = "The lottery";
  const text = "Zero and eighty-two. The balls are already in the mail.";
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "A roster projecting under the '12 Bobcats (eight wins) does this.");
    return;
  }
  if (document.querySelector(".egg-lottery")) return; // one drawing at a time
  const card = cardOf(team);
  if (!card) {
    // card off the board — the season is still zero and eighty-two
    leagueToast(stamp, text, undefined, "A roster projecting under the '12 Bobcats (eight wins) does this.");
    reopenEgg("lottery");
    return;
  }
  const r = card.getBoundingClientRect();
  const vh = window.innerHeight;
  const w = r.width;
  // The machine needs its whole stage on screen: sky above the top edge for
  // the drop, the bottom edge (the tray) above the fold, and enough width
  // for fourteen rest slots. No stage — the line lands immediately instead
  // of playing to an empty room.
  if (r.top < 70 || r.bottom > vh - 16 || r.height < 200 || w < 290) {
    leagueToast(stamp, text, undefined, "A roster projecting under the '12 Bobcats (eight wins) does this.");
    reopenEgg("lottery");
    return;
  }
  const drop = Math.min(160, r.top - 10); // sky above the card
  const sp = Math.min(27, (w - 16) / 14); // one tray slot per ball
  // ball diameter solved from the measured width: 22px at full card scale,
  // capped at 19px below 400px so fourteen balls never crowd the arc
  const s = Math.round(Math.min(w < 400 ? 19 : 22, Math.max(15, sp - 4)));
  const pad = (w - sp * 14) / 2;
  const sag = 10; // tray sag at center — feeds BOTH the drawn curve and the rests
  const edgeY = drop - s; // ball top when its base kisses the card's top edge
  const floorY = drop + r.height - s; // ball top when its base kisses the bottom edge
  const fx = (n: number) => n.toFixed(1);
  // shuffled numbers ON the balls, and a second shuffle for release order,
  // so the tray fills in non-monotonically — like a hopper, not a printer
  const nums: number[] = [];
  for (let i = 1; i <= 14; i++) nums.push(i);
  for (let i = 13; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = nums[i];
    nums[i] = nums[j];
    nums[j] = t;
  }
  const order: number[] = nums.map((_, i) => i);
  for (let i = 13; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  const delays: number[] = new Array(14).fill(0);
  order.forEach((slot, k) => {
    delays[slot] = 560 + k * 78 + Math.random() * 55;
  });
  const firstDrop = Math.min(...delays);
  const heroSlot = nums.indexOf(1); // the winner is wherever 1 happened to land
  let settle = 0;
  let balls = "";
  let glint = "";
  for (let i = 0; i < 14; i++) {
    const ti = (i + 0.5) / 14;
    const cx = pad + (i + 0.5) * sp;
    const rx = cx - s / 2;
    // rest height solved from the tray's own quadratic: the same Bezier the
    // SVG draws, so each ball sits exactly ON the curve
    const lift = sag * (1 - 4 * ti * (1 - ti));
    const x0 = Math.min(Math.max(rx + (Math.random() * 2 - 1) * w * 0.16, 4), w - s - 4);
    const x1 = rx + (x0 - rx) * 0.35 + (Math.random() * 2 - 1) * 8;
    const dir = rx >= x1 ? 1 : -1; // roll direction into the slot
    const xo = Math.min(Math.max(rx + dir * (5 + Math.random() * 7), 2), w - s - 2);
    const b1 = 34 + Math.random() * 26; // first bounce height — its elasticity
    const b2 = b1 * (0.3 + Math.random() * 0.15); // second, decayed
    const dur = 2250 * (0.92 + Math.random() * 0.17);
    const delay = delays[i];
    settle = Math.max(settle, delay + dur);
    const hero = i === heroSlot;
    const rot = -dir * (380 + Math.random() * 320); // unwinds as it rolls in
    const rt = hero ? 0 : Math.random() * 24 - 12; // hero settles dead upright
    if (hero) {
      glint = `<b class="lot-glint" style="left:${fx(cx)}px;top:${fx(floorY - lift + s)}px"></b>`;
    }
    balls +=
      `<i class="lot-b${hero ? " lot-hero" : ""}" style="--bt:${dur.toFixed(0)}ms;--bd:${delay.toFixed(0)}ms;` +
      `--x0:${fx(x0)}px;--x1:${fx(x1)}px;--xo:${fx(xo)}px;--rx:${fx(rx)}px;` +
      `--b1:${fx(b1)}px;--b2:${fx(b2)}px;--lift:${fx(lift)}px;--rot:${rot.toFixed(0)}deg;--rt:${fx(rt)}deg">` +
      `<i class="lot-x"><i class="lot-y">${hero ? '<b class="lot-halo"></b>' : ""}` +
      `<b class="lot-face"><b class="lot-n">${nums[i]}</b>${hero ? '<b class="lot-hn">#1</b>' : ""}</b>` +
      `</i></i></i>`;
  }
  // the beats: every downstream clock — the glow, the losers' recede, the
  // rise, the reveal, and the scene's TOTAL length — derives from the
  // measured settle, so the fade can never begin before the apex hold ends
  const GLOW = Math.round(settle + 520); // a held beat of stillness first
  const DIM = GLOW + 300; // losers recede AFTER the eye finds the glow
  const RISE = GLOW + 260;
  const RISE_MS = 2250; // matches lot-rise in CSS
  const HOLD = 1400; // apex hold: the halo breathes on an undimmed stage
  const fadeStart = RISE + RISE_MS + HOLD;
  const TOTAL = Math.round(fadeStart / 0.92); // lot-scene fades at 92%
  const wrap = document.createElement("div");
  wrap.className = "egg-lottery";
  wrap.style.left = `${fx(r.left)}px`;
  wrap.style.top = `${fx(r.top - drop)}px`;
  wrap.style.width = `${fx(w)}px`;
  wrap.style.height = `${fx(drop + r.height + 26)}px`;
  wrap.style.setProperty("--lots", `${s}px`);
  wrap.style.setProperty("--lote", `${fx(edgeY)}px`);
  wrap.style.setProperty("--lotf", `${fx(floorY)}px`);
  wrap.style.setProperty("--lotdim", `${DIM}ms`);
  wrap.style.setProperty("--lotglow", `${GLOW}ms`);
  wrap.style.setProperty("--lotrise", `${RISE}ms`);
  wrap.style.setProperty("--lotrev", `${RISE + 1080}ms`); // 48% into the rise
  wrap.style.setProperty("--lotriseh", `${Math.min(r.height * 0.58, 300).toFixed(0)}px`);
  wrap.style.setProperty("--lottotal", `${TOTAL}ms`);
  // the tray: one quadratic across the exact ball row, its low point kissing
  // the card's measured bottom edge, its ends riding up by the same sag the
  // outermost rests use; stroke comes from CSS so it survives both themes
  const rowW = sp * 14;
  const tray =
    `<svg class="lot-tray" style="left:${fx(pad)}px;top:${fx(drop + r.height - sag - 3)}px" ` +
    `width="${rowW.toFixed(0)}" height="${sag + 8}" viewBox="0 0 ${rowW.toFixed(0)} ${sag + 8}" fill="none">` +
    `<path d="M 1 2 Q ${fx(rowW / 2)} ${2 + 2 * sag} ${fx(rowW - 1)} 2"/></svg>`;
  // the huff's delay derives from the first release (the ct-clap contract:
  // tuning the stagger in TS can never desync the anticipation)
  wrap.innerHTML =
    '<i class="lot-dim"></i>' +
    tray +
    `<i class="lot-huff" style="left:${fx(w / 2)}px;top:${fx(drop)}px;` +
    `animation-delay:${Math.max(0, Math.round(firstDrop - 300))}ms"></i>` +
    balls +
    glint;
  document.body.appendChild(wrap);
  // the hopper spins up under the dim — the machine is on before it pays out
  shake(card, "egg-rumble", 1900);
  // the commissioner speaks as the ball rises, not when the trigger fired
  setTimeout(() => leagueToast(stamp, text), RISE + 170);
  setTimeout(() => wrap.remove(), TOTAL + 400);
}

/** LEAGUE — The Freeze. A move pushes a board team UP across the second
 * apron: cold arrives on the ledger. The card's DRAFT PICKS OWNED section is
 * measured (exact label hunt, then its full-width section ancestor; fallback
 * to the card's bottom third), clamped to 300px anchored to its BOTTOM edge
 * so the last pick chip and the card-bottom corners stay inside: a draft of
 * cold air sighs down the region and crystal seeds glint on its four real
 * corners in the creep order (each dying ~120ms before its bloom ignites);
 * frost then creeps IN from those corners — corner blooms plus fine ice-fern
 * strokes generated from the measured rect, every stroke on its own clock —
 * while the region's tint cools blue-white. A padlock drops onto the LAST
 * pick chip; its shackle falls at 2.79s and strikes home at 2.87s, and the
 * region's 2px shake, the glint and the toast all land ON that strike. The
 * ledger holds frozen while breath-mist drifts and the ice sparkles; then it
 * thaws, the lock visibly letting go last. */
export function freezeEgg(team: string) {
  queueEgg(`freeze:${team}`, 7600, () => freezeEggRun(team));
}
function freezeEggRun(team: string) {
  const stamp = "Frozen";
  const text = "Over the second apron. Your seventh-year first is now league property, spiritually. (§24(d).)";
  if (reducedMotion()) {
    leagueToast(stamp, text, "red", "Crossing up into the second apron freezes the room.");
    return;
  }
  const card = cardOf(team);
  if (!card || document.querySelector(".egg-freeze")) return;
  const r = card.getBoundingClientRect();

  // the precision anchor: the smallest element reading exactly
  // "Draft picks owned" (rendered uppercase by .label styling)
  const label = [...card.querySelectorAll<HTMLElement>("div, span")]
    .filter((e) => (e.textContent || "").trim().toUpperCase() === "DRAFT PICKS OWNED")
    .map((e) => ({ e, rc: e.getBoundingClientRect() }))
    .filter(({ rc }) => rc.height > 6 && rc.height < 40 && rc.width > 40)
    .sort((a, b) => a.rc.width * a.rc.height - b.rc.width * b.rc.height)[0];

  // walk up to the full-width section div that owns the label + pick chips
  let section: HTMLElement | null = label ? label.e : null;
  while (section && section !== card && section.getBoundingClientRect().width < r.width - 24) {
    section = section.parentElement;
  }
  if (section === card || (section && !card.contains(section))) section = null;
  const srect = section ? section.getBoundingClientRect() : null;

  // the frozen region, in viewport coords
  const left = r.left;
  const w = r.width;
  let top: number;
  let bottom: number;
  if (srect) {
    top = srect.top;
    bottom = Math.min(srect.bottom + 2, r.bottom);
  } else if (label) {
    top = label.rc.top - 8;
    bottom = r.bottom;
  } else {
    // fallback: the card's bottom third, flush with the card's bottom edge
    bottom = r.bottom;
    top = bottom - Math.min(r.height / 3, 200);
  }
  // clamp tall sections by pulling TOP down, never bottom up: the region
  // must keep reaching its own bottom edge so the last chip (the padlock's
  // target) and the rounded card-bottom corners stay inside the crop
  if (bottom - top > 300) top = bottom - 300;
  let hgt = bottom - top;
  if (!(hgt > 36)) {
    bottom = r.bottom;
    top = bottom - Math.min(r.height / 3, 200);
    hgt = bottom - top;
  }

  // the padlock lands dead-center on the LAST pick chip, clamped inside the
  // clipped region so the click never loses its shackle to the crop
  let lx = w * 0.84;
  let ly = hgt * 0.62;
  if (section) {
    const btns = section.querySelectorAll<HTMLElement>("button");
    const last = btns.length ? btns[btns.length - 1] : null;
    if (last) {
      const b = last.getBoundingClientRect();
      lx = b.left + b.width / 2 - left;
      ly = b.top + b.height / 2 - top;
    }
  }
  lx = Math.min(Math.max(lx, 16), w - 16);
  ly = Math.min(Math.max(ly, 14), hgt - 13);

  const wrap = document.createElement("div");
  wrap.className = "egg-freeze";
  wrap.style.left = `${left.toFixed(1)}px`;
  wrap.style.top = `${top.toFixed(1)}px`;
  wrap.style.width = `${w.toFixed(1)}px`;
  wrap.style.height = `${hgt.toFixed(1)}px`;
  // the bottom-corner rounding is only honest when the region genuinely
  // ends on the card's bottom edge — zero it when a footer sits below
  const flush = Math.abs(bottom - r.bottom) <= 2;
  wrap.style.setProperty("--fr", flush ? getComputedStyle(card).borderRadius || "10px" : "0px");

  const n = (v: number) => v.toFixed(1);
  // ice ferns, generated from the region's real corners: per corner a
  // diagonal spine, a horizontal edge-runner, a vertical edge-runner, and
  // three feather branches off the spine — 24 strokes, each on its own
  // clock. pathLength="1" is load-bearing: the CSS draw uses dasharray 1.
  const veins: string[] = [];
  const vein = (d: string, delay: number, dur: number, thin: boolean) => {
    veins.push(
      `<path class="fz-vein${thin ? " fz-thin" : ""}" pathLength="1" d="${d}" ` +
        `style="--gdel:${delay.toFixed(0)}ms;--gdur:${dur.toFixed(0)}ms"/>`
    );
  };
  const fern = (cx: number, cy: number, dx: number, dy: number, base: number) => {
    const reach = w * (0.24 + Math.random() * 0.07);
    const drop = hgt * (0.46 + Math.random() * 0.18);
    const c1x = cx + dx * reach * 0.5;
    const c1y = cy + dy * drop * 0.14;
    const ex = cx + dx * reach;
    const ey = cy + dy * drop;
    // spine: hugs the horizontal edge, then bends inward
    vein(`M ${n(cx)} ${n(cy)} Q ${n(c1x)} ${n(c1y)} ${n(ex)} ${n(ey)}`, base, 1150 + Math.random() * 200, false);
    // edge-runners: thin frost racing along the region's own edges
    vein(`M ${n(cx)} ${n(cy)} Q ${n(cx + dx * w * 0.16)} ${n(cy + dy * 2)} ${n(cx + dx * w * 0.3)} ${n(cy + dy * 8)}`, base + 60, 1000, true);
    vein(`M ${n(cx)} ${n(cy)} Q ${n(cx + dx * 3)} ${n(cy + dy * hgt * 0.34)} ${n(cx + dx * 9)} ${n(cy + dy * hgt * 0.66)}`, base + 130, 880, true);
    // feather branches off the spine at t = .30/.55/.80, alternating sides,
    // shrinking toward the tip, each waiting for the spine to reach it
    for (let i = 0; i < 3; i++) {
      const t = 0.3 + i * 0.25;
      const mt = 1 - t;
      const px = mt * mt * cx + 2 * mt * t * c1x + t * t * ex;
      const py = mt * mt * cy + 2 * mt * t * c1y + t * t * ey;
      const bl = (1 - t * 0.45) * (11 + Math.random() * 7);
      const d =
        i % 2
          ? `M ${n(px)} ${n(py)} q ${n(dx * bl * 0.55)} ${n(dy * bl * 0.08)} ${n(dx * bl * 1.05)} ${n(dy * bl * 0.34)}`
          : `M ${n(px)} ${n(py)} q ${n(dx * bl * 0.12)} ${n(dy * bl * 0.55)} ${n(dx * bl * 0.38)} ${n(dy * bl * 1.05)}`;
      vein(d, base + 380 + i * 150, 520, true);
    }
  };
  // creep order TL → BR → TR → BL: opposite corners answer each other,
  // which reads organic rather than mechanical
  const creep = [950, 1070, 1190, 1310];
  fern(0, 0, 1, 1, creep[0]);
  fern(w, hgt, -1, -1, creep[1]);
  fern(w, 0, -1, 1, creep[2]);
  fern(0, hgt, 1, -1, creep[3]);

  // crystal seeds sit OUTSIDE the shakebox (no overflow clip, and they die
  // long before the 2.87s shake) so the full dot + glow reads on the exact
  // corners; each seed's clock is its corner's bloom delay minus 670ms, so
  // it extinguishes ~120ms before its own bloom ignites and the TL→BR→TR→BL
  // creep order is already legible in the anticipation beat
  let html = "";
  const seedXY: Array<[number, number]> = [[0, 0], [w, hgt], [w, 0], [0, hgt]];
  seedXY.forEach(([sx, sy], i) => {
    html += `<b class="fz-seed" style="left:${n(sx)}px;top:${n(sy)}px;--sdel:${creep[i] - 670}ms"></b>`;
  });

  html += '<i class="fz-shakebox">';
  // thermal layers first: the anticipation draft under the freeze glaze
  html += '<i class="fz-draft"></i><i class="fz-tint"></i>';
  html += `<i class="fz-breath" style="left:${n(w * 0.1)}px;top:${n(hgt * 0.32)}px"></i>`;
  // corner blooms share the ferns' stagger so ice and glow arrive together
  const corners: Array<[string, number]> = [["fz-ctl", creep[0]], ["fz-cbr", creep[1]], ["fz-ctr", creep[2]], ["fz-cbl", creep[3]]];
  corners.forEach(([cls, d]) => {
    html += `<i class="fz-c ${cls}" style="--cdel:${d}ms"></i>`;
  });
  html += `<svg class="fz-ferns" width="${Math.round(w)}" height="${Math.round(hgt)}" viewBox="0 0 ${Math.round(w)} ${Math.round(hgt)}" fill="none">${veins.join("")}</svg>`;
  // hold beat: two breath wisps on separate clocks
  const mists: Array<[number, number, number, number]> = [
    [w * 0.06, hgt * 0.28, 3050, 2350],
    [w * 0.3, hgt * 0.58, 3650, 2600],
  ];
  mists.forEach(([mx, my, mdel, mdur]) => {
    html += `<i class="fz-mist" style="left:${n(mx)}px;top:${n(my)}px;width:${n(w * 0.36)}px;--mdx:${n(w * 0.4)}px;--mdel:${mdel}ms;--mdur:${mdur}ms"></i>`;
  });
  // six sparkles scattered over the hold, each on its own clock
  const sparks: Array<[number, number, number]> = [
    [0.16, 0.3, 3150],
    [0.38, 0.62, 3450],
    [0.57, 0.24, 3720],
    [0.74, 0.7, 3990],
    [0.27, 0.82, 4270],
    [0.88, 0.4, 4540],
  ];
  sparks.forEach(([fx, fy, sd]) => {
    html += `<b class="fz-spark" style="left:${n(w * fx)}px;top:${n(hgt * fy)}px;--pdel:${sd}ms"></b>`;
  });
  // the padlock, dead on the last pick chip; frost strokes ride
  // currentColor (.fz-lock sets color to the theme-mixed ice), and the
  // glint pops off the shackle on the strike frame
  html +=
    `<svg class="fz-lock" style="left:${n(lx - 10)}px;top:${n(ly - 12)}px" width="20" height="24" viewBox="0 0 20 24" fill="none">` +
    '<path class="fz-shackle" d="M6 12 V8 a4 4 0 0 1 8 0 v4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
    '<g class="fz-bodyg"><rect x="3.4" y="11" width="13.2" height="10.4" rx="2.2" fill="#34485f" stroke="currentColor" stroke-width="1.1"/>' +
    '<circle cx="10" cy="15.6" r="1.5" fill="currentColor"/><rect x="9.3" y="15.6" width="1.4" height="3.1" rx="0.7" fill="currentColor"/></g></svg>' +
    `<b class="fz-glint" style="left:${n(lx + 5)}px;top:${n(ly - 12)}px"></b>`;
  html += "</i>";

  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  // the slip lands ON the strike: the shackle starts falling at 2.79s and
  // hits home at its 62% frame (2.87s) alongside the shake and glint —
  // second-apron red, because that's the law
  setTimeout(() => leagueToast(stamp, text, "red"), 2870);
  setTimeout(() => wrap.remove(), 7600);
}

/** LEAGUE — The Audit. The session's committed new salary crosses ONE
 * BILLION DOLLARS: an adding machine bolts to the top of the viewport,
 * its tape measured flush to the board's right rule (the right edge of the
 * rightmost on-screen team card — each rect read once), and audits the
 * session. The head drops in, a blank leader crawls from the slot, six
 * generic ledger lines print on a strict 420ms carriage rhythm — every
 * strike is four clocks at once (tape jolt, head kick, slot glow, ink
 * snap), amounts re-rolled each run and rounded to the $12,500 — then a
 * 560ms carry-the-one pause, the divider, another held breath, and TOTAL
 * strikes in ribbon red with the double-bounce KA-CHUNK (the toast lands
 * on that exact frame). The tape holds, sways to rest, feeds 16px so the
 * perforation clears the slot, and TEARS: the printed length flutters off
 * the bottom of the viewport while a fresh lip scales out for the next
 * audit and the machine retracts into the ceiling. All downstream beats
 * are authored against the feed track (5.75s) / head track (7s) percent
 * grids in globals.css — restage the rhythm there and here together. */
export function auditEgg(total: string) {
  queueEgg("audit", 8200, () => auditEggRun(total));
}
function auditEggRun(total: string) {
  const stamp = "Audited";
  const text = "One billion dollars, committed. Adam nods, slowly.";
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "Your summer's committed salary just cleared one billion dollars.");
    return;
  }
  if (document.querySelector(".egg-audit")) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const W = 232; // tape width — the head and every keyframe are sized off this in CSS
  // precision: the tape unrolls flush with the board's right rule — the
  // right edge of the rightmost visible team card. League-wide effect, so
  // no single cardOf anchor; if no card qualifies (board scrolled away or
  // too narrow), the tape hangs off a clean viewport margin instead.
  let boardRight = 0;
  for (const c of [...document.querySelectorAll<HTMLElement>("[data-egg-team]")]) {
    const rc = c.getBoundingClientRect();
    if (rc.bottom > 0 && rc.top < vh && rc.right > boardRight) boardRight = rc.right;
  }
  const rightEdge =
    boardRight >= W + 48 ? Math.min(boardRight, vw - 12) : vw - Math.max(24, Math.round(vw * 0.05));
  const tx = rightEdge - W;
  // six generic line items, chronological — bands give the tape a real
  // ledger's texture (one max-shaped deal, one minimum), amounts re-rolled
  // per run and rounded to the $12,500 like real contract numbers
  const kinds = ["SIGNING", "EXTENSION", "SIGNING", "SIGNING", "EXTENSION", "SIGNING"];
  const bands: Array<[number, number]> = [
    [24, 42],
    [6, 13],
    [2.1, 3.4],
    [38, 56],
    [15, 29],
    [27, 45],
  ];
  const amountOf = (k: number): string => {
    const [lo, hi] = bands[k];
    const v = Math.round(((lo + Math.random() * (hi - lo)) * 1e6) / 12500) * 12500;
    return `$${v.toLocaleString("en-US")}`;
  };
  // the sheet reads top→bottom as [perforation, TOTAL, divider, newest…
  // oldest, leader lip] — the newest line always sits at the slot, exactly
  // as a top-mounted machine would feed it. Rows carry per-run jitter
  // (rotation, x, ink density): hand-fed paper never prints square. Ink
  // delays fire 30ms before each carriage step, so every line emerges
  // from the slot already struck.
  let rows = "";
  for (let k = 5; k >= 0; k--) {
    const rj = (Math.random() * 0.7 - 0.35).toFixed(2);
    const xj = (Math.random() * 2 - 1).toFixed(1);
    const io = (0.8 + Math.random() * 0.14).toFixed(2);
    rows +=
      `<b class="au-row" style="--rj:${rj}deg;--xj:${xj}px;--io:${io};animation-delay:${1120 + k * 420}ms">` +
      `<span>${kinds[k]}</span><u></u><span>${amountOf(k)}</span></b>`;
  }
  const wrap = document.createElement("div");
  wrap.className = "egg-audit";
  wrap.style.setProperty("--tx", `${tx.toFixed(1)}px`);
  wrap.style.setProperty("--fall", `${(vh + 60).toFixed(0)}px`);
  wrap.innerHTML =
    '<i class="au-dim"></i>' +
    '<b class="au-win"><b class="au-sheet">' +
    '<i class="au-holes au-hl"></i><i class="au-holes au-hr"></i>' +
    '<i class="au-perf"></i>' +
    // the star is the mark a real adding machine prints beside its total
    `<b class="au-row au-total" style="animation-delay:4400ms"><span>TOTAL</span><u></u><span>${total} *</span></b>` +
    '<i class="au-div" style="animation-delay:3780ms"></i>' +
    rows +
    '<i class="au-lip"></i>' +
    "</b></b>" +
    '<i class="au-glow"></i>' +
    '<i class="au-thump"></i>' +
    '<i class="au-head"><b class="au-tag">LEAGUE OFFICE · AUDIT</b>' +
    '<i class="au-slot"></i><i class="au-lamp"></i><i class="au-fresh"></i><i class="au-shade"></i></i>';
  document.body.appendChild(wrap);
  // the KA-CHUNK is the peak — the slip goes out as the total strikes
  setTimeout(() => leagueToast(stamp, text), 4430);
  setTimeout(() => wrap.remove(), 8200);
}

/** LEAGUE — The Commissioner. The session's moves have now touched all 30
 * franchises: the room goes formal. The page dims like a hearing called to
 * order; one hard-edged podium spotlight strikes dead-center and then does
 * NOT move — where the Intro's spot hunts, this one is still, and the
 * stillness is the menace. One beat. Two. The verdict slams under the lamp
 * (the slip goes out as the ink settles), then all thirty franchises file
 * single-file across the bottom of the pool in alphabetical order — each
 * logo igniting exactly at the circle's chord at walking height
 * (hw = R·sin(acos 0.66), measured) and going dark at the far edge — before
 * the lamp dies with a gutter-blink and the room comes back. */
export function commissionerEgg() {
  queueEgg("commish", 8200, () => commissionerEggRun());
}
function commissionerEggRun() {
  const stamp = "Summoned";
  const text = "Thirty franchises. One desk. Bring the ledger.";
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "All thirty teams have now appeared in your dealings.");
    return;
  }
  if (document.querySelector(".egg-commissioner")) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // the lamp seat: dead-center horizontally, a touch high so the pool's
  // floor — where the procession walks — sits near the page's optical middle
  const cx = vw / 2;
  const cy = vh * 0.46;
  const r = Math.min(vw * 0.34, vh * 0.3, 195);
  const by = cy + r * 0.66; // walking height, below the lamp's center
  // the chord: where the CIRCLE says the light begins and ends at y = by.
  // The procession mask, the floor glow, and the travel bounds all ride it.
  const hw = r * Math.sqrt(1 - 0.66 * 0.66);
  const SP = 23; // single-file spacing: 18px logo + 5px air
  const teams = [
    "ATL", "BOS", "BKN", "CHA", "CHI", "CLE", "DAL", "DEN", "DET", "GSW",
    "HOU", "IND", "LAC", "LAL", "MEM", "MIA", "MIL", "MIN", "NOP", "NYK",
    "OKC", "ORL", "PHI", "PHX", "POR", "SAC", "SAS", "TOR", "UTA", "WAS",
  ];
  const rowW = teams.length * SP;
  const wrap = document.createElement("div");
  wrap.className = "egg-commissioner";
  wrap.style.setProperty("--cx", `${cx.toFixed(1)}px`);
  wrap.style.setProperty("--cy", `${cy.toFixed(1)}px`);
  wrap.style.setProperty("--r", `${r.toFixed(1)}px`);
  wrap.style.setProperty("--by", `${by.toFixed(1)}px`);
  wrap.style.setProperty("--hw", `${hw.toFixed(1)}px`);
  // travel constructed, not eyeballed: at t=0 the lead logo sits exactly ON
  // the chord's left edge about to enter the light; at t=1 the last logo
  // has exactly cleared its right
  wrap.style.setProperty("--mx0", `${(cx - hw - rowW).toFixed(1)}px`);
  wrap.style.setProperty("--mx1", `${(cx + hw).toFixed(1)}px`);
  // the stamp seats in the pool's upper half, above the walking line
  wrap.style.setProperty("--sx", `${cx.toFixed(1)}px`);
  wrap.style.setProperty("--sy", `${(cy - r * 0.26).toFixed(1)}px`);
  wrap.style.setProperty("--shw", `${(r * 1.15).toFixed(0)}px`);
  // three motes hanging in the cone — each on its own fall clock; the only
  // motion during the two long beats, there to prove the lamp isn't drifting
  let motes = "";
  for (let i = 0; i < 3; i++) {
    const mx = cx + r * (-0.3 + i * 0.34);
    const my = cy - r * (0.55 - i * 0.14);
    motes +=
      `<i class="cm-mote" style="left:${mx.toFixed(1)}px;top:${my.toFixed(1)}px;` +
      `--md:${1700 + i * 760}ms;--mdur:${3200 + i * 540}ms;` +
      `--mo:${(0.34 - i * 0.06).toFixed(2)};--mdx:${i % 2 ? -6 : 5}px"></i>`;
  }
  // thirty franchises in reverse flex order so ATL walks point and the file
  // arrives alphabetically. Footstep bob per logo: duration 300–396ms,
  // phase 57ms apart — no two neighbors step in sync.
  const steps = [...teams]
    .reverse()
    .map(
      (t, i) =>
        `<i class="cm-step" style="animation-duration:${300 + (i % 5) * 24}ms;` +
        `animation-delay:${(i * 57) % 900}ms">` +
        `<img src="/logos/${t}.png" alt="${t}" width="18" height="18"/></i>`
    )
    .join("");
  wrap.innerHTML =
    '<i class="cm-dim"></i>' +
    '<i class="cm-cone"></i>' +
    '<i class="cm-spot"></i>' +
    '<i class="cm-floor"></i>' +
    motes +
    '<b class="cm-shock"></b>' +
    '<b class="cm-stamp stamp">THE COMMISSIONER WILL SEE YOU NOW</b>' +
    `<i class="cm-march"><b class="cm-row">${steps}</b></i>`;
  document.body.appendChild(wrap);
  // the slip goes out as the stamp's ink settles (impact ~3341ms) — the
  // peak of the summons, before the first franchise reaches the light
  setTimeout(() => leagueToast(stamp, text), 3410);
  setTimeout(() => wrap.remove(), 8200);
}

/** LEAGUE · THE HEIST — a wildly lopsided trade (one side robs the other on
 * the value meter). Film-noir: the room drops to vault-black, a red alarm
 * pulses twice, a bank-vault door spins its wheel and swings open on a glow,
 * gold coins spill and tumble down, and a GRAND LARCENY stamp slams. The
 * toast rides the stamp. Page-covering, so it needs no card. */
export function heistEgg(winner?: string) {
  queueEgg("heist", 4400, () => heistEggRun(winner));
}
function heistEggRun(winner?: string) {
  const stamp = "Grand larceny";
  const text = winner ? `${winner} just robbed the vault. Someone check the league office cameras.` : "Someone just robbed the vault. Check the league office cameras.";
  if (reducedMotion()) {
    leagueToast(stamp, text, undefined, "Netting 25-plus value while doubling your return files as larceny.");
    return;
  }
  if (document.querySelector(".egg-heist")) return;
  const bolts = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return `<circle cx="${(50 + Math.cos(a) * 34).toFixed(1)}" cy="${(50 + Math.sin(a) * 34).toFixed(1)}" r="1.7" fill="currentColor"/>`;
  }).join("");
  const coins = Array.from({ length: 12 }, (_, i) => {
    const dx = (((i * 47) % 100) - 50) * 1.2;
    const delay = 1900 + ((i * 90) % 700);
    const dur = 1500 + ((i * 130) % 700);
    const spin = i % 2 ? 1 : -1;
    return `<i class="hs-coin" style="--cx:${dx.toFixed(0)}px;--cs:${spin};animation-delay:${delay}ms;animation-duration:${dur}ms"></i>`;
  }).join("");
  const wrap = document.createElement("div");
  wrap.className = "egg-heist";
  wrap.innerHTML =
    '<i class="hs-dim"></i>' +
    '<i class="hs-alarm"></i>' +
    '<div class="hs-stage">' +
    '<i class="hs-loot"></i>' +
    '<svg class="hs-door" viewBox="0 0 100 100" fill="none">' +
    '<circle cx="50" cy="50" r="46" stroke="currentColor" stroke-width="2.4" opacity="0.5"/>' +
    '<g class="hs-face">' +
    '<circle cx="50" cy="50" r="41" fill="#17130d" stroke="currentColor" stroke-width="2.2"/>' +
    bolts +
    '<g class="hs-wheel">' +
    '<circle cx="50" cy="50" r="13" stroke="currentColor" stroke-width="2.4"/>' +
    '<line x1="50" y1="33" x2="50" y2="67" stroke="currentColor" stroke-width="2.4"/>' +
    '<line x1="33" y1="50" x2="67" y2="50" stroke="currentColor" stroke-width="2.4"/>' +
    '<line x1="38.5" y1="38.5" x2="61.5" y2="61.5" stroke="currentColor" stroke-width="2"/>' +
    '<line x1="61.5" y1="38.5" x2="38.5" y2="61.5" stroke="currentColor" stroke-width="2"/>' +
    '<circle cx="50" cy="50" r="4" fill="currentColor"/></g></g></svg>' +
    coins +
    '<b class="hs-stamp stamp">Grand larceny</b>' +
    '</div>';
  document.body.appendChild(wrap);
  setTimeout(() => leagueToast(stamp, text), 2450);
  setTimeout(() => wrap.remove(), 4400);
}


