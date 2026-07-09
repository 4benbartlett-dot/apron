"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";

/** Logo micro-idles — one bespoke hover animation per franchise, always on
 * the REAL logo art. Two layers, zero redrawing:
 *  - motion: transform/filter keyframes on the actual <img>
 *  - light:  an overlay alpha-masked BY the logo file itself
 *    (mask-image: url(/logos/ID.png)), so glints and color sweeps travel
 *    strictly inside the logo's own silhouette
 * A few teams add a physical grace note (HOU thruster, UTA eighth-note,
 * GSW/ORL sparks, MIN howl ring, IND speed lines) rendered AROUND the art.
 * Hover to play; tap on touch; `flourish` plays once on mount (team pages).
 * All of it is inert under prefers-reduced-motion and during card capture. */

interface Recipe {
  /** keyframe/style suffix — .li-<fx> in globals.css */
  fx: string;
  /** team primary / secondary, drives glow + sweep colors */
  a: string;
  b: string;
  extra?: "thruster" | "note" | "sparks" | "ring" | "lines";
}

const RECIPES: Record<string, Recipe> = {
  ATL: { fx: "hawk", a: "#e03a3e", b: "#c1d32f" }, // banks like a hawk in a turn
  BKN: { fx: "swish", a: "#4a4a4a", b: "#ffffff" }, // drops through the net, snaps it
  BOS: { fx: "jig", a: "#007a33", b: "#ba9653" }, // two-step, gold watch glint
  CHA: { fx: "buzz", a: "#00788c", b: "#1d1160" }, // hornet-wing vibration
  CHI: { fx: "charge", a: "#ce1141", b: "#414042" }, // lowers the horns, charges
  CLE: { fx: "glint", a: "#860038", b: "#fdbb30" }, // gold blade catch
  DAL: { fx: "rear", a: "#00538c", b: "#b8c4ca" }, // horse rears, settles
  DEN: { fx: "summit", a: "#0e2240", b: "#fec524" }, // sunrise climbs the peak
  DET: { fx: "rev", a: "#c8102e", b: "#1d42ba" }, // torque twist off the line
  GSW: { fx: "lightyears", a: "#1d428a", b: "#ffc72c", extra: "sparks" }, // starfield twinkle
  HOU: { fx: "liftoff", a: "#ce1141", b: "#c4ced4", extra: "thruster" }, // 4px of thrust
  IND: { fx: "dash", a: "#002d62", b: "#fdbb30", extra: "lines" }, // hits the gas
  LAC: { fx: "ballmer", a: "#c8102e", b: "#1d428a" }, // one over-caffeinated double bounce
  LAL: { fx: "showtime", a: "#552583", b: "#fdb927" }, // slow gold shimmer, very rich
  MEM: { fx: "grit", a: "#5d76a9", b: "#12173f" }, // low heavy growl-shake
  MIA: { fx: "gutter", a: "#98002e", b: "#f9a01b" }, // the flame is alive while hovered
  MIL: { fx: "toss", a: "#00471b", b: "#eee1c6" }, // proud antler toss
  MIN: { fx: "howl", a: "#0c2340", b: "#78be20", extra: "ring" }, // nose up, howl ring
  NOP: { fx: "wing", a: "#0c2340", b: "#85714d" }, // wing stretch
  NYK: { fx: "marquee", a: "#f58426", b: "#006bb6" }, // Broadway double sweep
  OKC: { fx: "thunder", a: "#007ac1", b: "#ef3b24" }, // lightning flash + clap
  ORL: { fx: "pixie", a: "#0077c0", b: "#c4ced4", extra: "sparks" }, // pixie dust
  PHI: { fx: "bell", a: "#006bb6", b: "#ed174c" }, // liberty bell pendulum
  PHX: { fx: "flare", a: "#e56020", b: "#f9a01b" }, // solar corona bloom
  POR: { fx: "pinwheel", a: "#e03a3e", b: "#8d9093" }, // the logo IS a pinwheel — half turn
  SAC: { fx: "gleam", a: "#5a2d81", b: "#c0c4c8" }, // one royal crown glint
  SAS: { fx: "rowel", a: "#c4ced4", b: "#8a8d90" }, // spur rowel spin-wiggle
  TOR: { fx: "claw", a: "#ce1141", b: "#a1a1a4" }, // three-streak claw swipe
  UTA: { fx: "bob", a: "#002b5c", b: "#f9a01b", extra: "note" }, // syncopated two-beat bob
  WAS: { fx: "oath", a: "#e31837", b: "#002b5c" }, // stars-and-stripes sweep
};

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
  const playOnce = (delay = 0, hold = 1500) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPlay(true);
      timer.current = setTimeout(() => setPlay(false), hold);
    }, delay);
  };
  useEffect(() => {
    if (flourish) playOnce(400, 1600);
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
      onTouchStart={() => playOnce(0, 1400)}
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
      {r.extra === "thruster" && <span className="li-fx li-thruster" aria-hidden />}
      {r.extra === "note" && (
        <span className="li-fx li-note" aria-hidden>
          ♪
        </span>
      )}
      {r.extra === "sparks" && (
        <span className="li-fx li-sparks" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      )}
      {r.extra === "ring" && <span className="li-fx li-ring" aria-hidden />}
      {r.extra === "lines" && (
        <span className="li-fx li-lines" aria-hidden>
          <i />
          <i />
        </span>
      )}
    </span>
  );
}
