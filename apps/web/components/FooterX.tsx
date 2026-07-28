"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

const HANDLE = "overtheapron";
const PROFILE = `https://x.com/${HANDLE}`;

/** The slice of X's widget API we actually call. Typed locally rather than
 * augmenting Window, so a blocked script is just an undefined lookup. */
type Twttr = {
  widgets?: {
    createTimeline?: (
      source: { sourceType: "profile"; screenName: string },
      target: HTMLElement,
      options?: Record<string, unknown>,
    ) => Promise<HTMLElement | undefined>;
  };
};

const twttr = () => (window as unknown as { twttr?: Twttr }).twttr;

/**
 * The site's X timeline, footer-sized and deliberately cheap.
 *
 * This sits in the root layout, so it renders on every page — three rules keep
 * that honest. It's lazy: platform.twitter.com isn't requested at all until the
 * reader actually scrolls near the footer. It's fixed-height: the box reserves
 * its space in the server HTML, so the widget landing (or never landing) can't
 * shift the page. And it degrades: the styled profile link is the base layer,
 * painted first and always correct, with the timeline covering it only once X
 * resolves a real iframe. Blocked script, offline, or a widget failure leaves a
 * working link rather than a blank rectangle.
 */
export function FooterX() {
  const boxRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  /** Reader reached the footer — only now is X's script worth fetching. */
  const [near, setNear] = useState(false);
  /** X returned a real timeline iframe. Until then the link stays on top. */
  const [loaded, setLoaded] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;

    // The site themes off prefers-color-scheme alone (no toggle, no stored
    // preference), so the widget reads the same media query the CSS does.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const onTheme = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", onTheme);

    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      mq.removeEventListener("change", onTheme);
    };
  }, []);

  useEffect(() => {
    if (!near) return;
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;

    // X resolves createTimeline with undefined when it refuses the timeline,
    // and can hand back a frame that is still empty at resolve time. Only
    // retire the link once a real, measurable timeline is actually on screen —
    // otherwise the "embed" is the blank box this component exists to avoid.
    const confirm = (el: HTMLElement | undefined, attempt = 0) => {
      if (cancelled) return;
      if (!el) return setLoaded(false);
      if (el.getBoundingClientRect().height > 80) return setLoaded(true);
      if (attempt < 6) window.setTimeout(() => confirm(el, attempt + 1), 500);
      else setLoaded(false);
    };

    const build = () => {
      const create = twttr()?.widgets?.createTimeline;
      if (!create) return false;
      mount.replaceChildren();
      create(
        { sourceType: "profile", screenName: HANDLE },
        mount,
        {
          theme: dark ? "dark" : "light",
          // Transparent chrome lets the paper/ink panel behind it show through,
          // so the embed reads as part of the cap sheet in both themes.
          chrome: "noheader nofooter noborders transparent",
          height: 248,
          dnt: true,
        },
      )
        .then((el) => confirm(el))
        .catch(() => {
          if (!cancelled) setLoaded(false);
        });
      return true;
    };

    // lazyOnload means the script may still be in flight. Poll briefly, then
    // stop asking — a blocked platform.twitter.com just leaves the link up.
    if (build()) return () => { cancelled = true; };
    let tries = 0;
    const id = window.setInterval(() => {
      if (cancelled || build() || ++tries > 40) window.clearInterval(id);
    }, 250);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [near, dark]);

  return (
    <div ref={boxRef} className="w-full shrink-0 md:w-[300px]">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="label">Follow along</span>
        <a
          href={PROFILE}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-[var(--border-strong)] underline-offset-2 hover:text-[var(--text)]"
        >
          @{HANDLE}
        </a>
      </div>

      <div className="panel relative h-[248px] overflow-hidden">
        {/* Base layer. Server-rendered, needs no JS, and stays put unless a
            real timeline lands on top of it. */}
        <a
          href={PROFILE}
          target="_blank"
          rel="noopener noreferrer"
          aria-hidden={loaded || undefined}
          tabIndex={loaded ? -1 : undefined}
          className={`absolute inset-0 flex flex-col justify-center gap-1.5 p-4 transition-opacity hover:bg-[var(--panel-2)]/40 ${
            loaded ? "pointer-events-none opacity-0" : ""
          }`}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden className="text-[var(--text)]">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span className="text-[13px] font-semibold text-[var(--text)]">@{HANDLE} on X</span>
          <span className="leading-relaxed">
            Rule verdicts, cap-sheet oddities, and notes when the data refreshes.
          </span>
          <span className="font-semibold text-[var(--accent-ink)]">Open on X →</span>
        </a>

        <div
          ref={mountRef}
          className={`h-full overflow-y-auto ${loaded ? "" : "pointer-events-none opacity-0"}`}
        />
      </div>

      {near ? (
        <Script id="x-widgets" src="https://platform.twitter.com/widgets.js" strategy="lazyOnload" />
      ) : null}
    </div>
  );
}
