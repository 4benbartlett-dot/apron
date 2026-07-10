"use client";

import { leagueToast } from "@/components/SiteEggs";
import type { Move } from "@/lib/league";

/** Team easter eggs — design-preview tranche (branch: eggs/team-easter-eggs).
 *
 * Three eggs, three shapes:
 *  - MIA · Heat Culture   — mechanic-tied toast (fires on the minimum exception)
 *  - SAC · Light the Beam — physical board effect (fires on projection gains)
 *  - PHX · Tumbleweed     — team-page ambient scene (lives in Tumbleweed.tsx)
 *
 * Mock notes: these fire every time their trigger hits (no once-per-session
 * throttle yet — easier to demo). Production would remember benchmark-style
 * eggs in localStorage so they land once, like a real gag.
 */

const reducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** MIA — signing anyone to the MINIMUM is the most Miami transaction there is. */
export function heatCultureEgg(teamId: string, mechanismId: string | undefined | null) {
  if (teamId !== "MIA" || mechanismId !== "minimum") return;
  leagueToast("Heat culture", "He'll be in the best shape of his life by camp.", "heat");
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
  leagueToast("Filed", `That's ${firstCount} future first${firstCount === 1 ? "" : "s"}. Sam says thank you for calling.`);
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
  if (reducedMotion()) {
    leagueToast("And now…", `${playerName}. From parts elsewhere. Your newest Bull.`);
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

/** LAL — Seventeen-and-Counting. A max player arrives via trade: purple and
 * gold confetti pours over the Lakers card only, and a small pennant rises
 * to the rafters (the card's top edge). */
export function confettiEgg() {
  leagueToast("As foretold", "The Lakers always get their guy. It's in the CBA somewhere. (It isn't.)");
  if (reducedMotion()) return;
  const card = cardOf("LAL");
  if (!card || document.querySelector(".egg-confetti")) return;
  const r = card.getBoundingClientRect();
  const wrap = document.createElement("div");
  wrap.className = "egg-confetti";
  wrap.style.left = `${r.left}px`;
  wrap.style.top = `${r.top - 30}px`;
  wrap.style.width = `${r.width}px`;
  wrap.style.height = `${Math.min(r.height, 460) + 30}px`;
  wrap.style.setProperty("--fall", `${Math.min(r.height, 460)}px`);
  const colors = ["#552583", "#fdb927", "#f4f1e9"];
  let pieces = "";
  for (let i = 0; i < 60; i++) {
    const left = (i * 61) % 100;
    const delay = (i * 53) % 1100;
    const drift = ((i * 13) % 44) - 22;
    const spin = i % 2 ? 1 : -1;
    const w = 5 + (i % 3);
    const hgt = 8 + (i % 4);
    pieces += `<i style="left:${left}%;animation-delay:${delay}ms;--cfd:${drift}px;--cfs:${spin};width:${w}px;height:${hgt}px;background:${colors[i % 3]}"></i>`;
  }
  wrap.innerHTML = pieces + '<b class="cf-banner"></b>';
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 4400);
}

/** SAS — The 101st Blow. The Spurs' fifth move of the session: a hairline
 * crack draws across the card, pauses… then splits with a flash and dust
 * before healing. Persistence, rewarded — per the stonecutter. */
export function rockCrackEgg() {
  leagueToast("Pound the rock", "That was the hundred-and-first blow.");
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
  leagueToast("Stand clear", "This is a Manhattan-bound B train. The next stop is: a rebuild.");
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

/* ================= Showpieces, tranche 2 (10 more) ================= */

/** BOS — The Cigar. A Celtics move adds 3+ projected wins: parquet-angle
 * light sweeps the Garden floor (the card face) and clears, Red's victory
 * cigar settles onto the card's measured bottom-right corner, the ember
 * ignites — the toast fires on that first glow — and three smoke curls rise
 * on slow S-curves. */
export function cigarEgg() {
  const stamp = "Filed";
  const line = "Eighteen banners. Red would have liked this one.";
  if (reducedMotion()) {
    leagueToast(stamp, line);
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
    leagueToast(stamp, line);
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

/** NYK — Bing Bong. MSG marquee night: the room dims warm, 18–24 bulbs screw
 * themselves in one by one clockwise around the card's actual rounded border,
 * chase the perimeter two Broadway laps, go fully dark for one held breath —
 * then every bulb flashes twice in unison. The bing. The bong. Afterglow,
 * and the house lights come back up. The paper slip starts sliding in during
 * the dark breath so it LANDS exactly on the first unison flash, and the
 * whole marquee rides an anchor group that follows the page scroll. */
export function bingBongEgg() {
  if (reducedMotion()) {
    leagueToast("Bing bong", "The Garden approves.");
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

/** MIA — White Hot. The Heat's SECOND minimum signing of the session: the
 * culture is compounding. The air above the card shimmers first, then flame
 * tongues catch up both measured edges — deep-red core, orange mid, white
 * tips — the card's own border glows ember (chasing the flames, never
 * leading them), haze keeps rippling above the burn, and embers lift off
 * the top. Full burn holds ~2.5s (toast lands at the peak), then it dies
 * to wisps. The wrapper is absolute in page coordinates so the fire rides
 * the card through scroll. */
export function whiteHotEgg() {
  if (reducedMotion()) {
    leagueToast("White hot", "The culture is compounding.");
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
  // wrapper clamps at 460px
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

/** CLE — The Chalk Toss. A star arrives in Cleveland: the lights dip and the
 * building goes still; a soft clap at the card's bottom edge, then the chalk
 * goes UP — three big blooming puffs and a fan of fine matte grains — each on
 * its own clock, decelerating into a hang at the apex while flashbulbs pop
 * around the dark, then drifting off on the arena draft and settling back
 * onto the ledger's bottom edge. */
export function chalkTossEgg(playerName: string) {
  const stamp = "Ritual observed";
  const text = `${playerName}. The Land has its headliner.`;
  // leagueToast renders in the site toast layer (outside .egg-chalktoss), so
  // reduced-motion users still get the headline, statically.
  if (reducedMotion()) {
    leagueToast(stamp, text);
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

/** MIL — Fear the Deer. A Buck extends: antler racks draw themselves inward
 * from the card's two top corners — beams first, tines settling at their own
 * moments — hold proud while a forest dapple passes across the card face,
 * then fade like breath on glass. The toast lands a settle-beat after the
 * last tine. */
export function antlersEgg(playerName: string) {
  if (reducedMotion()) {
    leagueToast("Fear the deal", `${playerName}, extended. The herd stays together.`);
    return;
  }
  const card = cardOf("MIL");
  if (!card || document.querySelector(".egg-antlers")) return;
  const r = card.getBoundingClientRect();
  const radius = getComputedStyle(card).borderRadius || "8px";
  const w = r.width;
  const rise = 148; // headroom above the card; local y=148 IS the card's top edge
  const cardH = Math.min(r.height, 460);
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

/** DET — The Assembly Line. Any Pistons signing: a press slab exactly as
 * wide as the card descends on its hydraulic rod — engage-jerk, a breath,
 * then the committed drop — CLUNKS the card into a held squash, sprays
 * exactly three sparks off the die–card seam, brands the face with a
 * crooked "DEEE-TROIT BASKETBALL" ink stamp, and lifts. Another shift. */
export function assemblyLineEgg() {
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
  const msg = "Not just better — better in a different way entirely.";
  if (reducedMotion()) {
    leagueToast("Light-years", msg);
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
  if (reducedMotion()) {
    leagueToast("Parade route", "Throw me somethin', mister. Filed.");
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
  const card = cardOf("WAS");
  if (reducedMotion()) {
    leagueToast("In bloom", "The blossoms came early this year.");
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

// Design-preview convenience: lets the branch demo each board effect from the
// console without staging the exact trigger move. Dev builds only.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as Record<string, unknown>).__apronEggs = {
    strikeEgg,
    introEgg,
    confettiEgg,
    rockCrackEgg,
    subwayEgg,
    lightTheBeam,
    cigarEgg,
    bingBongEgg,
    whiteHotEgg,
    chalkTossEgg,
    antlersEgg,
    assemblyLineEgg,
    northernLightsEgg,
    lightYearsEgg,
    beadThrowEgg,
    blossomsEgg,
  };
}

/** SAC — THE beam. A white-hot core inside a wide violet bloom fires from the
 * Kings' board card to the top of the screen: ignition flash at the base, a
 * pool of light where it meets the sky, motes rising inside the column, the
 * room glowing faintly violet, then a power-down collapse. Only on
 * improvement, because that is the entire point of the beam. */
export function lightTheBeam() {
  leagueToast("Beam lit", "Victory-grade improvement detected in Sacramento.");
  if (reducedMotion()) return;
  const card = document.querySelector<HTMLElement>('[data-egg-team="SAC"]');
  if (!card || document.querySelector(".egg-beam2")) return;
  const r = card.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const h = Math.max(r.top + 14, 180);
  const wrap = document.createElement("div");
  wrap.className = "egg-beam2";
  wrap.style.left = `${x}px`;
  wrap.style.height = `${h}px`;
  wrap.style.setProperty("--bx", `${x}px`);
  wrap.style.setProperty("--by", `${h}px`);
  wrap.innerHTML =
    '<i class="b2-ambience"></i>' +
    '<i class="b2-glow"></i>' +
    '<i class="b2-beam"></i>' +
    '<i class="b2-core"></i>' +
    '<i class="b2-sky"></i>' +
    '<i class="b2-flash"></i>' +
    [0, 1, 2, 3, 4].map((m) => `<i class="b2-mote" style="--m:${m}"></i>`).join("");
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 4300);
}
