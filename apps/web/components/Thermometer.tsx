"use client";

import { useState } from "react";
import type { ApronTier, LeagueConstants } from "@apron/cba-engine";
import { classifyTier } from "@apron/cba-engine";
import { tierColor, fmtM } from "@/lib/format";
import { Term } from "@/components/Term";
import type { TermKey } from "@/lib/glossary";

const TICK_TERM: Record<string, TermKey> = {
  Cap: "cap",
  Tax: "tax",
  "1A": "first_apron",
  "2A": "second_apron",
};

/** What each tier MEANS for this team, in one sentence — glossary-grade. */
const TIER_NOTE: Record<ApronTier, string> = {
  below_cap:
    "Under the cap: it can sign outside free agents straight into room and keeps the Room MLE.",
  over_cap:
    "Over the cap, under the tax: signings go through exceptions (Bird rights, the MLE, minimums), with full expanded trade matching available.",
  taxpayer:
    "Over the tax line: the owner pays an escalating tax on the overage, and the full MLE gives way to the smaller Taxpayer MLE.",
  first_apron:
    "Over the first apron: trade matching drops to 100%-only, no acquiring players via sign-and-trade, and no waiver-market signings above the NT-MLE.",
  second_apron:
    "Over the second apron: no aggregating salaries in trades, no sending cash, no MLE at all, and the first-round pick seven drafts out can be frozen.",
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
  // Tap a segment and the bar explains itself — what that slice of money IS,
  // which lines it counts against, and what that means for this team.
  const [info, setInfo] = useState<null | "salary" | "holds">(null);
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

  // Each label is centred on its own tick, but the tax line and the first apron
  // sit close enough in dollars that at phone width "Tax" and "1A" run into each
  // other — measured at 375px: 11.2px of clearance where they need 16.6px. Only
  // the pairs that actually collide are spread, by half the shortfall each, so a
  // label never drifts more than a couple of px off the line it names. Derived
  // from the tick values rather than hardcoded, so it still holds when next
  // season's cap moves the lines around.
  const labelNudge = (() => {
    const NARROW = 309; // the constrained case; harmless once there is more room
    const est = (s: string) => s.length * 5.6 + 1; // ~9px text
    const off = ticks.map(() => 0);
    for (let i = 1; i < ticks.length; i++) {
      const gap =
        (pctN(ticks[i]!.v) / 100) * NARROW + off[i]! -
        ((pctN(ticks[i - 1]!.v) / 100) * NARROW + off[i - 1]!);
      const need = est(ticks[i - 1]!.label) / 2 + est(ticks[i]!.label) / 2 + 4;
      if (gap < need) {
        const push = (need - gap) / 2;
        off[i - 1]! -= push;
        off[i]! += push;
      }
    }
    return off;
  })();

  const vs = (line: number, v: number) =>
    v >= line ? `${fmtM(v - line)} over` : `${fmtM(line - v)} under`;
  const roomAfterHolds = c.salaryCap - salary - holds;

  return (
    <div className="w-full">
      <div
        className="relative w-full overflow-hidden rounded-[3px] border border-[var(--border)]"
        style={{ height, background: "var(--panel-2)" }}
      >
        <button
          type="button"
          aria-label={`Signed team salary ${fmtM(salary)} — tap to explain what it counts against`}
          title="Signed salary — tap to explain"
          onClick={() => setInfo(info === "salary" ? null : "salary")}
          className="absolute left-0 top-0 h-full cursor-pointer transition-all"
          style={{ width: pct(salary), background: tierColor(tier), opacity: 0.85 }}
        />
        {holds > 0 && (
          <button
            type="button"
            aria-label={`Free-agent cap holds ${fmtM(holds)} — tap to explain what they count against`}
            title="Free-agent cap holds — tap to explain"
            onClick={() => setInfo(info === "holds" ? null : "holds")}
            className="absolute top-0 h-full cursor-pointer transition-all"
            style={{
              left: pct(salary),
              width: `${Math.max(0, pctN(salary + holds) - pctN(salary))}%`,
              background:
                "repeating-linear-gradient(135deg, var(--border-strong) 0 3px, transparent 3px 6px)",
              opacity: 0.75,
            }}
          />
        )}
        {ghost !== undefined && ghost !== salary && (
          <div
            className="pointer-events-none absolute top-0 h-full w-[2px]"
            style={{ left: pct(ghost), background: "var(--text)", opacity: 0.8 }}
            title="post-trade"
          />
        )}
        {ticks.map((t) => (
          <div
            key={t.label}
            className="pointer-events-none absolute top-0 h-full w-px"
            style={{ left: pct(t.v), background: "var(--border-strong)" }}
          />
        ))}
      </div>
      {showLabels && (
        <div className="relative mt-1 h-3 w-full">
          {ticks.map((t, i) => (
            <span
              key={t.label}
              className="absolute -translate-x-1/2 text-[9px] text-[var(--muted)]"
              style={{ left: pct(t.v), marginLeft: labelNudge[i] ? `${labelNudge[i]!.toFixed(1)}px` : undefined }}
            >
              <Term k={TICK_TERM[t.label] ?? "cap"}>{t.label}</Term>
            </span>
          ))}
        </div>
      )}

      {info === "salary" && (
        <div className="fade-up relative mt-2 rounded-md border border-[var(--border)] bg-[var(--panel-2)]/70 p-3 text-[11.5px] leading-snug">
          <button
            onClick={() => setInfo(null)}
            aria-label="Close"
            className="absolute right-2 top-1.5 text-[var(--muted)] hover:text-[var(--text)]"
          >
            ✕
          </button>
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: tierColor(tier) }} />
            <span className="font-semibold">Signed salary — {fmtM(salary)}</span>
          </div>
          <p>
            The solid bar is money on contracts. It — not the holds — is what the{" "}
            <Term k="tax">Tax</Term>, <Term k="first_apron">1A</Term> and <Term k="second_apron">2A</Term> ticks
            judge: Apron Team Salary counts signed salary and sets free-agent holds aside.
          </p>
          <p className="tabular mt-1.5 text-[var(--muted)]">
            vs Tax: {vs(c.luxuryTaxLine, salary)} · vs 1A: {vs(c.firstApron, salary)} · vs 2A: {vs(c.secondApron, salary)}
            {holds > 0 && <> · vs Cap (holds in): {vs(c.salaryCap, salary + holds)}</>}
          </p>
          <p className="mt-1.5">{TIER_NOTE[tier]}</p>
          <p className="mt-1.5 text-[10px] tracking-[0.05em] text-[var(--muted)]">
            2023 CBA · Art. VII §2, §2(e)(1)(iv)
          </p>
        </div>
      )}
      {info === "holds" && (
        <div className="fade-up relative mt-2 rounded-md border border-[var(--border)] bg-[var(--panel-2)]/70 p-3 text-[11.5px] leading-snug">
          <button
            onClick={() => setInfo(null)}
            aria-label="Close"
            className="absolute right-2 top-1.5 text-[var(--muted)] hover:text-[var(--text)]"
          >
            ✕
          </button>
          <div className="mb-1 flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-[2px]"
              style={{ background: "repeating-linear-gradient(135deg, var(--border-strong) 0 2px, transparent 2px 4px)" }}
            />
            <span className="font-semibold">Free-agent cap holds — {fmtM(holds)}</span>
          </div>
          <p>
            The hatched stretch is <Term k="cap_hold">cap holds</Term>: placeholder charges for this team&rsquo;s own
            free agents (a multiple of last season&rsquo;s salary, by Bird class). Each one stays on the books until
            the player re-signs, is renounced, or signs elsewhere — so a team can&rsquo;t spend &ldquo;his&rdquo; room
            and still keep his <Term k="bird">Bird rights</Term>.
          </p>
          <p className="tabular mt-1.5 text-[var(--muted)]">
            {roomAfterHolds > 0
              ? `Cap room with holds in: ${fmtM(roomAfterHolds)}`
              : `Holds leave no cap room — ${fmtM(-roomAfterHolds)} past the cap with them in`}
            {" · "}signed salary alone vs Cap: {vs(c.salaryCap, salary)}
          </p>
          <p className="mt-1.5">
            Holds consume <em>cap room only</em>. They never count toward tax or apron standing — the solid bar alone
            faces those ticks. Renouncing a hold frees the room instantly, but forfeits that player&rsquo;s Bird
            rights.
          </p>
          <p className="mt-1.5 text-[10px] tracking-[0.05em] text-[var(--muted)]">
            2023 CBA · Art. VII §4(a)(2), §2(e)(1)(iv), §6(b)
          </p>
        </div>
      )}
    </div>
  );
}
