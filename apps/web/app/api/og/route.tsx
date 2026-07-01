import { ImageResponse } from "next/og";
import { summarizeTrade } from "@/lib/trade-share";
import type { ApronTier } from "@apron/cba-engine";

export const runtime = "nodejs";

const TIER: Record<ApronTier, { label: string; color: string }> = {
  below_cap: { label: "UNDER CAP", color: "#22c55e" },
  over_cap: { label: "OVER CAP", color: "#38bdf8" },
  taxpayer: { label: "LUXURY TAX", color: "#f59e0b" },
  first_apron: { label: "FIRST APRON", color: "#fb923c" },
  second_apron: { label: "SECOND APRON", color: "#ef4444" },
};

const bg = "#0a0a0c";
const panel = "#141418";
const border = "#2a2a32";
const muted = "#9a9aa5";

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t") || "";
  const s = summarizeTrade(t);

  if (!s) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: bg, color: "#ededf0", fontFamily: "sans-serif" }}>
          <div style={{ fontSize: 64, fontWeight: 800 }}>Apron</div>
          <div style={{ fontSize: 30, color: muted, marginTop: 12 }}>NBA Trade & Free-Agency Simulator</div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  }

  const accent = s.legal ? "#22c55e" : "#ef4444";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: bg, color: "#ededf0", padding: 56, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div style={{ width: 46, height: 46, background: "#ef4444", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 900, color: "#fff", marginRight: 16 }}>A</div>
            <div style={{ fontSize: 36, fontWeight: 800 }}>Apron</div>
          </div>
          <div style={{ fontSize: 22, color: muted }}>2026-27 · 2023 CBA</div>
        </div>

        <div style={{ display: "flex", marginTop: 30, marginBottom: 8 }}>
          <div style={{ display: "flex", background: accent, color: "#0a0a0c", fontSize: 40, fontWeight: 900, padding: "8px 24px", borderRadius: 12, letterSpacing: 1 }}>
            {s.legal ? "LEGAL TRADE" : "ILLEGAL TRADE"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 22 }}>
          {s.perTeam.slice(0, 4).map((pt, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", background: panel, border: `1px solid ${border}`, borderRadius: 14, padding: "16px 22px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{pt.name}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: TIER[pt.tier].color }}>{TIER[pt.tier].label}</div>
              </div>
              <div style={{ display: "flex", fontSize: 22, color: "#22c55e", marginTop: 6 }}>
                IN: {pt.incoming.join(", ") || "—"}
              </div>
              <div style={{ display: "flex", fontSize: 19, color: muted, marginTop: 2 }}>
                OUT: {pt.outgoing.join(", ") || "—"}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", marginTop: "auto", fontSize: 20, color: muted }}>
          {s.legal ? "Satisfies all salary-matching & apron rules." : s.reason || ""}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
