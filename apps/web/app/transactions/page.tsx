"use client";

import { useState } from "react";
import { TRANSACTIONS } from "@apron/data";
import { useMoves } from "@/lib/store";

const TYPE_COLOR: Record<string, string> = {
  Trade: "var(--tier-second_apron)",
  Signing: "var(--tier-below_cap)",
  "Re-sign": "var(--tier-below_cap)",
  Extension: "var(--tier-taxpayer)",
  Release: "var(--muted)",
  "Qualifying Offer": "var(--tier-over_cap)",
  Option: "var(--tier-over_cap)",
  Renounce: "var(--muted)",
  "S&T": "var(--tier-taxpayer)",
  Other: "var(--muted)",
};

const KIND_TYPE: Record<string, string> = {
  trade: "Trade",
  sign: "Signing",
  sign_trade: "S&T",
  extend: "Extension",
  renounce: "Renounce",
};

export default function TransactionsPage() {
  const moves = useMoves();
  const [includeMine, setIncludeMine] = useState(true);
  const txns = TRANSACTIONS;
  const counts = txns.reduce<Record<string, number>>((acc, t) => {
    acc[t.type] = (acc[t.type] ?? 0) + 1;
    return acc;
  }, {});
  const mine = includeMine ? [...moves].reverse() : [];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Recent Transactions</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {txns.length} reported moves — trades, signings, options, and
          qualifying offers as the 2026-27 league year opens
          {moves.length > 0 && ", with your own filings on top"}.
        </p>
        {moves.length > 0 && (
          <button
            onClick={() => setIncludeMine((v) => !v)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-ink)] hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
            aria-pressed={includeMine}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: includeMine ? "var(--accent)" : "var(--border-strong)" }}
            />
            {includeMine
              ? `Showing your ${moves.length} move${moves.length > 1 ? "s" : ""} — tap for the real world only`
              : "Real world only — tap to include your offseason"}
          </button>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([type, n]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  color: TYPE_COLOR[type] ?? "var(--muted)",
                  borderColor: TYPE_COLOR[type] ?? "var(--muted)",
                  backgroundColor: `color-mix(in srgb, ${TYPE_COLOR[type] ?? "var(--muted)"} 12%, transparent)`,
                }}
              >
                {type} {n}
              </span>
            ))}
        </div>
      </div>

      {mine.length > 0 && (
        <div className="panel mb-4 divide-y divide-[var(--border)]/50" style={{ borderLeft: "3px solid var(--accent)" }}>
          {mine.map((m, i) => {
            const type = KIND_TYPE[m.kind] ?? "Other";
            const color = TYPE_COLOR[type] ?? "var(--muted)";
            return (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                <span
                  className="mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    color,
                    borderColor: color,
                    backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                  }}
                >
                  {type}
                </span>
                <div className="min-w-0 flex-1 text-sm">{m.label}</div>
                <span className="stamp shrink-0 text-[9px] text-[var(--accent-ink)]">Yours</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="panel divide-y divide-[var(--border)]/50">
        {txns.map((t, i) => {
          const color = TYPE_COLOR[t.type] ?? "var(--muted)";
          return (
            <div key={i} className="flex items-start gap-3 px-4 py-2.5">
              <span
                className="mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{
                  color,
                  borderColor: color,
                  backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                }}
              >
                {t.type}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className="font-semibold">{t.player}</span>{" "}
                  <span className="text-[var(--muted)]">({t.pos})</span>
                </div>
                <div className="text-sm text-[var(--text)]/85">{t.detail}</div>
              </div>
              <div className="shrink-0 text-xs text-[var(--muted)]">{t.date}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
