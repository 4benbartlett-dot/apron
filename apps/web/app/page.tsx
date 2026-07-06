import type { Metadata } from "next";
import OffseasonSim from "@/components/OffseasonSim";
import { summarizeTrade, lastName } from "@/lib/trade-share";

/** Shared trade links (?t=) land on the full offseason page — this gives
 * them the same LEGAL/BLOCKED unfurl the /trade route had. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}): Promise<Metadata> {
  const { t } = await searchParams;
  const s = t ? summarizeTrade(t) : null;
  if (!s) return {};

  const active = s.perTeam.filter((pt) => pt.incoming.length + pt.outgoing.length > 0);
  const headline = active
    .map((pt) => `${pt.team} get ${pt.incoming.map(lastName).join(", ") || "—"}`)
    .join("  •  ");
  const title = `${s.legal ? "LEGAL" : "BLOCKED"}: ${active.map((pt) => pt.team).join("–")} trade · Over the Apron`;
  const og = `/api/og?t=${encodeURIComponent(t!)}`;

  return {
    title,
    description: headline,
    openGraph: {
      title,
      description: headline,
      images: [{ url: og, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description: headline, images: [og] },
  };
}

export default function Home() {
  return <OffseasonSim />;
}
