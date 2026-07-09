import { ImageResponse } from "next/og";
import { summarizeTrade, filingNo } from "@/lib/trade-share";

const truncate = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
/** Verdict color that reads on the dark seal strip. */
const accent2 = (legal: boolean) => (legal ? "#7fb069" : "#e07a5f");
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
const panel2 = "#ece8db";
const accentInk = "#8a3a12";
const POS_C: Record<string, string> = {
  PG: "#2b7a3f",
  SG: "#33619f",
  SF: "#96690a",
  PF: "#b65410",
  C: "#bd2828",
};
const rgba = (hex: string, a: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
const money = (n: number) => `${n < 0 ? "-" : ""}$${(Math.abs(n) / 1e6).toFixed(1)}M`;
// The exact modal logo mark, baked to concrete colors so it rasterizes.
const markSvg =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${ink}"/><line x1="11" y1="41" x2="53" y2="41" stroke="${sienna}" stroke-width="4.5" stroke-dasharray="7.5 6" stroke-linecap="round"/><path d="M13 54 C 20 25, 37 14, 50 22" fill="none" stroke="${bg}" stroke-width="5" stroke-linecap="round"/><circle cx="50.5" cy="21.5" r="6.5" fill="${bg}"/></svg>`,
  );

// ✓ / ✗ / ⇄ as SVG icons — Satori's default font has no such glyphs, so
// the raw characters would render as empty boxes.
const svgIcon = (inner: string) =>
  "data:image/svg+xml," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${inner}</svg>`);
const checkImg = svgIcon(
  `<path d="M2.5 8.5 L6.4 12.4 L13.5 3.5" fill="none" stroke="#2b7a3f" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`,
);
const crossImg = svgIcon(
  `<path d="M4 4 L12 12 M12 4 L4 12" fill="none" stroke="#bd2828" stroke-width="2.1" stroke-linecap="round"/>`,
);
const swapImg = svgIcon(
  `<path d="M2 5.2 L13 5.2 M10.3 2.6 L13 5.2 L10.3 7.8 M14 10.8 L3 10.8 M5.7 8.2 L3 10.8 L5.7 13.4" fill="none" stroke="${muted}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`,
);

// Compact display payload the client passes (?d=), so the download is a
// pixel copy of the on-screen modal AND uses the live-session numbers.
type PLine = [string, number | null, string | null]; // [label, salary|null(pick), pos|null]
interface PTeam {
  id: string;
  nm: string;
  tr: ApronTier;
  gt: number;
  st: number;
  g: PLine[];
  s: PLine[];
}
interface Payload {
  v: number;
  lg: number; // legal 1/0
  tm: PTeam[];
  ck: [number, string][]; // [ok, text]
  fx: string; // one route to legal
  fn: string; // filing "NO. 26-XXXXX"
}

// Natural (tight) height for the feed card, so it matches the modal's grow.
function feedHeight(p: Payload): number {
  // Estimated because Satori needs a fixed canvas; erring slightly generous so
  // the footer never clips, tuned so the common card sits close-to-tight.
  let h = 34 + 36 + 74 + 74 + 28 + 48 + 78; // padT+padB, masthead, logos row, checks label, seal, bar
  for (const t of p.tm) h += 52 + Math.max(t.g.length, t.s.length, 1) * 40 + 34 + 14;
  for (const c of p.ck) h += 28 * Math.max(1, Math.ceil(c[1].length / 88)) + 14;
  if (p.fx) h += 28 * Math.max(1, Math.ceil(p.fx.length / 92)) + 42;
  return Math.round(h);
}

function DealLine({ l }: { l: PLine }) {
  const [label, amount, pos] = l;
  if (amount === null) {
    return (
      <div style={{ display: "flex", fontSize: 21, fontWeight: 600, color: accentInk, fontFamily: mono }}>
        {label}
      </div>
    );
  }
  const pc = pos ? POS_C[pos] ?? muted : muted;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {pos ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              minWidth: 28,
              marginRight: 9,
              padding: "3px 5px",
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 700,
              color: pc,
              background: rgba(pc, 0.16),
              fontFamily: mono,
            }}
          >
            {pos}
          </div>
        ) : null}
        <div style={{ display: "flex", fontSize: 23, color: ink }}>{label}</div>
      </div>
      <div style={{ display: "flex", fontSize: 22, color: muted, fontFamily: mono }}>{money(amount)}</div>
    </div>
  );
}

function TeamCard({ t, origin }: { t: PTeam; origin: string }) {
  const tier = TIER[t.tr] ?? TIER.over_cap;
  const column = (dir: "g" | "s") => {
    const lines = dir === "g" ? t.g : t.s;
    return (
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "14px 22px" }}>
        <div style={{ display: "flex", fontSize: 14, fontWeight: 600, letterSpacing: 1, color: muted, marginBottom: 9 }}>
          {(dir === "g" ? "GETS · " : "SENDS · ") + money(dir === "g" ? t.gt : t.st)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {lines.length === 0 ? (
            <div style={{ display: "flex", fontSize: 22, color: muted }}>—</div>
          ) : (
            lines.map((l, i) => <DealLine key={i} l={l} />)
          )}
        </div>
      </div>
    );
  };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${border}`,
        borderRadius: 12,
        background: panel,
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 22px",
          borderBottom: `1px solid ${border}`,
          background: rgba(panel2, 0.55),
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${origin}/logos/${t.id}.png`} width={26} height={26} style={{ marginRight: 10 }} alt="" />
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: ink }}>{t.nm}</div>
        </div>
        <div
          style={{
            display: "flex",
            border: `1.5px solid ${tier.color}`,
            borderRadius: 5,
            padding: "3px 9px",
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 1,
            color: tier.color,
            background: rgba(tier.color, 0.12),
          }}
        >
          {tier.label}
        </div>
      </div>
      <div style={{ display: "flex" }}>
        {column("g")}
        <div style={{ display: "flex", width: 1, background: border }} />
        {column("s")}
      </div>
    </div>
  );
}

function RichTradeCard({ p, origin, date }: { p: Payload; origin: string; date: string }) {
  const legal = p.lg === 1;
  const vc = legal ? "#2b7a3f" : "#bd2828";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: bg,
        fontFamily: "sans-serif",
        padding: "34px 36px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 16,
          borderBottom: `1px solid ${border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markSvg} width={40} height={40} style={{ marginRight: 12, borderRadius: 9 }} alt="" />
          <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: ink }}>Over the Apron</div>
        </div>
        <div style={{ display: "flex", fontSize: 18, letterSpacing: 1, color: muted, fontFamily: mono }}>
          {`OVERTHEAPRON.COM · ${p.fn}`}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          {p.tm.map((t, i) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {i > 0 ? <img src={swapImg} width={22} height={22} style={{ margin: "0 11px" }} alt="" /> : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${origin}/logos/${t.id}.png`} width={34} height={34} alt="" />
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            border: `3px solid ${vc}`,
            borderRadius: 9,
            padding: "3px 16px",
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: 2,
            color: vc,
            transform: "rotate(-3deg)",
          }}
        >
          {legal ? "LEGAL TRADE" : "BLOCKED"}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 2 }}>
        {p.tm.map((t) => (
          <TeamCard key={t.id} t={t} origin={origin} />
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
        <div style={{ display: "flex", fontSize: 15, fontWeight: 600, letterSpacing: 1, color: muted, marginBottom: 11 }}>
          {legal ? "WHY IT WORKS" : "WHY IT DOESN'T"}
        </div>
        {p.ck.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", marginBottom: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c[0] ? checkImg : crossImg} width={20} height={20} style={{ marginRight: 12, marginTop: 3 }} alt="" />
            <div style={{ display: "flex", fontSize: 21, lineHeight: 1.35, color: ink, flexShrink: 1 }}>{c[1]}</div>
          </div>
        ))}
        {p.fx ? (
          <div
            style={{
              display: "flex",
              marginTop: 6,
              paddingTop: 12,
              borderTop: `1px dashed ${border}`,
              fontSize: 19,
              lineHeight: 1.35,
              color: muted,
            }}
          >
            <div style={{ display: "flex", fontWeight: 700, color: accentInk, marginRight: 7 }}>One route to legal:</div>
            <div style={{ display: "flex", flexShrink: 1 }}>{p.fx}</div>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", flexGrow: 1, minHeight: 12 }} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: 12,
          borderTop: `1px dashed ${border}`,
          fontSize: 15,
          letterSpacing: 1,
          color: muted,
          fontFamily: mono,
        }}
      >
        <div style={{ display: "flex" }}>{`FILED ${date} · ${p.fn}`}</div>
        <div style={{ display: "flex", fontWeight: 700, color: vc }}>
          {legal ? "LEGAL UNDER THE 2023 CBA" : "BLOCKED UNDER THE 2023 CBA"}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: 14,
          background: ink,
          borderRadius: 10,
          padding: "15px 0",
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 2,
          color: bg,
        }}
      >
        FULL TRADE + RULING AT OVERTHEAPRON.COM
      </div>
    </div>
  );
}

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

const DIMS = {
  feed: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
} as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const t = url.searchParams.get("t") || "";
  const fmtParam = url.searchParams.get("fmt");
  const dims = DIMS[(fmtParam as keyof typeof DIMS) in DIMS ? (fmtParam as keyof typeof DIMS) : "feed"];

  // Rich, pixel-faithful card: the client passes what the modal computed
  // (?d=), so the download matches the on-screen card AND its live-session
  // numbers. Feed grows to fit; square/story are fixed frames.
  const dParam = url.searchParams.get("d");
  if (dParam) {
    try {
      const binary = atob(dParam.replace(/-/g, "+").replace(/_/g, "/"));
      const jsonStr = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
      const p = JSON.parse(jsonStr) as Payload;
      const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const size =
        fmtParam === "square"
          ? { width: 1080, height: Math.max(1080, feedHeight(p)) }
          : fmtParam === "story"
            ? { width: 1080, height: Math.max(1920, feedHeight(p)) }
            : { width: 1080, height: feedHeight(p) };
      return new ImageResponse(<RichTradeCard p={p} origin={url.origin} date={date} />, size);
    } catch {
      /* malformed payload — fall through to the token recompute below */
    }
  }

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
              simplified.
            </div>
            <div style={{ fontSize: 26, color: muted, marginTop: 22, lineHeight: 1.4 }}>
              Trades, signings, aprons, and hard caps — with the rule shown when it matters.
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
      dims,
    );
  }

  const accent = s.legal ? TIER.below_cap.color : TIER.second_apron.color;
  // 3-4 team deals need a denser card to keep the seal strip on canvas.
  const compact = s.perTeam.length > 2;

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

        <div style={{ display: "flex", alignItems: "center", marginTop: 16 }}>
          <div
            style={{
              display: "flex",
              border: `4px solid ${accent}`,
              borderRadius: 10,
              padding: "2px 18px",
              fontSize: 30,
              fontWeight: 800,
              color: accent,
              letterSpacing: 3,
              transform: "rotate(-3deg)",
            }}
          >
            {s.legal ? "LEGAL TRADE" : "BLOCKED"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
          {s.perTeam.slice(0, 4).map((pt, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                background: panel,
                border: `1px solid ${border}`,
                borderRadius: 10,
                padding: compact ? "8px 20px" : "12px 22px",
                marginBottom: compact ? 8 : 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: compact ? 22 : 27, fontWeight: 700 }}>{pt.name}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: TIER[pt.tier].color, letterSpacing: 1.2 }}>
                  {TIER[pt.tier].label}
                </div>
              </div>
              <div style={{ display: "flex", fontSize: compact ? 18 : 20, color: TIER.below_cap.color, marginTop: 4, fontFamily: mono }}>
                IN&nbsp;&nbsp;{pt.incoming.join(", ") || "—"}
              </div>
              <div style={{ display: "flex", fontSize: compact ? 17 : 19, color: muted, marginTop: 2, fontFamily: mono }}>
                OUT&nbsp;{pt.outgoing.join(", ") || "—"}
              </div>
              {pt.rule && !compact ? (
                <div style={{ display: "flex", alignItems: "center", fontSize: 15, color: muted, marginTop: 6 }}>
                  <div style={{ display: "flex", width: 7, height: 7, borderRadius: 7, background: TIER.below_cap.color, marginRight: 8 }} />
                  legal under {pt.rule}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
          <div
            style={{
              display: "flex",
              borderTop: `1px solid ${border}`,
              paddingTop: 12,
              fontSize: 18,
              color: muted,
            }}
          >
            {s.legal
              ? "Satisfies the modeled salary-matching and apron checks."
              : truncate(s.reason || "Violates the 2023 CBA.", 210)}
          </div>
          {/* The growth loop lives HERE — this image is what X actually shows. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 12,
              background: ink,
              color: bg,
              borderRadius: 10,
              padding: "12px 24px",
              fontSize: 21,
              fontWeight: 700,
              letterSpacing: 1.5,
            }}
          >
            <div style={{ display: "flex", color: accent2(s.legal) }}>
              {s.legal ? "LEGAL UNDER THE 2023 CBA" : "BLOCKED UNDER THE 2023 CBA"}
            </div>
            <div style={{ display: "flex" }}>{"FULL RULING AT OVERTHEAPRON.COM"}</div>
          </div>
        </div>
      </div>
    ),
    dims,
  );
}
