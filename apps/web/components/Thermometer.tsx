import type { ApronTier, LeagueConstants } from "@apron/cba-engine";
import { classifyTier } from "@apron/cba-engine";
import { tierColor } from "@/lib/format";
import { Term } from "@/components/Term";
import type { TermKey } from "@/lib/glossary";

const TICK_TERM: Record<string, TermKey> = {
  Cap: "cap",
  Tax: "tax",
  "1A": "first_apron",
  "2A": "second_apron",
};

interface Props {
  salary: number;
  c: LeagueConstants;
  /** Free-agent cap holds, drawn as a hatched extension of the bar. Holds
   * consume cap room (they sit in Team Salary, Art. VII §4(a)(2)) but NOT
   * tax/apron standing (Apron Team Salary subtracts them, §2(e)(1)(iv)) —
   * so the SOLID bar is what the Tax/1A/2A ticks judge, and solid + hatch
   * is what the Cap tick judges. One bar, both truths. */
  holds?: number;
  /** Optional second marker (e.g. projected post-trade salary). */
  ghost?: number;
  showLabels?: boolean;
  height?: number;
}

export function Thermometer({
  salary,
  c,
  holds = 0,
  ghost,
  showLabels = true,
  height = 10,
}: Props) {
  const maxScale = c.secondApron * 1.07;
  const pctN = (v: number) => Math.max(0, Math.min(100, (v / maxScale) * 100));
  const pct = (v: number) => `${pctN(v)}%`;
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
        className="relative w-full overflow-hidden rounded-[3px] border border-[var(--border)]"
        style={{ height, background: "var(--panel-2)" }}
      >
        <div
          className="absolute left-0 top-0 h-full transition-all"
          style={{ width: pct(salary), background: tierColor(tier), opacity: 0.85 }}
        />
        {holds > 0 && (
          <div
            className="absolute top-0 h-full transition-all"
            style={{
              left: pct(salary),
              width: `${Math.max(0, pctN(salary + holds) - pctN(salary))}%`,
              background:
                "repeating-linear-gradient(135deg, var(--border-strong) 0 3px, transparent 3px 6px)",
              opacity: 0.75,
            }}
            title="Free-agent cap holds — they consume cap room, but not tax or apron standing"
          />
        )}
        {ghost !== undefined && ghost !== salary && (
          <div
            className="absolute top-0 h-full w-[2px]"
            style={{ left: pct(ghost), background: "var(--text)", opacity: 0.8 }}
            title="post-trade"
          />
        )}
        {ticks.map((t) => (
          <div
            key={t.label}
            className="absolute top-0 h-full w-px"
            style={{ left: pct(t.v), background: "var(--border-strong)" }}
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
              <Term k={TICK_TERM[t.label] ?? "cap"}>{t.label}</Term>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
