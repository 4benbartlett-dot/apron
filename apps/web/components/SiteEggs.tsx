"use client";

import { useEffect } from "react";

/** A paper-slip toast from the league office. */
export function leagueToast(stamp: string, text: string, tone: "green" | "red" = "green") {
  if (typeof document === "undefined") return;
  document.querySelector(".egg-toast")?.remove();
  const el = document.createElement("div");
  el.className = "egg-toast";
  const color = tone === "green" ? "var(--tier-below_cap)" : "var(--tier-second_apron)";
  const safe = (t: string) => t.replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[ch]!);
  el.innerHTML = `<span class="stamp" style="color:${color}">${safe(stamp)}</span><span>${safe(text)}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2900);
}

/** Type a name, get a reply — anywhere, including search boxes. Matched
 * against the tail of the letters typed since the last non-letter key —
 * none of these words occur as the tail of real typing, so no false fires. */
const WORD_EGGS: Record<string, [string, string, "green" | "red"]> = {
  stepien: ["Denied", "The league office would like a word before you finish that thought, Ted.", "red"],
  woj: ["Filed", "He would have reported it before you finished typing.", "green"],
  shams: ["Filed", "He had the terms before you hit the S.", "green"],
  tank: ["Noticed", "The floor is 90% of the cap. The league office sees you.", "red"],
  godmode: ["Denied", "There is no god mode here. There is only the collective bargaining agreement.", "red"],
  cba: ["Filed", "You're in the right place.", "green"],
};

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
    let letters = "";
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const inField =
        !!target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable);
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      // Word eggs listen everywhere — search boxes are where people try them.
      if (/^[a-z]$/.test(k)) {
        letters = (letters + k).slice(-12);
        for (const [word, [stamp, text, tone]] of Object.entries(WORD_EGGS)) {
          if (letters.endsWith(word)) {
            letters = "";
            leagueToast(stamp, text, tone);
            break;
          }
        }
      } else {
        letters = "";
      }

      // The commissioner's code only works outside form fields.
      if (inField) return;
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
