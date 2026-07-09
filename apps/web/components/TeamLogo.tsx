"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";

/** Logo micro-idles — one bespoke, city-specific animation per franchise,
 * always on the REAL logo art. Three layers, zero redrawing:
 *  - motion: transform/filter keyframes on the actual <img>
 *  - light:  an overlay alpha-masked BY the logo file itself
 *    (mask-image: url(/logos/ID.png)), so glints and sweeps live strictly
 *    inside the logo's own silhouette
 *  - grace notes: physical props staged around (or clipped inside) the art —
 *    steam off the bull's nostrils, a headlight crossing the actual Bay
 *    Bridge span, cherry blossoms over the Wizards mark, a chalk toss under
 *    the Cavs C, marquee bulbs chasing around the Knicks ball...
 * Deliberately unhurried: most scenes run 1.4–2.4s. Hover to play; tap on
 * touch; `flourish` plays once on mount (team-page header). Everything is
 * inert under prefers-reduced-motion and stripped during card capture. */

interface Extra {
  /** plain particle nodes (<i>) — puffs, petals, bulbs, drops, streaks */
  i?: number;
  /** larger shape nodes (<b>) — cones, clouds, ribbons, beam columns */
  b?: number;
  /** inline SVG prop (drawn strokes) */
  svg?: "bolt" | "antlers";
  /** text content per <i> (musical notes, spur rowel) */
  text?: string[];
}

interface Recipe {
  /** keyframe/style suffix — .li-<fx> in globals.css */
  fx: string;
  /** team primary / secondary, drives glow + sweep + prop colors */
  a: string;
  b: string;
  extra?: Extra;
}

const RECIPES: Record<string, Recipe> = {
  // hawk banks into a turn, two feathers flutter down in its wake
  ATL: { fx: "hawk", a: "#e03a3e", b: "#c1d32f", extra: { i: 2 } },
  // a passing B train: twin headlight streaks behind the mark, low rumble
  BKN: { fx: "subway", a: "#4a4a4a", b: "#ffffff", extra: { i: 2 } },
  // the leprechaun's two-step; pipe smoke curls off the upper corner
  BOS: { fx: "jig", a: "#007a33", b: "#ba9653", extra: { i: 3 } },
  // wing-buzz vibration while a lone hornet orbits the nest once
  CHA: { fx: "buzz", a: "#00788c", b: "#1d1160", extra: { i: 1 } },
  // steam snorts from the nostrils… then the charge
  CHI: { fx: "charge", a: "#ce1141", b: "#414042", extra: { i: 2 } },
  // the chalk toss: a white cloud bursts under the C and hangs in the air
  CLE: { fx: "chalk", a: "#860038", b: "#fdbb30", extra: { i: 5 } },
  // the horse rears in kicked-up dust; one lone star winks after it settles
  DAL: { fx: "rear", a: "#00538c", b: "#b8c4ca", extra: { i: 3, b: 1 } },
  // sunrise climbs the peak, snowcaps glint, a cloud drifts behind the summit
  DEN: { fx: "summit", a: "#0e2240", b: "#fec524", extra: { i: 2, b: 1 } },
  // Motor City rev: torque twist with three exhaust puffs out the back
  DET: { fx: "rev", a: "#c8102e", b: "#1d42ba", extra: { i: 3 } },
  // a headlight crosses the ACTUAL bridge span — the moving light is clipped
  // by the logo's own alpha, so it only exists on the bridge art
  GSW: { fx: "bridge", a: "#1d428a", b: "#ffc72c", extra: { i: 1 } },
  // full launch: slow 8px climb on a burning cone, smoke drifting below
  HOU: { fx: "liftoff", a: "#ce1141", b: "#c4ced4", extra: { i: 3, b: 1 } },
  // Brickyard: checkered flag waves at the line while speed lines trail
  IND: { fx: "dash", a: "#002d62", b: "#fdbb30", extra: { i: 2, b: 1 } },
  // the over-caffeinated double bounce, sweat flying off both corners
  LAC: { fx: "ballmer", a: "#c8102e", b: "#1d428a", extra: { i: 4 } },
  // premiere night: two searchlights cross behind the mark, gold sweep inside
  LAL: { fx: "showtime", a: "#552583", b: "#fdb927", extra: { b: 2 } },
  // heavy growl-shake; grinder sparks spray off the bottom edge
  MEM: { fx: "grit", a: "#5d76a9", b: "#12173f", extra: { i: 5 } },
  // the flame is ALIVE while hovered — gutter, glow, heat-haze rising
  MIA: { fx: "gutter", a: "#98002e", b: "#f9a01b", extra: { i: 3 } },
  // antlers grow in behind the deer head, hold proud, fade
  MIL: { fx: "toss", a: "#00471b", b: "#eee1c6", extra: { svg: "antlers" } },
  // nose to the sky: two howl rings ripple out under a northern-lights ribbon
  MIN: { fx: "howl", a: "#0c2340", b: "#78be20", extra: { i: 2, b: 1 } },
  // a Mardi Gras throw: beads arc over the bird in purple, green, and gold
  NOP: { fx: "wing", a: "#0c2340", b: "#85714d", extra: { i: 6 } },
  // marquee bulbs chase around the ball, Broadway style, two laps
  NYK: { fx: "marquee", a: "#f58426", b: "#006bb6", extra: { i: 8 } },
  // a bolt strikes from above — flash, clap, long rumble decay
  OKC: { fx: "thunder", a: "#007ac1", b: "#ef3b24", extra: { svg: "bolt", b: 1 } },
  // Tinker Bell pass: a pixie streaks over the mark leaving settling dust
  ORL: { fx: "pixie", a: "#0077c0", b: "#c4ced4", extra: { i: 5 } },
  // the bell tolls: slow pendulum with ring-ripples off the crown
  PHI: { fx: "bell", a: "#006bb6", b: "#ed174c", extra: { i: 2 } },
  // desert heat: corona bloom with embers floating up off the sun
  PHX: { fx: "flare", a: "#e56020", b: "#f9a01b", extra: { i: 4 } },
  // the pinwheel turns through Portland drizzle
  POR: { fx: "pinwheel", a: "#e03a3e", b: "#8d9093", extra: { i: 4 } },
  // a miniature Golden 1 beam fires straight up off the crown
  SAC: { fx: "gleam", a: "#5a2d81", b: "#c0c4c8", extra: { b: 2 } },
  // the spur's rowel spins at the heel, kicking two ticks of dust
  SAS: { fx: "rowel", a: "#c4ced4", b: "#8a8d90", extra: { i: 3, text: ["✦", "", ""] } },
  // three claw streaks rake THROUGH the art; a maple leaf flutters down after
  TOR: { fx: "claw", a: "#ce1141", b: "#a1a1a4", extra: { i: 1 } },
  // a two-beat swing riff — three notes rise off the mark in rhythm
  UTA: { fx: "bob", a: "#002b5c", b: "#f9a01b", extra: { i: 3, text: ["♪", "♫", "♪"] } },
  // D.C. in April: cherry-blossom petals drift across the monument mark
  WAS: { fx: "oath", a: "#e31837", b: "#002b5c", extra: { i: 4 } },
};

function ExtraNodes({ extra }: { extra: Extra }) {
  return (
    <span className="li-fx li-x" aria-hidden>
      {extra.svg === "bolt" && (
        <svg viewBox="0 0 24 24" className="li-svg">
          <path d="M13.5 1 L7.5 12.5 h4.2 L8.5 23 L18.5 9.5 h-5.2 L16.5 1 Z" fill="currentColor" />
        </svg>
      )}
      {extra.svg === "antlers" && (
        <svg viewBox="0 0 64 30" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="li-svg">
          <path className="li-a1" d="M23 29 C 21 19, 15 15, 11 5 M19 21 C 14 19, 10 15, 9 11 M21 25 C 16 25, 12 23, 8 19" />
          <path className="li-a2" d="M41 29 C 43 19, 49 15, 53 5 M45 21 C 50 19, 54 15, 55 11 M43 25 C 48 25, 52 23, 56 19" />
        </svg>
      )}
      {Array.from({ length: extra.b ?? 0 }, (_, k) => (
        <b key={`b${k}`} />
      ))}
      {Array.from({ length: extra.i ?? 0 }, (_, k) => (
        <i key={`i${k}`}>{extra.text?.[k] || null}</i>
      ))}
    </span>
  );
}

export function TeamLogo({
  id,
  size = 28,
  flourish = false,
}: {
  id: string;
  size?: number;
  /** Play the idle once on mount — the team-page-header welcome. */
  flourish?: boolean;
}) {
  const r = RECIPES[id];
  const [play, setPlay] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playOnce = (delay = 0, hold = 2600) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPlay(true);
      timer.current = setTimeout(() => setPlay(false), hold);
    }, delay);
  };
  useEffect(() => {
    if (flourish) playOnce(400, 2800);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flourish]);

  const img = (
    <img
      src={`/logos/${id}.png`}
      alt={id}
      width={size}
      height={size}
      className="li-img"
      style={{ objectFit: "contain", flexShrink: 0 }}
    />
  );
  if (!r) return img;

  return (
    <span
      className={`logo-idle li-${r.fx}${play ? " li-play" : ""}`}
      data-team={id}
      onTouchStart={() => playOnce(0, 2200)}
      style={
        {
          width: size,
          height: size,
          "--li-size": `${size}px`,
          "--li-a": r.a,
          "--li-b": r.b,
          "--li-mask": `url(/logos/${id}.png)`,
        } as React.CSSProperties
      }
    >
      {img}
      <span className="li-shine" aria-hidden />
      {r.extra && <ExtraNodes extra={r.extra} />}
    </span>
  );
}
