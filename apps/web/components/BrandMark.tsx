/** The crest: a half-court diagram over a salary ledger, split by the apron
 * line, with the ball at center court and one arrow hopping over. Basketball
 * above the line, money below it — the whole site in 64 units.
 *
 * Theme-aware (CSS vars). Fixed-color copies live in app/icon.svg and
 * app/api/og/route.tsx — keep the geometry in sync across all three.
 * Ledger rows are varied-length rules, not "$" glyphs: type aliases into
 * noise below ~30px, lines read as a cap sheet at every size. */

export const CREST = {
  lane: "M22 0 V22.5 H42 V0",
  laneTicks: "M22 8.2 H18.7 M42 8.2 H45.3 M22 14.8 H18.7 M42 14.8 H45.3",
  circleSolid: "M25.5 22.5 A6.5 6.5 0 0 0 38.5 22.5",
  circleDashed: "M25.5 22.5 A6.5 6.5 0 0 1 38.5 22.5",
  threePt: "M16.5 29.5 A20.2 20.2 0 0 0 47.5 29.5",
  ledgerDivider: "M32 42 V57.2",
  ledgerRows: [
    "M10.5 43.4 H23.8 M37.5 43.4 H52.8",
    "M10.5 48.2 H20.7 M37.5 48.2 H49.4",
    "M10.5 53 H25.4 M37.5 53 H46.2",
    "M10.5 57.8 H18.9 M37.5 57.8 H53.6",
  ],
  ledgerTicks: "M26.7 43.4 H28.9 M26.7 48.2 H28.9 M26.7 53 H28.9 M26.7 57.8 H28.9",
  arrow: "M36.8 31.7 C40.1 27.3 43.8 25 48.7 24.1",
  arrowHead: "M51.7 23.7 L47.6 27.1 L46.8 22.4 Z",
} as const;

function CrestLines({ stroke, animate = false }: { stroke: string; animate?: boolean }) {
  return (
    <>
      {/* court */}
      <g stroke={stroke} fill="none" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
        <path d={CREST.lane} />
        <path d={CREST.circleSolid} />
        <path d={CREST.circleDashed} strokeDasharray="1.2 2.7" />
        <path d={CREST.threePt} opacity="0.58" />
        <path d={CREST.laneTicks} opacity="0.68" />
      </g>
      {/* ledger */}
      <g stroke={stroke} fill="none" strokeLinecap="round" opacity="0.48">
        <path d={CREST.ledgerDivider} strokeWidth="1.25" />
        {CREST.ledgerRows.map((d) => (
          <path key={d} d={d} strokeWidth="1.65" />
        ))}
        <path d={CREST.ledgerTicks} strokeWidth="1.35" />
      </g>
      {/* the apron line, the hop over, the ball at center court */}
      <path d="M6 35 H58" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" />
      <path
        className={animate ? "logo-arc" : undefined}
        d={CREST.arrow}
        fill="none"
        stroke={stroke}
        strokeWidth="1.85"
        strokeLinecap="round"
      />
      <path className={animate ? "logo-ball" : undefined} d={CREST.arrowHead} fill={stroke} />
      <circle className={animate ? "logo-ball" : undefined} cx="32" cy="35" r="4.9" fill="var(--accent)" />
    </>
  );
}

export function BrandMark({
  size = 26,
  animate = false,
  className,
}: {
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="14" fill="var(--text)" />
      <CrestLines stroke="var(--bg)" animate={animate} />
    </svg>
  );
}

/** Tile-less line art for oversized faint watermarks (TeamPicker, guide). */
export function BrandArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <CrestLines stroke="var(--text)" />
    </svg>
  );
}

/** The wordmark next to the mark: OVER THE APRON, "THE" in ink-orange. */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={`font-bold uppercase tracking-[0.05em] ${className ?? ""}`}>
      Over <span className="text-[var(--accent-ink)]">the</span> Apron
    </span>
  );
}
