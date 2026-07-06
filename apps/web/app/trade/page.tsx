import type { Metadata } from "next";
import { redirect } from "next/navigation";
import TradeBuilder from "@/components/TradeBuilder";
import { summarizeTrade, lastName } from "@/lib/trade-share";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}): Promise<Metadata> {
  const { t } = await searchParams;
  const s = t ? summarizeTrade(t) : null;
  if (!s) return { title: "Trade Machine · Over the Apron" };

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

export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  // Old shared links pointed here; the card-first landing now lives on the
  // full offseason page, so send the token home.
  const { t } = await searchParams;
  if (t) redirect(`/?t=${encodeURIComponent(t)}`);
  return <TradeBuilder />;
}
