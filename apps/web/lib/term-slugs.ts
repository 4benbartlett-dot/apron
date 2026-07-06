import type { TermKey } from "@/lib/glossary";

/** Glossary keys that have a full /terms explainer page. Kept as a tiny
 * standalone map so client components can link out without pulling the whole
 * SEO data module (and its contract tables) into their bundle. A test pins
 * this map to SEO_TERMS so the two can't drift. */
export const TERM_SLUGS: Partial<Record<TermKey, string>> = {
  first_apron: "first-apron",
  second_apron: "second-apron",
  matching: "salary-matching",
  tpe: "traded-player-exception",
  picks: "stepien-rule",
  ntmle: "mid-level-exception",
  room_mle: "room-mid-level-exception",
  bae: "bi-annual-exception",
  bird: "bird-rights",
  cap_room: "cap-space",
  hard_cap: "hard-cap",
  cap_hold: "cap-hold",
  minimum: "minimum-contract",
};
