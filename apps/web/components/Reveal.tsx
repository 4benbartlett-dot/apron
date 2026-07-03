"use client";

import { useEffect, useRef, useState } from "react";

/** Scroll-triggered entrance, progressive-enhancement style: content is
 * visible by default (no JS, no flash of blank paper); after hydration,
 * sections still below the fold are hidden and rise in as they enter. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"static" | "hidden" | "in">("static");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Only animate what the reader hasn't seen yet.
    if (el.getBoundingClientRect().top <= window.innerHeight * 0.92) return;
    setState("hidden");
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setState("in");
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${state === "hidden" ? "reveal" : state === "in" ? "reveal in-view" : ""} ${className}`}
      style={state === "in" ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
