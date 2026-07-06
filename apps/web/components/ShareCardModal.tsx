"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { matchRuleLabel, classifyTier, type Trade, type TradeVerdict } from "@apron/cba-engine";
import { C, teamMeta, feedStateOf } from "@/lib/league";
import { encodeTradeParam, pickShareLabel, filingNo, type DecodedPick } from "@/lib/trade-share";
import { explainBlocked } from "@/lib/tradeFix";
import { fmtM } from "@/lib/format";
import { TeamLogo } from "@/components/TeamLogo";
import { TierBadge } from "@/components/TierBadge";
import { track } from "@/lib/analytics";

interface PlayerLine {
  name: string;
  salary: number;
}

/** Social-card view of a staged trade: the verdict, the deal, and the rules
 * it passes or breaks — built to be screenshot-ready and easy to read. */
export function ShareCardModal({
  trade,
  picks,
  verdict,
  extraViolations,
  holdsOf,
  nameOf,
  salaryOf,
  onClose,
}: {
  trade: Trade;
  picks: DecodedPick[];
  verdict: TradeVerdict;
  extraViolations: string[];
  holdsOf?: (team: string) => number;
  nameOf: (id: string) => string;
  salaryOf: (id: string) => number;
  onClose: () => void;
}) {
  const legal = verdict.legal && extraViolations.length === 0;
  const color = legal ? "var(--tier-below_cap)" : "var(--tier-second_apron)";
  const [copied, setCopied] = useState(false);
  const [copiedVerdict, setCopiedVerdict] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [urlFallback, setUrlFallback] = useState(false);
  // Card formats: feed = X timeline, square = 1:1, story = 9:16 screenshots.
  const [format, setFormat] = useState<"feed" | "square" | "story">("feed");
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    track("share_open", { result: legal ? "legal" : "blocked" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const token = useMemo(
    () => encodeTradeParam(trade.teams, trade.players, picks),
    [trade, picks],
  );
  const shareUrl = `${typeof window === "undefined" ? "https://overtheapron.com" : window.location.origin}/trade?t=${encodeURIComponent(token)}`;

  // Teams actually involved in the deal (sending or receiving something).
  const involved = verdict.teams.filter(
    (t) =>
      trade.players.some((p) => p.from === t.teamId || p.to === t.teamId) ||
      picks.some((p) => p.from === t.teamId || p.to === t.teamId),
  );

  const linesFor = (teamId: string, dir: "in" | "out") => {
    const players: PlayerLine[] = trade.players
      .filter((p) => (dir === "in" ? p.to : p.from) === teamId)
      .map((p) => ({ name: nameOf(p.playerId), salary: salaryOf(p.playerId) }));
    const pickLabels = picks
      .filter((p) => (dir === "in" ? p.to : p.from) === teamId)
      .map((p) => pickShareLabel(p.id));
    return { players, pickLabels };
  };

  const firstFix = legal ? null : explainBlocked(verdict, extraViolations, C, holdsOf).fixes[0] ?? null;

  // The receipt: every rule the deal passes, or every reason it fails.
  const checks: { ok: boolean; text: string }[] = legal
    ? [
        ...involved
          // Only claim a matching rule when salary actually needed matching —
          // a leg fully absorbed by a TPE is legal for a different reason.
          .filter((t) => t.incomingSalary - (t.tpeAbsorbed ?? 0) > 0)
          .map((t) => ({
            ok: true,
            text: `${t.teamId} takes back ${fmtM(t.incomingSalary)} against ${fmtM(t.outgoingSalary)} out — legal under ${matchRuleLabel(t.matchingRule, C)}`,
          })),
        ...involved
          .filter((t) => (t.tpeAbsorbed ?? 0) > 0)
          .map((t) => {
            const use = trade.tpeUse?.[t.teamId];
            const label = use?.label ? `the ${use.label}` : "a traded-player exception";
            const kind = use ? (use.preExisting ? "pre-existing" : "created this offseason") : undefined;
            return {
              ok: true,
              text: `${t.teamId} absorbs ${fmtM(t.tpeAbsorbed!)} into ${label}${kind ? ` (${kind})` : ""} — no matching needed for that salary`,
            };
          }),
        // Row F consequence: spending a PRE-EXISTING TPE freezes the 1st apron.
        ...involved
          .filter((t) => (t.tpeAbsorbed ?? 0) > 0 && trade.tpeUse?.[t.teamId]?.preExisting)
          .map((t) => ({
            ok: true,
            text: `${t.teamId} used a pre-existing TPE — hard-capped at the first apron (${fmtM(C.firstApron)}) for the rest of the season`,
          })),
        // Real-July hard caps the deal respects — named so readers can check.
        ...involved
          .filter((t) => t.incomingSalary > 0 && Number.isFinite(feedStateOf(t.teamId).hardCap))
          .map((t) => {
            const fs = feedStateOf(t.teamId);
            return {
              ok: true,
              text: `${t.teamId} stays ${fmtM(fs.hardCap - t.postTradeSalary)} under the hard cap from its real July moves${fs.hardCapSource ? ` (${fs.hardCapSource})` : ""}`,
            };
          }),
        ...involved
          .filter((t) => classifyTier(t.postTradeSalary, C) === "second_apron")
          .map((t) => ({
            ok: true,
            text: `${t.teamId} finishes over the second apron — no aggregation or cash used, as required`,
          })),
        ...(picks.length
          ? [{ ok: true, text: "Stepien rule satisfied — no team left without firsts in consecutive future drafts" }]
          : []),
      ]
    : [
        ...verdict.violations.map((v) => ({ ok: false, text: v.reason })),
        ...extraViolations.map((text) => ({ ok: false, text })),
      ];

  const copyLink = async () => {
    track("share_copy");
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Twitter/IG in-app browsers block the clipboard API — show the URL
      // in a select-all input instead of failing silently.
      setUrlFallback(true);
    }
  };

  // The quotable one-liner — verdict, controlling rule, link. Written the way
  // a reporter would paste it: no emoji, no slogans.
  const verdictLine = legal
    ? `Legal under the 2023 CBA — ${checks.find((c) => c.ok)?.text ?? "passes every rule"}.`
    : `Blocked under the 2023 CBA — ${checks.find((c) => !c.ok)?.text ?? "fails a rule"}`;
  const copyVerdict = async () => {
    track("share_copy_verdict");
    const text = `${verdictLine}\n${shareUrl}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedVerdict(true);
      setTimeout(() => setCopiedVerdict(false), 1600);
    } catch {
      setUrlFallback(true);
    }
  };

  // Renders THE CARD ITSELF (exactly what's on screen) to a PNG. Falls back
  // to the server-rendered OG card if in-browser rendering stalls.
  const downloadImage = async () => {
    const node = cardRef.current;
    if (!node) return;
    track("share_download");
    setDownloading(true);
    const name = `over-the-apron-${format}-${legal ? "legal" : "blocked"}-${involved.map((t) => t.teamId).join("-")}.png`;
    const save = (href: string) => {
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.click();
    };
    node.classList.add("capture");
    try {
      const url = await Promise.race([
        toPng(node, { pixelRatio: 2, style: { maxHeight: "none", overflow: "visible" } }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("capture timeout")), 10_000)),
      ]);
      save(url);
    } catch {
      const res = await fetch(`/api/og?t=${encodeURIComponent(token)}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      save(url);
      URL.revokeObjectURL(url);
    } finally {
      node.classList.remove("capture");
      setDownloading(false);
    }
  };

  // The prefilled tweet reads like a transaction note, not ad copy: full
  // names, plain verdict. People add their own take on top.
  const receiving = involved.filter(
    (t) => linesFor(t.teamId, "in").players.length > 0 || linesFor(t.teamId, "in").pickLabels.length > 0,
  );
  const haulFor = (teamId: string, lastNames = false) => {
    const { players, pickLabels } = linesFor(teamId, "in");
    const names = players.map((p) => (lastNames ? p.name.split(" ").slice(-1)[0]! : p.name));
    return [...names, ...pickLabels].join(", ") || "—";
  };
  const buildTweet = (lastNames: boolean) =>
    [
      ...receiving.map((t) => `${t.teamId} get ${haulFor(t.teamId, lastNames)}`),
      "",
      legal ? "Legal under the 2023 CBA." : "Blocked under the 2023 CBA.",
    ].join("\n");
  // X counts the appended link as ~24 chars; keep full names unless they blow
  // the 280 budget, then fall back to last names.
  const tweetText = buildTweet(false).length <= 250 ? buildTweet(false) : buildTweet(true);
  const tweetHref = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`;

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-center justify-center bg-[rgba(33,29,19,0.45)] p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="modal-in flex max-h-full w-full max-w-xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* the card */}
        <div
          ref={cardRef}
          className={`relative flex flex-col overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-[0_24px_64px_rgba(33,29,19,0.35)] ${
            format === "square"
              ? "mx-auto aspect-square w-full max-w-[520px]"
              : format === "story"
                ? "mx-auto aspect-[9/16] w-full max-w-[380px]"
                : ""
          }`}
        >
          {/* masthead */}
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

          {/* verdict stamp */}
          <div className="flex items-center justify-between gap-3 px-5 pt-4">
            <div className="flex items-center gap-2">
              {involved.map((t, i) => (
                <span key={t.teamId} className="flex items-center gap-2">
                  {i > 0 && <span className="text-[var(--muted)]">⇄</span>}
                  <TeamLogo id={t.teamId} size={26} />
                </span>
              ))}
            </div>
            <span
              className="stamp stamp-in text-[15px]"
              style={{ color }}
            >
              {legal ? "Legal trade" : "Blocked"}
            </span>
          </div>

          {/* the deal */}
          <div className="space-y-2.5 px-5 pb-1 pt-4">
            {involved.map((t) => {
              const inn = linesFor(t.teamId, "in");
              const out = linesFor(t.teamId, "out");
              return (
                <div key={t.teamId} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)]">
                  <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--panel-2)]/50 px-3.5 py-2">
                    <span className="flex items-center gap-2 text-[13px] font-semibold">
                      <TeamLogo id={t.teamId} size={18} />
                      {teamMeta(t.teamId).name}
                    </span>
                    <TierBadge tier={t.postTradeTier} />
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-[var(--border)] text-xs">
                    {(["in", "out"] as const).map((dir) => {
                      const { players, pickLabels } = dir === "in" ? inn : out;
                      return (
                        <div key={dir} className="px-3.5 py-2.5">
                          <div className="label !text-[9px]">
                            {dir === "in" ? `Gets · ${fmtM(t.incomingSalary)}` : `Sends · ${fmtM(t.outgoingSalary)}`}
                          </div>
                          <div className="mt-1 space-y-0.5">
                            {players.map((p) => (
                              <div key={p.name} className="flex items-baseline justify-between gap-2">
                                <span className="truncate">{p.name}</span>
                                <span className="tabular shrink-0 text-[var(--muted)]">{fmtM(p.salary)}</span>
                              </div>
                            ))}
                            {pickLabels.map((l) => (
                              <div key={l} className="tabular font-medium text-[var(--accent-ink)]">{l}</div>
                            ))}
                            {players.length === 0 && pickLabels.length === 0 && (
                              <span className="text-[var(--muted)]">—</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* the receipt */}
          <div className="px-5 pb-4 pt-3">
            <div className="label mb-1.5">{legal ? "Why it works" : "Why it doesn't"}</div>
            <ul className="space-y-1.5">
              {checks.slice(0, 6).map((c, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] leading-snug">
                  <span className="shrink-0 font-bold" style={{ color: c.ok ? "var(--tier-below_cap)" : "var(--tier-second_apron)" }}>
                    {c.ok ? "✓" : "✗"}
                  </span>
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
            {!legal && firstFix && (
              <p className="mt-2.5 border-t border-dashed border-[var(--border)] pt-2 text-[11.5px] leading-snug text-[var(--muted)]">
                <span className="font-semibold text-[var(--accent-ink)]">One route to legal:</span> {firstFix}
              </p>
            )}
          </div>

          {/* the seal: verdict + provenance on EVERY card, then the invitation */}
          <div className="tear mt-auto flex items-center justify-between px-5 py-2.5 text-[10.5px] text-[var(--muted)]">
            <span className="tabular uppercase tracking-[0.08em]">
              Filed {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {filingNo(token)}
            </span>
            <span className="tabular font-semibold uppercase tracking-[0.08em]" style={{ color }}>
              {legal ? "Legal under the 2023 CBA" : "Blocked under the 2023 CBA"}
            </span>
          </div>
          <div className="flex items-center justify-between bg-[var(--text)] px-5 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--bg)]">
            <span>overtheapron.com</span>
            <span>Try this trade →</span>
          </div>
        </div>

        {/* format picker: same ruling, four frames */}
        <div className="mt-3 flex items-center justify-center gap-1">
          {(
            [
              ["feed", "Feed"],
              ["square", "Square"],
              ["story", "9:16"],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              onClick={() => { setFormat(f); track("share_format", { format: f }); }}
              className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                format === f
                  ? "bg-[var(--panel)] text-[var(--text)] shadow-[inset_0_0_0_1px_var(--border-strong)]"
                  : "text-[#f4f1e9]/70 hover:text-[#f4f1e9]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {urlFallback && (
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.target.select()}
            className="mt-2 w-full rounded-md border border-[var(--border-strong)] bg-[var(--panel)] px-2.5 py-1.5 text-[11px]"
            aria-label="Share link — copy manually"
          />
        )}

        {/* actions */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <button onClick={copyLink} className="rounded-md border border-[var(--border-strong)] bg-[var(--panel)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--text)]">
            {copied ? "Copied ✓" : "Copy link"}
          </button>
          <button onClick={copyVerdict} className="rounded-md border border-[var(--border-strong)] bg-[var(--panel)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--text)]" title="Copy the one-line ruling + link">
            {copiedVerdict ? "Copied ✓" : "Copy verdict"}
          </button>
          <button onClick={downloadImage} disabled={downloading} className="rounded-md border border-[var(--border-strong)] bg-[var(--panel)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--text)] disabled:opacity-60">
            {downloading ? "Rendering…" : "Download image"}
          </button>
          <a href={tweetHref} target="_blank" rel="noopener noreferrer" onClick={() => track("share_tweet")} className="rounded-md bg-[var(--text)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)] hover:opacity-90">
            Post on 𝕏
          </a>
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#f4f1e9]/85 hover:text-[#f4f1e9]">
            Close
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] leading-snug text-[#f4f1e9]/60">
          The link rebuilds this exact trade on live rosters — it doesn&rsquo;t carry the rest of your session.
        </p>
      </div>
    </div>
  );
}
