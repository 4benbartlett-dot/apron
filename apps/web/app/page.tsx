import type { Metadata } from "next";
import OffseasonSim from "@/components/OffseasonSim";
import { NewsFeed } from "@/components/NewsFeed";
import { latestNewsDay } from "@/lib/newsDay";
import { summarizeTrade, lastName } from "@/lib/trade-share";
import { SITE } from "@/lib/seo";

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
  // Every ?t= is a different URL showing the same board with someone's staged
  // trade on it — thin, unbounded, and it competes with the real homepage. One
  // of them ("BLOCKED: GSW-WAS trade") had started surfacing on brand searches.
  // The canonical folds them all back into "/". Unfurls are unaffected: X and
  // Facebook read og:*, not rel=canonical, so a shared link still previews its
  // own verdict.
  const alternates = { canonical: SITE };
  if (!s) return { alternates };

  const active = s.perTeam.filter((pt) => pt.incoming.length + pt.outgoing.length > 0);
  const headline = active
    .map((pt) => `${pt.team} get ${pt.incoming.map(lastName).join(", ") || "—"}`)
    .join(" · ");
  const title = `${s.legal ? "LEGAL" : "BLOCKED"}: ${active.map((pt) => pt.team).join("–")} trade · Over the Apron`;
  const og = `/api/og?t=${encodeURIComponent(t!)}&v=${OG_VERSION}`;

  return {
    title,
    description: headline,
    alternates,
    openGraph: {
      title,
      description: headline,
      images: [{ url: og, width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image", title, description: headline, images: [og] },
  };
}

/**
 * Site-name and logo markup, homepage only — Google reads WebSite.name to
 * decide whether a result header says "Over the Apron" or falls back to the
 * bare domain, and it only looks for it on the home page. The Organization
 * logo gives it a square brand image to associate with the site, which is a
 * different slot from the favicon and from og:image.
 */
const SITE_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE}/#website`,
      url: SITE,
      name: "Over the Apron",
      alternateName: ["Over the Apron — NBA Offseason, Simplified", "overtheapron"],
      description:
        "An NBA trade machine and free-agency simulator built on the 2023 CBA: apron tiers, hard caps, Bird rights, salary matching, and a cited reason for every verdict.",
      publisher: { "@id": `${SITE}/#org` },
      inLanguage: "en-US",
    },
    {
      "@type": "Organization",
      "@id": `${SITE}/#org`,
      name: "Over the Apron",
      url: SITE,
      logo: {
        "@type": "ImageObject",
        url: `${SITE}/icon-512.png`,
        width: 512,
        height: 512,
      },
      sameAs: ["https://x.com/overtheapron"],
    },
  ],
};

export default function Home() {
  const news = latestNewsDay();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSONLD) }}
      />
      {news && (
        <div className="mb-6">
          <NewsFeed day={news} headed />
        </div>
      )}
      <OffseasonSim />
    </>
  );
}
