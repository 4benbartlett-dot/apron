import type { ApronTier } from "@apron/cba-engine";
import { TIER_LABEL, tierBadgeStyle } from "@/lib/format";

export function TierBadge({ tier }: { tier: ApronTier }) {
  return (
    <span
      className="inline-flex items-center rounded-[4px] border px-1.5 py-[3px] text-[10px] font-semibold uppercase leading-none tracking-[0.07em]"
      style={tierBadgeStyle(tier)}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}
