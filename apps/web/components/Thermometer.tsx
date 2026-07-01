import type { ApronTier, LeagueConstants } from "@apron/cba-engine";
import { classifyTier } from "@apron/cba-engine";
import { tierColor } from "@/lib/format";

interface Props {
  salary: number;
  c: LeagueConstants;
  /** Optional second marker (e.g. projected post-trade salary). */
  ghost?: number;
  showLabels?: boolean;
  height?: number;
}

export function Thermometer({
  salary,
  c,
  ghost,
  showLabels = true,
  height = 10,
}: Props) {
  const maxScale = c.secondApron * 1.07;
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / maxScale) * 100))}%`;
  const tier: ApronTier = classifyTier(salary, c);

  const ticks: { v: number; label: string }[] = [
    { v: c.salaryCap, label: "Cap" },
    { v: c.luxuryTaxLine, label: "Tax" },
    { v: c.firstApron, label: "1A" },
    { v: c.secondApron, label: "2A" },
  ];

  return (
    <div className="w-full">
      <div
        className="relative w-full overflow-hidden rounded-full"
        style={{ height, background: "var(--panel-2)" }}
      >
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all"
          style={{ width: pct(salary), background: tierColor(tier) }}
        />
        {ghost !== undefined && ghost !== salary && (
          <div
            className="absolute top-0 h-full w-[2px] bg-white"
            style={{ left: pct(ghost), opacity: 0.9 }}
            title="post-trade"
          />
        )}
        {ticks.map((t) => (
          <div
            key={t.label}
            className="absolute top-0 h-full w-px"
            style={{ left: pct(t.v), background: "rgba(255,255,255,0.28)" }}
          />
        ))}
      </div>
      {showLabels && (
        <div className="relative mt-1 h-3 w-full">
          {ticks.map((t) => (
            <span
              key={t.label}
              className="absolute -translate-x-1/2 text-[9px] text-[var(--muted)]"
              style={{ left: pct(t.v) }}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
