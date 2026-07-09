"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import type { Trade, TradeVerdict } from "@apron/cba-engine";
import { C, teamMeta } from "@/lib/league";
import { encodeTradeParam, pickShareLabel, filingNo, type DecodedPick, type DecodedSwap } from "@/lib/trade-share";
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
  swaps = [],
  verdict,
  extraViolations,
  holdsOf,
  nameOf,
  salaryOf,
  onClose,
}: {
  trade: Trade;
  picks: DecodedPick[];
  swaps?: DecodedSwap[];
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
  const [downloading, setDownloading] = useState(false);
  const [urlFallback, setUrlFallback] = useState(false);
  // Stories are a phone thing — only offer the button where a native share
  // sheet exists (falls back to a PNG download if files aren't shareable).
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [storyHint, setStoryHint] = useState(false);
  const [copiedImg, setCopiedImg] = useState(false);
  // On touch devices, a pixel-true PNG of the card is laid over it so the OS
  // long-press gesture works — press and hold → Save to Photos, like any
  // image on the web.
  const [touchDevice, setTouchDevice] = useState(false);
  useEffect(
    () => setTouchDevice(typeof window !== "undefined" && (navigator.maxTouchPoints > 0 || "ontouchstart" in window)),
    [],
  );
  const [holdImg, setHoldImg] = useState<string | null>(null);
  const [canCopyImage, setCanCopyImage] = useState(false);
  useEffect(
    () => setCanCopyImage(typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write),
    [],
  );
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
    () => encodeTradeParam(trade.teams, trade.players, picks, swaps),
    [trade, picks, swaps],
  );
  // Links land on the FULL offseason page (the board decodes ?t=, pops this
  // card, and closing it leaves the visitor in the real sim, not a bare
  // trade machine). /trade?t= still works and redirects here for old links.
  const shareUrl = `${typeof window === "undefined" ? "https://overtheapron.com" : window.location.origin}/?t=${encodeURIComponent(token)}`;

  // The export is the SERVER-rendered card (Satori) — deterministic and
  // bulletproof, where html-to-image silently dropped the verdict stamp on
  // real browsers. Same card the X unfurl uses; ?fmt sizes it per format.
  const ogImageUrl = (fmt: "feed" | "square" | "story") =>
    `/api/og?t=${encodeURIComponent(token)}&fmt=${fmt}`;

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
      picks.some((p) => p.from === t.teamId || p.to === t.teamId) ||
      swaps.some((s) => s.favoredTo === t.teamId || s.otherTeam === t.teamId),
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
        swaps,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trade, picks, swaps, verdict],
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

  // Renders THE CARD ITSELF (exactly what's on screen) to a PNG. Falls back
  // to the server-rendered OG card if in-browser rendering stalls.
  // Format-true capture of the on-screen card (shared by save/copy/story
  // AND the hold-to-save overlay). Owns readiness + the .capture class:
  // the stamp's mask-image doesn't survive html-to-image (that's what
  // .capture strips), and un-decoded logo imgs clone as blanks on slow
  // connections.
  const captureCard = async (pixelRatio = 2) => {
    const node = cardRef.current;
    if (!node) throw new Error("no card");
    node.classList.add("capture");
    const restores: Array<() => void> = [];
    try {
      // Fonts must be applied before we paint the stamp to a canvas below.
      await (document.fonts?.ready ?? Promise.resolve());

      // html-to-image deep-clones <svg> verbatim WITHOUT inlining computed
      // styles, so var()-based fill/stroke never resolve in the exported raster
      // — the logo mark loses its arc, ball, and apron line and prints as an
      // empty square. Bake the current theme's concrete colors onto the SVG for
      // the shot; undone in the finally.
      node.querySelectorAll("svg *").forEach((el) => {
        (["fill", "stroke", "stop-color"] as const).forEach((attr) => {
          const v = el.getAttribute(attr);
          if (v && v.includes("var(")) {
            const resolved = getComputedStyle(el).getPropertyValue(attr).trim();
            if (resolved) {
              restores.push(() => el.setAttribute(attr, v));
              el.setAttribute(attr, resolved);
            }
          }
        });
      });

      // The verdict stamp is the one element html-to-image keeps dropping at the
      // canvas-rasterization step: it's present and correct in the clone (mask
      // stripped, transform stripped) yet gone from the PNG. But <img> elements
      // — the team logos, the QR — ALWAYS survive, because the browser
      // rasterizes them independently of the foreignObject. So paint each stamp
      // to a canvas and swap a plain <img> of it into its flex slot for the
      // shot; the live span is restored afterward. Canvas text uses the loaded
      // web font (fonts.ready awaited above), so it matches the card.
      node.querySelectorAll<HTMLElement>(".stamp").forEach((span) => {
        const h = span.offsetHeight;
        if (!h) return;
        const cs = getComputedStyle(span);
        const scale = 3;
        const bw = 2.5;
        const r = 7;
        const text = (span.textContent || "").toUpperCase();
        const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        // Size the box to the single-line text so a wrapped/constrained span
        // (or a narrow story frame) can never clip the stamp — fillText won't
        // wrap, so the canvas must be at least as wide as the text.
        const measure = document.createElement("canvas").getContext("2d");
        let w = span.offsetWidth;
        if (measure) {
          measure.font = font;
          try {
            (measure as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = cs.letterSpacing;
          } catch {
            /* older engines */
          }
          const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
          w = Math.max(w, Math.ceil(measure.measureText(text).width + padX + bw * 2));
        }
        const canvas = document.createElement("canvas");
        canvas.width = w * scale;
        canvas.height = h * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.scale(scale, scale);
        const color = cs.color;
        ctx.strokeStyle = color;
        ctx.lineWidth = bw;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bw / 2, bw / 2, w - bw, h - bw, r);
        else ctx.rect(bw / 2, bw / 2, w - bw, h - bw);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        try {
          (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = cs.letterSpacing;
        } catch {
          /* older engines: text is a hair tighter, fine */
        }
        // letter-spacing adds a trailing gap after the last glyph; nudge left by
        // half of it so centered text stays visually centered.
        const gap = parseFloat(cs.letterSpacing) || 0;
        ctx.fillText(text, w / 2 - gap / 2, h / 2 + 0.5);

        const img = document.createElement("img");
        img.src = canvas.toDataURL("image/png");
        img.width = w;
        img.height = h;
        img.style.display = cs.display === "inline" ? "inline-block" : cs.display;
        img.style.verticalAlign = "middle";
        const prevDisplay = span.style.display;
        span.style.display = "none";
        span.parentNode?.insertBefore(img, span.nextSibling);
        restores.push(() => {
          img.remove();
          span.style.display = prevDisplay;
        });
      });

      await Promise.all(
        Array.from(node.querySelectorAll("img"))
          .filter((i) => !i.classList.contains("hold-overlay"))
          .map((i) => i.decode().catch(() => {})),
      );
    // Explicit geometry so exports are identical from any screen size: the
    // preview's responsive aspect classes don't apply inside the capture
    // clone on phones. aspect-ratio is the preferred size, minHeight pins the
    // frame, and height:auto lets a monster deal GROW past it — the +N-more
    // budgets should prevent that, but growing beats cropping the ruling.
    const frame =
      format === "square"
        ? { width: "520px", minHeight: "520px", aspectRatio: "1 / 1" }
        : format === "story"
          ? { width: "380px", minHeight: "676px", aspectRatio: "9 / 16" }
          : null;
    const opts = {
      pixelRatio,
      // The hold-to-save overlay is a picture OF the card — capturing it
      // back into the card doubles the pixels and smears the export.
      filter: (n: HTMLElement) => !(n instanceof HTMLElement && n.classList?.contains("hold-overlay")),
      style: {
        overflow: "visible",
        maxHeight: "none",
        ...(frame
          ? { width: frame.width, maxWidth: frame.width, height: "auto", minHeight: frame.minHeight, aspectRatio: frame.aspectRatio }
          : {}),
      },
    };
    // iOS WebKit drops fonts/images on the first foreignObject rasterization
    // (the classic html-to-image Safari bug) — warm the pipeline, keep the
    // final pass.
    const isWebKit = /AppleWebKit/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    if (isWebKit) {
      await toPng(node, opts).catch(() => {});
      await toPng(node, opts).catch(() => {});
    }
    return Promise.race([
      toPng(node, opts),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("capture timeout")), 10_000)),
    ]);
    } finally {
      restores.forEach((r) => r());
      node.classList.remove("capture");
    }
  };

  // Touch devices: lay a pixel-true copy over the card so the OS long-press
  // gesture treats the whole card as a saveable image. It's just the server
  // card — no in-browser capture needed.
  useEffect(() => {
    if (!touchDevice) return;
    setHoldImg(ogImageUrl(format));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, touchDevice, token]);

  // Copy the rendered card itself to the clipboard — paste anywhere.
  // ClipboardItem takes the pending promise so Safari's user-gesture rule
  // is satisfied even though the capture is async.
  const copyImage = async () => {
    track("share_copy_image");
    try {
      // ClipboardItem takes the pending promise so Safari's user-gesture rule
      // is satisfied even though the fetch is async.
      const blobPromise = fetch(ogImageUrl(format)).then((r) => r.blob());
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
      setCopiedImg(true);
      setTimeout(() => setCopiedImg(false), 1600);
    } catch {
      // Clipboard blocked (permissions, odd browser) — they wanted the
      // image, so give them the image: fall back to the save path.
      void downloadImage();
    }
  };

  const downloadImage = async () => {
    track("share_download");
    setDownloading(true);
    const name = `over-the-apron-${format}-${legal ? "legal" : "blocked"}-${involved.map((t) => t.teamId).join("-")}.png`;
    const save = (href: string) => {
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.click();
    };
    try {
      const blob = await (await fetch(ogImageUrl(format))).blob();
      const objUrl = URL.createObjectURL(blob);
      // Phones: hand the PNG to the share sheet, whose "Save Image" writes
      // straight to Photos — a raw download strands the file in Files.
      if (canNativeShare) {
        const file = new File([blob], name, { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
          } catch {
            /* sheet dismissed — not an error */
          }
          URL.revokeObjectURL(objUrl);
          return;
        }
      }
      save(objUrl);
      URL.revokeObjectURL(objUrl);
    } catch {
      // Server unreachable — fall back to the in-browser capture.
      try {
        save(await captureCard());
      } catch {
        /* give up */
      }
    } finally {
      setDownloading(false);
    }
  };

  const shareStory = async () => {
    track("share_story");
    setFormat("story");
    setDownloading(true);
    try {
      const blob = await (await fetch(ogImageUrl("story"))).blob();
      const file = new File([blob], "over-the-apron-story.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        // The web can't jump straight into Instagram's story composer (that
        // API is native-app-only) — the share sheet is the ceiling, so tell
        // people which tile to tap.
        setStoryHint(true);
        await navigator.share({ files: [file] });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "over-the-apron-story.png";
        a.click();
      }
    } catch {
      /* user closed the share sheet — not an error */
    } finally {
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
        className="modal-in relative flex max-h-full w-full max-w-xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Floating close, touch devices only — desktop exits by clicking
            outside or Esc. A SIBLING of the card, so it never appears in
            captures; z-20 clears the hold-overlay. */}
        {touchDevice && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute -right-2 -top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--text)] text-[15px] font-bold text-[var(--bg)] shadow-[0_4px_14px_rgba(0,0,0,0.4)]"
          >
            ✕
          </button>
        )}
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

          {holdImg && (
            /* Pixel-true copy over the card: the OS long-press gesture now
               treats the whole card as an image — hold to Save to Photos. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={holdImg}
              alt="Trade card — press and hold to save as an image"
              draggable={false}
              className="hold-overlay absolute left-0 top-0 z-10 w-full"
            />
          )}
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
          <button onClick={downloadImage} disabled={downloading} className="rounded-md border border-[var(--border-strong)] bg-[var(--panel)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--text)] disabled:opacity-60">
            {downloading ? "Rendering…" : canNativeShare ? "Save image" : "Download image"}
          </button>
          {canCopyImage && (
            <button onClick={copyImage} className="rounded-md border border-[var(--border-strong)] bg-[var(--panel)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--text)]" title="Copy the card itself — paste into any app">
              {copiedImg ? "Copied ✓" : "Copy image"}
            </button>
          )}
          <a href={tweetHref} target="_blank" rel="noopener noreferrer" onClick={() => track("share_tweet")} className="rounded-md bg-[var(--text)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)] hover:opacity-90">
            Post on 𝕏
          </a>
          {canNativeShare && (
            <button
              onClick={shareStory}
              disabled={downloading}
              className="rounded-md bg-[var(--text)] px-3 py-1.5 text-xs font-semibold text-[var(--bg)] hover:opacity-90 disabled:opacity-60"
              title="9:16 card with a scannable QR, straight to the share sheet"
            >
              Add to story
            </button>
          )}
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#f4f1e9]/85 hover:text-[#f4f1e9]">
            Close
          </button>
        </div>
        {holdImg && (
          <p className="mt-2 text-center text-[11px] leading-snug text-[#f4f1e9]/60">
            Press and hold the card to save it as an image.
          </p>
        )}
        {storyHint && (
          <p className="mt-2 text-center text-[11px] font-semibold leading-snug text-[#f4f1e9]/90">
            In the share sheet: tap <span className="text-[#f4f1e9]">Instagram → Add to your story</span> — the QR on the card carries the link.
          </p>
        )}
        <p className="mt-2 text-center text-[11px] leading-snug text-[#f4f1e9]/60">
          The link rebuilds this exact trade on live rosters — it doesn&rsquo;t carry the rest of your session.
        </p>
      </div>
    </div>
  );
}
