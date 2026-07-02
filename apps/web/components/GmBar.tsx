"use client";

import { useEffect, useState } from "react";
import {
  useMoves,
  undoMove,
  resetMoves,
  removeMoveAt,
  hydrateMoves,
  encodeMoves,
} from "@/lib/store";

export function GmBar() {
  const moves = useMoves();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    hydrateMoves();
  }, []);
  if (!moves.length) return null;

  const shareOffseason = async () => {
    let boardParam = "";
    try {
      const b = JSON.parse(localStorage.getItem("apron_board_v1") || "[]");
      if (Array.isArray(b) && b.length) boardParam = `&board=${b.join(",")}`;
    } catch {
      /* ignore */
    }
    const url = `${window.location.origin}/?gm=${encodeMoves()}${boardParam}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--panel)]/95 backdrop-blur">
      {open && (
        <div className="mx-auto max-h-64 max-w-7xl overflow-y-auto px-5 pt-3">
          {moves.map((m, i) => (
            <div key={i} className="mb-1 flex items-center justify-between gap-2 rounded-md bg-[var(--panel-2)] px-3 py-1.5 text-xs">
              <span className="min-w-0 truncate">
                <span className="tabular mr-1.5 text-[var(--muted)]">{i + 1}.</span>
                {m.label}
              </span>
              <button
                onClick={() => removeMoveAt(i)}
                title="Remove this move"
                className="shrink-0 text-[var(--muted)] hover:text-[var(--tier-second_apron)]"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mx-auto flex max-w-7xl items-center gap-3 overflow-x-auto px-4 py-2.5 sm:px-5">
        <span className="label shrink-0 rounded-[4px] bg-[var(--text)] px-1.5 py-1 !text-[var(--bg)]">
          Your moves
        </span>
        <button
          onClick={() => setOpen((o) => !o)}
          className="tabular shrink-0 text-sm font-semibold hover:text-[var(--accent)]"
          title="Show all moves"
        >
          {moves.length} {open ? "▾" : "▸"}
        </button>
        <div className="min-w-0 flex-1 truncate text-xs text-[var(--muted)]">
          {moves
            .slice(-3)
            .map((m) => m.label)
            .join("  ·  ")}
        </div>
        <button
          onClick={shareOffseason}
          className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1 text-xs font-semibold hover:bg-[var(--panel-2)]"
        >
          {copied ? "Copied ✓" : "Share offseason"}
        </button>
        <button
          onClick={undoMove}
          className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1 text-xs font-semibold hover:bg-[var(--panel-2)]"
        >
          Undo
        </button>
        <button
          onClick={resetMoves}
          className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--tier-second_apron)] hover:bg-[var(--panel-2)]"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
