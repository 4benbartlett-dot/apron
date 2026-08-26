import type { ApronTier } from "@apron/cba-engine";

export function fmtM(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${(Math.abs(n) / 1_000_000).toFixed(1)}M`;
}

export function fmtFull(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export const TIER_LABEL: Record<ApronTier, string> = {
  below_cap: "Under cap",
  over_cap: "Over cap",
  taxpayer: "Luxury tax",
  first_apron: "First apron",
  second_apron: "Second apron",
};

/** CSS var color per tier (matches globals.css). */
export function tierColor(tier: ApronTier): string {
  return `var(--tier-${tier})`;
}

/** Tailwind-ish badge classes per tier. */
export function tierBadgeStyle(tier: ApronTier): React.CSSProperties {
  return {
    color: tierColor(tier),
    borderColor: tierColor(tier),
    backgroundColor: "color-mix(in srgb, " + tierColor(tier) + " 12%, transparent)",
  };
}

/**
 * A hard cap's cause, written the way you'd say it.
 *
 * feed-team-state stores these as compact internal labels — "De'Anthony Melton
 * Taxpayer MLE", "Rui Hachimura NT-MLE", "Peyton Watson sign-and-trade
 * acquisition" — and they were being printed straight onto team pages and
 * search results. "NT-MLE" is an acronym a reader has no way to expand, and the
 * whole string reads like two database columns stuck together.
 */
export function hardCapCause(source: string | undefined): string | undefined {
  if (!source) return undefined;
  // Drop the bookkeeping parenthetical: whether the exception was spent in full
  // or in part changes nothing about why the cap exists.
  const s = source.replace(/\s*\((full|partial|split)\)\s*$/i, "").trim();

  const snt = s.match(/^(.*?)\s+sign-and-trade(?:\s+acquisition)?$/i);
  if (snt) return `the ${snt[1]} sign-and-trade`;

  const mle = s.match(/^(.*?)\s+(NT-MLE|Non-Tax(?:payer)? MLE|Taxpayer MLE)$/i);
  if (mle) {
    const who = mle[1]!;
    const kind = /^taxpayer/i.test(mle[2]!) ? "taxpayer" : "non-taxpayer";
    // "Hayes + Okogie's mid-level" doesn't work; two players share one exception.
    if (who.includes("+")) return `the ${who} ${kind} mid-level`;
    return `${who}${who.endsWith("s") ? "’" : "’s"} ${kind} mid-level`;
  }
  return s;
}
