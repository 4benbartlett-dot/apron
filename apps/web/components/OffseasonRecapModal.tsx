"use client";

import { useEffect, useMemo, useState } from "react";
import { teamMeta, type Move } from "@/lib/league";
import { TeamLogo } from "@/components/TeamLogo";
import { track } from "@/lib/analytics";

/** Short badge + accent for each move kind, shown down the ledger. */
const KIND: Record<Move["kind"], { label: string; color: string }> = {
  trade: { label: "Trade", color: "var(--accent)" },
  sign: { label: "Signing", color: "var(--tier-below_cap)" },
  sign_trade: { label: "S&T", color: "var(--accent)" },
  renounce: { label: "Renounce", color: "var(--muted)" },
  extend: { label: "Extension", color: "var(--tier-below_cap)" },
  waive: { label: "Waive", color: "var(--tier-second_apron)" },
};

/** Every team touched by a move — for the logo strip / featured headline. */
function teamsFromMoves(moves: Move[]): string[] {
  const seen = new Set<string>();
  for (const m of moves) {
    if (m.kind === "trade") {
      m.players.forEach((p) => seen.add(p.to));
      m.picks?.forEach((p) => { if (p.from) seen.add(p.from); seen.add(p.to); });
      m.pickSwaps?.forEach((s) => { seen.add(s.favoredTo); seen.add(s.otherTeam); });
    } else if (m.kind === "sign") seen.add(m.teamId);
    else if (m.kind === "sign_trade") { seen.add(m.toTeam); if (m.fromTeam) seen.add(m.fromTeam); }
    else if (m.kind === "renounce") seen.add(m.team);
  }
  return [...seen];
}

/** The team that comes out ahead most often (acquiring destination) — used to
 * personalize the headline when one front office clearly drove the summer. */
function featuredTeam(moves: Move[]): string | null {
  const tally = new Map<string, number>();
  const bump = (t?: string) => t && tally.set(t, (tally.get(t) ?? 0) + 1);
  for (const m of moves) {
    if (m.kind === "sign") bump(m.teamId);
    else if (m.kind === "sign_trade") bump(m.toTeam);
    else if (m.kind === "trade") m.players.forEach((p) => bump(p.to));
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [t, n] of tally) if (n > bestN) { best = t; bestN = n; }
  // Only feature a team if it drove a real plurality of the activity.
  return best && bestN >= Math.max(2, Math.ceil(moves.length * 0.4)) ? best : null;
}

/** The offseason "ledger" card. Two voices, same card:
 *  - visitor (default): greets someone who opened a shared link (?gm=) — the
 *    moves are already staged behind it, closing drops them into the live sim.
 *  - owner: opened from the moves footer mid-session to review (and share)
 *    your own offseason so far. */
export function OffseasonRecapModal({
  moves,
  teams,
  onClose,
  onShare,
  owner = false,
}: {
  moves: Move[];
  teams: string[];
  onClose: () => void;
  onShare: () => void;
  owner?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    track(owner ? "offseason_recap_open" : "offseason_link_open", { moves: moves.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const logoTeams = useMemo(() => {
    const list = teams.length ? teams : teamsFromMoves(moves);
    return list.slice(0, 8);
  }, [teams, moves]);
  const featured = useMemo(() => featuredTeam(moves), [moves]);
  // Possessive that survives non-plural nicknames: Warriors’ but Heat’s.
  const featuredName = featured ? teamMeta(featured).name : null;
  const headline = featuredName
    ? `${featuredName}${featuredName.endsWith("s") ? "’" : "’s"} offseason`
    : owner
      ? "Your offseason on the books"
      : "An offseason on the books";

  const copyLink = () => {
    onShare();
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,29,19,0.45)] p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div className="modal-in relative flex max-h-full w-full max-w-xl flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex max-h-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-[0_24px_64px_rgba(33,29,19,0.35)]">
          {/* masthead — matches the trade card */}
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
            <div className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 64 64" aria-hidden>
                <rect width="64" height="64" rx="14" fill="var(--text)" />
                <line x1="11" y1="41" x2="53" y2="41" stroke="var(--accent)" strokeWidth="4.5" strokeDasharray="7.5 6" strokeLinecap="round" />
                <path d="M13 54 C 20 25, 37 14, 50 22" fill="none" stroke="var(--bg)" strokeWidth="5" strokeLinecap="round" />
                <circle cx="50.5" cy="21.5" r="6.5" fill="var(--bg)" />
              </svg>
              <span className="text-[13px] font-bold tracking-tight">Over the Apron</span>
            </div>
            <span className="label">overtheapron.com</span>
          </div>

          {/* header: what you're looking at */}
          <div className="flex items-center justify-between gap-3 px-5 pt-4">
            <div className="min-w-0">
              <div className="label mb-1">Offseason ledger</div>
              <h2 className="truncate text-[19px] font-bold leading-tight">{headline}</h2>
            </div>
            <span className="stamp stamp-in shrink-0 text-[15px]" style={{ color: "var(--accent-ink)" }}>
              {moves.length} {moves.length === 1 ? "move" : "moves"}
            </span>
          </div>

          {logoTeams.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 px-5 pt-3">
              {logoTeams.map((t) => (
                <TeamLogo key={t} id={t} size={22} />
              ))}
            </div>
          )}

          {/* the moves, numbered like a transaction log */}
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-5">
            <ol className="space-y-1">
              {moves.map((m, i) => (
                <li key={i} className="flex items-center gap-2.5 rounded-md bg-[var(--panel-2)] px-3 py-1.5 text-[12.5px]">
                  <span className="tabular w-5 shrink-0 text-right text-[var(--muted)]">{i + 1}</span>
                  <span
                    className="shrink-0 rounded-[3px] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.06em]"
                    style={{ color: KIND[m.kind].color, border: `1px solid ${KIND[m.kind].color}` }}
                  >
                    {KIND[m.kind].label}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{m.label}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* seal */}
          <div className="tear mt-3 flex items-center justify-between px-5 py-2.5 text-[10.5px] text-[var(--muted)]">
            <span className="tabular uppercase tracking-[0.08em]">
              {moves.length} {moves.length === 1 ? "transaction" : "transactions"} on file
            </span>
            <span className="tabular font-semibold uppercase tracking-[0.08em] text-[var(--accent-ink)]">
              {owner ? "Your offseason" : "Shared offseason"}
            </span>
          </div>
          <div className="flex items-center justify-center bg-[var(--text)] px-5 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--bg)]">
            {owner ? "One link rebuilds it all — share your offseason" : "Open on the live board — tweak, extend, or fork it"}
          </div>
        </div>

        {/* actions */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={onClose}
            className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-xs font-bold text-[var(--bg)] shadow-sm hover:opacity-90"
          >
            {owner ? "Back to the board →" : "Explore in the sim →"}
          </button>
          <button
            onClick={copyLink}
            className="rounded-md border border-[var(--border-strong)] bg-[var(--panel)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--text)]"
          >
            {copied ? "Copied ✓" : owner ? "Copy share link" : "Copy link"}
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] leading-snug text-[#f4f1e9]/60">
          {owner
            ? "The link rebuilds this exact offseason for anyone who opens it."
            : "Every move is already staged on the board behind this card."}
        </p>
      </div>
    </div>
  );
}
