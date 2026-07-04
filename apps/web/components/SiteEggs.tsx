"use client";

import { useEffect } from "react";

const KONAMI = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight",
  "b", "a",
];

/** The quiet stuff: a console signature for anyone who opens the inspector,
 * a title that pauses the front office when you tab away, and the Konami
 * code — which gets any trade vetoed for basketball reasons. */
export function SiteEggs() {
  // Console signature.
  useEffect(() => {
    try {
      console.log(
        "%c   ●\n  ╱        OVER THE APRON\n ╱         the offseason, under the real CBA\n╺ ╺ ╺ ╺\n\n" +
          "Every verdict cites the rule. See exactly what's enforced —\n" +
          "and what's approximate — at overtheapron.com/accuracy.\n" +
          "Catch something wrong? Say so. It becomes a permanent test.",
        "color:#b4501e; font-family:ui-monospace,monospace; line-height:1.5;",
      );
    } catch {
      /* ignore */
    }
  }, []);

  // Tab away → the front office goes on hold. The real title is captured at
  // hide time (not mount time) so client-side navigation keeps working.
  useEffect(() => {
    let prev: string | null = null;
    const onVis = () => {
      if (document.hidden) {
        prev = document.title;
        document.title = "Front office on hold — Over the Apron";
      } else if (prev !== null) {
        document.title = prev;
        prev = null;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (document.hidden && prev !== null) document.title = prev;
    };
  }, []);

  // ↑↑↓↓←→←→BA — vetoed, for basketball reasons.
  useEffect(() => {
    const veto = () => {
      if (document.querySelector(".veto-overlay")) return;
      const el = document.createElement("div");
      el.className = "veto-overlay";
      el.innerHTML =
        '<div class="veto-inner"><span class="stamp veto-stamp">Vetoed</span>' +
        '<div class="veto-sub">basketball reasons · office of the commissioner</div></div>';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    };
    // Sliding buffer instead of an index machine: correct for every overlap
    // (Up-Up-Up-Down… still fires — key repeat happens to real people).
    const buf: string[] = [];
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.isComposing) return;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      buf.push(k);
      if (buf.length > KONAMI.length) buf.shift();
      if (buf.length === KONAMI.length && buf.every((x, j) => x === KONAMI[j])) {
        buf.length = 0;
        veto();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}
