"use client";

import { useEffect, useRef, useState } from "react";

/** PHX easter egg — when a team's own-firsts shelf is mostly bare, a
 * tumbleweed rolls through the row. Rolls once, the first time the shelf is
 * actually on screen (checked on mount and on scroll/resize — no
 * IntersectionObserver, which some embedded webviews never deliver). Under
 * reduced motion it just sits parked at the end of the row.
 * The row it lives in must be `position: relative`. */
export function Tumbleweed() {
  const ref = useRef<HTMLSpanElement>(null);
  const [rolling, setRolling] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (!vh) return;
      const r = el.getBoundingClientRect();
      if (r.top >= vh - 24 || r.bottom <= 0) return;
      // Measure the runway at roll time so the weed crosses the whole row.
      const runway = (el.parentElement?.clientWidth ?? 500) - 18;
      el.style.setProperty("--egg-runway", `${runway}px`);
      setRolling(true);
      stop();
    };
    const stop = () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check, { passive: true });
    check();
    return stop;
  }, []);
  return (
    <span
      ref={ref}
      aria-hidden
      title="No first-round picks on file."
      className={`egg-tumbleweed ${rolling ? "egg-rolling" : ""}`}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <circle cx="12" cy="12" r="8.6" opacity="0.45" />
        <path
          d="M5.5 8.5 C 10 4.5, 15.5 5.5, 18.5 10 M4.8 14.5 C 9 18.5, 15 19, 19.4 13.5 M8.5 4.5 C 6.5 9, 7.5 15.5, 11.5 19.5 M15.5 4.6 C 17.6 9, 17 15.6, 13 19.4 M6.5 6.5 L 17.5 17.5 M17.5 7 L 7 17"
          opacity="0.75"
        />
      </svg>
    </span>
  );
}
