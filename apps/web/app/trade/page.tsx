import type { Metadata } from "next";
import TradeBuilder from "@/components/TradeBuilder";
import { summarizeTrade, lastName } from "@/lib/trade-share";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}): Promise<Metadata> {
  const { t } = await searchParams;
  const s = t ? summarizeTrade(t) : null;
  if (!s) return { title: "Trade Machine · Apron" };

  const headline = s.perTeam
    .map((pt) => `${pt.team} get ${pt.incoming.map(lastName).join(", ") || "—"}`)
    .join("  •  ");
  const title = `${s.legal ? "Legal" : "Illegal"} NBA trade · Apron`;
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

export default function TradePage() {
  return <TradeBuilder />;
}
