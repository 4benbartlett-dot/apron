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
