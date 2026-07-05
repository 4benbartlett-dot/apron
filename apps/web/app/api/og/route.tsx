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

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div
        style={{
          width: 44,
          height: 44,
          background: ink,
          borderRadius: 10,
          position: "relative",
          display: "flex",
          marginRight: 14,
        }}
      >
        {/* the vault: dashed apron line, arc clearing it, ball at the apex */}
        <div
          style={{
            position: "absolute",
            left: 7,
            right: 7,
            top: 28,
            height: 4.5,
            background: `repeating-linear-gradient(90deg, ${sienna} 0px, ${sienna} 6px, transparent 6px, transparent 10px)`,
            borderRadius: 2,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 7,
            top: 12,
            width: 26,
            height: 30,
            border: "3.5px solid transparent",
            borderTopColor: bg,
            borderLeftColor: bg,
            borderRadius: "100%",
            transform: "rotate(32deg)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 29,
            top: 9,
            width: 10,
            height: 10,
            borderRadius: 10,
            background: bg,
            display: "flex",
          }}
        />
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: ink, letterSpacing: -0.5 }}>
        Over the Apron
      </div>
    </div>
  );
}

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") || "";
  const s = summarizeTrade(t);

  if (!s) {
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
            padding: 64,
            fontFamily: "sans-serif",
          }}
        >
          <Wordmark />
          <div style={{ display: "flex", flexDirection: "column", margin: "auto 0" }}>
            <div style={{ fontSize: 62, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.1 }}>
              The NBA offseason,
            </div>
            <div style={{ fontSize: 62, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.1 }}>
              under the real CBA.
            </div>
            <div style={{ fontSize: 26, color: muted, marginTop: 22, lineHeight: 1.4 }}>
              Trades, signings, aprons, and hard caps — every verdict cites the rule.
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              borderTop: `1px solid ${border}`,
              paddingTop: 20,
              fontSize: 20,
              color: muted,
              fontFamily: mono,
            }}
          >
            <div>2026–27 · FREE AGENCY · 2023 CBA</div>
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
          {/* one string child on purpose: satori 500s on a non-flex div
              holding more than one child node (text + interpolation). */}
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
