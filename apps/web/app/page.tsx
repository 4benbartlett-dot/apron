import type { Metadata } from "next";
import OffseasonSim from "@/components/OffseasonSim";
import { NewsFeed } from "@/components/NewsFeed";
import { latestNewsDay } from "@/lib/newsDay";
import { summarizeTrade, lastName } from "@/lib/trade-share";

/** Bump when the OG-card renderer changes in a way X/Facebook should re-fetch.
 * Social crawlers cache og:image by URL under our immutable/1yr header, so
 * cards shared while the image was broken (relative URL / pre-Satori) stay
 * stuck on the stale blank until the URL itself changes. This version param
 * is that lever — a new value = a new URL = a forced fresh crawl. */
const OG_VERSION = "2";

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
    .join(" · ");
  const title = `${s.legal ? "LEGAL" : "BLOCKED"}: ${active.map((pt) => pt.team).join("–")} trade · Over the Apron`;
  const og = `/api/og?t=${encodeURIComponent(t!)}&v=${OG_VERSION}`;

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
  const news = latestNewsDay();
  return (
    <>
      {news && (
        <div className="mb-6">
          <NewsFeed day={news} headed />
        </div>
      )}
      <OffseasonSim />
    </>
  );
}
