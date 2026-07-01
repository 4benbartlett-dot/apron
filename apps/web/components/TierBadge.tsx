import type { ApronTier } from "@apron/cba-engine";
import { TIER_LABEL, tierBadgeStyle } from "@/lib/format";

export function TierBadge({ tier }: { tier: ApronTier }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={tierBadgeStyle(tier)}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}
