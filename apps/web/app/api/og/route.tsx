import { ImageResponse } from "next/og";
import { summarizeTrade, filingNo } from "@/lib/trade-share";
import type { ApronTier } from "@apron/cba-engine";

export const runtime = "nodejs";

// Paper cap-sheet identity (matches globals.css).
const bg = "#f4f1e9";
const panel = "#fdfcf8";
const border = "#ddd6c3";
const ink = "#211d13";
const muted = "#746c57";

const TIER: Record<ApronTier, { label: string; color: string }> = {
  below_cap: { label: "UNDER CAP", color: "#2b7a3f" },
  over_cap: { label: "OVER CAP", color: "#33619f" },
  taxpayer: { label: "LUXURY TAX", color: "#96690a" },
  first_apron: { label: "FIRST APRON", color: "#b65410" },
  second_apron: { label: "SECOND APRON", color: "#bd2828" },
};

const mono = "ui-monospace, Menlo, monospace";

const sienna = "#b4501e";

/** The crest: half-court over the ledger, split by the apron line, ball at
 * center court. Geometry mirrors components/BrandMark.tsx / app/icon.svg. */
function Mark({ size = 44, lines = bg, outlined = false }: { size?: number; lines?: string; outlined?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill={ink} />
      <rect x="1.2" y="1.2" width="61.6" height="61.6" rx="12.9" fill="none" stroke={outlined ? lines : "none"} strokeWidth="1.85" />
      <g stroke={lines} fill="none" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
        <path d={outlined ? "M22 2.1 V22.5 H42 V2.1" : "M22 0 V22.5 H42 V0"} />
        <path d="M25.5 22.5 A6.5 6.5 0 0 0 38.5 22.5" />
        <path d="M25.5 22.5 A6.5 6.5 0 0 1 38.5 22.5" strokeDasharray="1.2 2.7" />
        <path d="M16.5 29.5 A20.2 20.2 0 0 0 47.5 29.5" opacity="0.58" />
        <path d="M22 8.2 H18.7 M42 8.2 H45.3 M22 14.8 H18.7 M42 14.8 H45.3" opacity="0.68" />
      </g>
      <g stroke={lines} fill="none" strokeLinecap="round" opacity="0.48">
        <path d="M32 42 V57.2" strokeWidth="1.25" />
        <path d="M10.5 43.4 H23.8 M37.5 43.4 H52.8" strokeWidth="1.65" />
        <path d="M10.5 48.2 H20.7 M37.5 48.2 H49.4" strokeWidth="1.65" />
        <path d="M10.5 53 H25.4 M37.5 53 H46.2" strokeWidth="1.65" />
        <path d="M10.5 57.8 H18.9 M37.5 57.8 H53.6" strokeWidth="1.65" />
        <path d="M26.7 43.4 H28.9 M26.7 48.2 H28.9 M26.7 53 H28.9 M26.7 57.8 H28.9" strokeWidth="1.35" />
      </g>
      <path d="M6 35 H58" stroke={sienna} strokeWidth="4" strokeLinecap="round" />
      <path d="M36.8 31.7 C40.1 27.3 43.8 25 48.7 24.1" fill="none" stroke={lines} strokeWidth="1.85" strokeLinecap="round" />
      <path d="M51.7 23.7 L47.6 27.1 L46.8 22.4 Z" fill={lines} />
      <circle cx="32" cy="35" r="4.9" fill={sienna} />
    </svg>
  );
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", marginRight: 14 }}>
        <Mark />
      </div>
      <div style={{ display: "flex", fontSize: 27, fontWeight: 700, color: ink, letterSpacing: 1.5 }}>
        OVER&nbsp;<span style={{ color: sienna }}>THE</span>&nbsp;APRON
      </div>
    </div>
  );
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") || "";
  const s = summarizeTrade(t);

  if (!s) {
    // The crest, full-bleed on night-ledger ink.
    const paper = "#f4f1e9";
    const dim = "#a89f88";
    const rule = "#3a3323";
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            background: "#17140e",
            color: paper,
            padding: "56px 64px 40px",
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ display: "flex", margin: "auto 0 0" }}>
            <Mark size={252} lines={paper} outlined />
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 74,
              fontWeight: 800,
              letterSpacing: 6,
              marginTop: 38,
            }}
          >
            OVER&nbsp;<span style={{ color: "#e05e24" }}>THE</span>&nbsp;APRON
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 20, marginBottom: "auto" }}>
            <div style={{ display: "flex", width: 44, height: 4, background: "#e05e24", borderRadius: 2 }} />
            <div
              style={{
                display: "flex",
                fontSize: 27,
                fontWeight: 600,
                letterSpacing: 7,
                color: dim,
                margin: "0 26px",
              }}
            >
              NBA OFFSEASON, SIMPLIFIED
            </div>
            <div style={{ display: "flex", width: 44, height: 4, background: "#e05e24", borderRadius: 2 }} />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignSelf: "stretch",
              borderTop: `1px solid ${rule}`,
              paddingTop: 20,
              fontSize: 20,
              color: dim,
              fontFamily: mono,
            }}
          >
            <div>2026–27 · FREE AGENCY · EVERY VERDICT CITES THE RULE</div>
            <div>OVERTHEAPRON.COM</div>
          </div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }

  const accent = s.legal ? TIER.below_cap.color : TIER.second_apron.color;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: bg,
          color: ink,
          padding: 52,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Wordmark />
          <div style={{ fontSize: 20, color: muted, fontFamily: mono }}>
            {`OVERTHEAPRON.COM · ${filingNo(t)}`}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", marginTop: 26 }}>
          <div
            style={{
              display: "flex",
              border: `4px solid ${accent}`,
              borderRadius: 10,
              padding: "4px 20px",
              fontSize: 34,
              fontWeight: 800,
              color: accent,
              letterSpacing: 3,
              transform: "rotate(-3deg)",
            }}
          >
            {s.legal ? "LEGAL TRADE" : "BLOCKED"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 22 }}>
          {s.perTeam.slice(0, 4).map((pt, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                background: panel,
                border: `1px solid ${border}`,
                borderRadius: 10,
                padding: "14px 22px",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 27, fontWeight: 700 }}>{pt.name}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: TIER[pt.tier].color, letterSpacing: 1.2 }}>
                  {TIER[pt.tier].label}
                </div>
              </div>
              <div style={{ display: "flex", fontSize: 20, color: TIER.below_cap.color, marginTop: 6, fontFamily: mono }}>
                IN&nbsp;&nbsp;{pt.incoming.join(", ") || "—"}
              </div>
              <div style={{ display: "flex", fontSize: 19, color: muted, marginTop: 2, fontFamily: mono }}>
                OUT&nbsp;{pt.outgoing.join(", ") || "—"}
              </div>
              {pt.rule ? (
                <div style={{ display: "flex", alignItems: "center", fontSize: 15, color: muted, marginTop: 7 }}>
                  <div style={{ display: "flex", width: 7, height: 7, borderRadius: 7, background: TIER.below_cap.color, marginRight: 8 }} />
                  legal under {pt.rule}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "auto",
            borderTop: `1px solid ${border}`,
            paddingTop: 18,
            fontSize: 19,
            color: muted,
          }}
        >
          {s.legal
            ? "Satisfies salary matching and every apron rule."
            : s.reason || "Violates the 2023 CBA."}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
