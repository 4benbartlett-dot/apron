"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Holds a LOOPING animation at its first frame until the reader can actually
 * see it, then lets it run from the top.
 *
 * The guide's demos are `infinite` loops on 6–7s cycles, and they start at page
 * load. On a wide screen the demo sits beside the text it explains, so it is on
 * screen the whole time and this costs nothing. On a phone the same grid stacks
 * — text first, demo underneath — so by the time you scroll down, the loop has
 * been running unwatched for ten or twenty seconds and you are as likely to
 * arrive during its dead air as during the part that demonstrates anything. The
 * animation was never broken on mobile; it was just over before anyone looked.
 *
 * Same progressive-enhancement contract as {@link Reveal}: with no JS the loops
 * run exactly as before, and anything already on screen at mount is left alone
 * rather than being restarted under the reader.
 */
export function PlayWhenSeen({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reduced motion already freezes these in globals.css — don't fight it.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already visible? Let it play; restarting it would be the jarring thing.
    if (el.getBoundingClientRect().top <= window.innerHeight * 0.9) return;

    setHeld(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setHeld(false);
          io.disconnect();
        }
      },
      // Enough of the card on screen that the performance isn't half off the edge.
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`${held ? "anim-hold" : ""} ${className}`}>
      {children}
    </div>
  );
}
