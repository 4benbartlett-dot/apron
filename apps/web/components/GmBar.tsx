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
import { leagueToast } from "@/components/SiteEggs";
import { OffseasonRecapModal } from "@/components/OffseasonRecapModal";

/** Board teams (for the ledger card's logo strip), straight from storage. */
function boardTeams(): string[] {
  try {
    const b = JSON.parse(localStorage.getItem("apron_board_v1") || "[]");
    return Array.isArray(b) ? b.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function GmBar() {
  const moves = useMoves();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  // Board snapshot taken when the ledger card opens (null = closed).
  const [recapTeams, setRecapTeams] = useState<string[] | null>(null);
  useEffect(() => {
    hydrateMoves();
  }, []);
  if (!moves.length) return null;

  const buildShareUrl = () => {
    const b = boardTeams();
    return `${window.location.origin}/?gm=${encodeMoves()}${b.length ? `&board=${b.join(",")}` : ""}`;
  };

  const shareOffseason = async () => {
    try {
      await navigator.clipboard.writeText(buildShareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const openRecap = () => setRecapTeams(boardTeams());

  return (
    <>
    <div className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--panel)]/95 backdrop-blur">
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
      {/* The whole bar is the door to the offseason ledger card — the explicit
          buttons stopPropagation so their actions don't also open it. */}
      <div
        role="button"
        tabIndex={0}
        onClick={openRecap}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openRecap();
          }
        }}
        title="Your offseason ledger — every move on file"
        className="mx-auto flex max-w-7xl cursor-pointer items-center gap-3 overflow-x-auto px-4 py-2.5 transition-colors hover:bg-[var(--panel-2)]/60 sm:px-5"
      >
        <span className="label shrink-0 rounded-[4px] bg-[var(--text)] px-1.5 py-1 !text-[var(--bg)]">
          {moves.length >= 8 ? "Busy summer" : "Your moves"}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="tabular shrink-0 text-sm font-semibold hover:text-[var(--accent)]"
          title="Show all moves"
        >
          <span key={moves.length} className="count-pop">{moves.length}</span> {open ? "▾" : "▸"}
        </button>
        <div className="min-w-0 flex-1 truncate text-xs text-[var(--muted)]">
          {moves
            .slice(-3)
            .map((m) => m.label)
            .join("  ·  ")}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            void shareOffseason();
          }}
          title="Copy a link that reloads your entire offseason — every move, on the live board"
          className="group shrink-0 rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-xs font-bold text-[var(--bg)] shadow-sm transition-transform hover:opacity-90 active:scale-[0.97]"
        >
          {copied ? (
            "Copied ✓"
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="transition-transform group-hover:-translate-y-px group-hover:translate-x-px">↗</span>
              Share offseason
            </span>
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            undoMove();
          }}
          className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1 text-xs font-semibold hover:bg-[var(--panel-2)]"
        >
          Undo
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            resetMoves();
            leagueToast("Struck", "Front-office memory wiped — the next GM inherits a clean ledger.");
          }}
          className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--tier-second_apron)] hover:bg-[var(--panel-2)]"
        >
          Reset
        </button>
      </div>
    </div>
    {/* Sibling of the bar, NOT a child: the bar's backdrop-blur makes it a
        containing block, which would trap the modal's fixed inset-0 inside
        the strip instead of the viewport. */}
    {recapTeams && (
      <OffseasonRecapModal
        owner
        moves={moves}
        teams={recapTeams}
        onClose={() => setRecapTeams(null)}
        onShare={() => {
          void navigator.clipboard.writeText(buildShareUrl()).catch(() => {});
        }}
      />
    )}
    </>
  );
}
