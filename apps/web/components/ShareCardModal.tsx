"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import type { Trade, TradeVerdict } from "@apron/cba-engine";
import { C, teamMeta } from "@/lib/league";
import { encodeTradeParam, pickShareLabel, filingNo, type DecodedPick } from "@/lib/trade-share";
import { shortPlayerName } from "@/lib/names";
import qrcode from "qrcode-generator";
import { TradeDocket, buildDocket, buildChecks } from "@/components/TradeDocket";
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
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
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
  // Links land on the FULL offseason page (the board decodes ?t=, pops this
  // card, and closing it leaves the visitor in the real sim, not a bare
  // trade machine). /trade?t= still works and redirects here for old links.
  const shareUrl = `${typeof window === "undefined" ? "https://overtheapron.com" : window.location.origin}/?t=${encodeURIComponent(token)}`;

  // Stories can't carry links — the QR is the link. Low ECC keeps the module
  // count down so long trade tokens stay scannable at story size.
  const qrDataUrl = useMemo(() => {
    try {
      const qr = qrcode(0, "L");
      qr.addData(shareUrl);
      qr.make();
      return qr.createDataURL(4, 2);
    } catch {
      return null;
    }
  }, [shareUrl]);

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

  // The receipt — same builder as the pinned docket, so no drift.
  const checks = buildChecks({
    legal,
    involved,
    tpeUse: trade.tpeUse,
    violationReasons: verdict.violations.map((v) => v.reason),
    extraViolations,
    hasPicks: picks.length > 0,
  });

  const docketTeams = useMemo(
    () =>
      buildDocket(
        trade.players,
        Object.fromEntries(picks.map((p) => [p.id, { from: p.from, to: p.to }])),
        verdict.teams,
        nameOf,
        salaryOf,
        trade.tpeUse,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trade, picks, verdict],
  );

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
      // Capture at the format's true size regardless of screen width, so a
      // phone still downloads a real 1080-wide square/story.
      const captureWidth = format === "square" ? "520px" : format === "story" ? "380px" : undefined;
      // The +N-more budgets keep posters on-frame; if a big multi-team deal
      // still beats them (3 teams overflow the square), grow the canvas —
      // overflow:hidden here would silently crop rows off the ruling.
      const overflows = node.scrollHeight > node.clientHeight + 2;
      const url = await Promise.race([
        toPng(node, {
          pixelRatio: 2,
          style: {
            overflow: overflows ? "visible" : "hidden",
            maxHeight: "none",
            ...(captureWidth
              ? {
                  width: captureWidth,
                  maxWidth: captureWidth,
                  ...(overflows
                    ? { height: "auto", aspectRatio: "auto" }
                    : { aspectRatio: format === "square" ? "1 / 1" : "9 / 16" }),
                }
              : {}),
          },
        }),
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

  const shareStory = async () => {
    track("share_story");
    setFormat("story");
    // Let the story frame (and its QR) render before capturing.
    await new Promise((r) => setTimeout(r, 450));
    const node = cardRef.current;
    if (!node) return;
    setDownloading(true);
    node.classList.add("capture");
    try {
      const overflows = node.scrollHeight > node.clientHeight + 2;
      const dataUrl = await toPng(node, {
        pixelRatio: 3,
        style: {
          overflow: overflows ? "visible" : "hidden",
          maxHeight: "none",
          width: "380px",
          maxWidth: "380px",
          ...(overflows ? { height: "auto", aspectRatio: "auto" } : { aspectRatio: "9 / 16" }),
        },
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "over-the-apron-story.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "over-the-apron-story.png";
        a.click();
      }
    } catch {
      /* user closed the share sheet — not an error */
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
    const names = players.map((p) => (lastNames ? shortPlayerName(p.name) : p.name));
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
              ? "mx-auto w-full max-w-[520px] sm:aspect-square"
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

          {/* verdict header: document row on feed, poster stamp on 1:1/9:16 */}
          {format === "feed" ? (
            <div className="flex items-center justify-between gap-3 px-5 pt-4">
              <div className="flex items-center gap-2">
                {involved.map((t, i) => (
                  <span key={t.teamId} className="flex items-center gap-2">
                    {i > 0 && <span className="text-[var(--muted)]">⇄</span>}
                    <TeamLogo id={t.teamId} size={26} />
                  </span>
                ))}
              </div>
              <span className="stamp stamp-in text-[15px]" style={{ color }}>
                {legal ? "Legal trade" : "Blocked"}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-5 pt-5">
              <div className="flex items-center gap-2.5">
                {involved.map((t, i) => (
                  <span key={t.teamId} className="flex items-center gap-2.5">
                    {i > 0 && <span className="text-[15px] text-[var(--muted)]">⇄</span>}
                    <TeamLogo id={t.teamId} size={32} />
                  </span>
                ))}
              </div>
              <span
                className={`stamp stamp-in ${format === "story" ? "text-[23px]" : "text-[20px]"}`}
                style={{ color, transform: "rotate(-2deg)" }}
              >
                {legal ? "Legal trade" : "Blocked"}
              </span>
            </div>
          )}

          <div className={format === "feed" ? "" : "flex flex-1 flex-col justify-center"}>
          {/* the deal — the same docket the boards pin, stacked card-style */}
          <div className="px-5 pb-1 pt-4">
            <TradeDocket
              teams={docketTeams}
              stack
              maxLines={format === "feed" ? 5 : format === "story" ? (involved.length > 2 ? 3 : 4) : (involved.length > 2 ? 2 : 3)}
            />
          </div>

          {/* the receipt */}
          <div className="px-5 pb-4 pt-3">
            <div className="label mb-1.5">{legal ? "Why it works" : "Why it doesn't"}</div>
            <ul className="space-y-1.5">
              {/* Posters must FIT the frame: fewer lines, clamped text. */}
              {checks
                .slice(0, format === "feed" ? 6 : format === "story" && involved.length <= 2 ? 2 : 1)
                .map((c, i) => (
                  <li key={i} className="flex gap-2 text-[12.5px] leading-snug">
                    <span className="shrink-0 font-bold" style={{ color: c.ok ? "var(--tier-below_cap)" : "var(--tier-second_apron)" }}>
                      {c.ok ? "✓" : "✗"}
                    </span>
                    <span className={format === "feed" ? "" : "line-clamp-2"}>{c.text}</span>
                  </li>
                ))}
            </ul>
            {!legal && firstFix && format === "feed" && (
              <p className="mt-2.5 border-t border-dashed border-[var(--border)] pt-2 text-[11.5px] leading-snug text-[var(--muted)]">
                <span className="font-semibold text-[var(--accent-ink)]">One route to legal:</span> {firstFix}
              </p>
            )}
          </div>
          </div>

          {/* the seal: verdict + provenance on EVERY card, then the invitation */}
          <div className={`tear mt-auto items-center justify-between px-5 py-2.5 text-[10.5px] text-[var(--muted)] ${format === "feed" ? "flex" : "hidden"}`}>
            <span className="tabular uppercase tracking-[0.08em]">
              Filed {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {filingNo(token)}
            </span>
            <span className="tabular font-semibold uppercase tracking-[0.08em]" style={{ color }}>
              {legal ? "Legal under the 2023 CBA" : "Blocked under the 2023 CBA"}
            </span>
          </div>
          <div className={`flex items-center bg-[var(--text)] px-5 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--bg)] ${format === "feed" ? "justify-center" : "mt-auto"} ${format === "story" && qrDataUrl ? "justify-between gap-3" : "justify-center"}`}>
            <span>{format === "feed" ? "Full trade + ruling at overtheapron.com" : `${legal ? "Legal" : "Blocked"} — full ruling at overtheapron.com`}</span>
            {format === "story" && qrDataUrl && (
              <span className="my-0.5 shrink-0 overflow-hidden rounded-[4px] bg-white p-0.5" title="Scan to open this exact trade">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="QR code — opens this trade" className="block h-14 w-14" />
              </span>
            )}
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
          {canNativeShare && (
            <button onClick={shareStory} disabled={downloading} className="rounded-md bg-[var(--text)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)] hover:opacity-90 disabled:opacity-60">
              Add to story
            </button>
          )}
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
