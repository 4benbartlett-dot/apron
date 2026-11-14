import type { Metadata } from "next";
import { TEAM_IDS } from "@/lib/league";
import { teamSheetMeta } from "@/lib/seo";

/**
 * The team page is a client component (it reads the visitor's session), so
 * it can't export metadata. Without this layout all thirty team pages carried
 * the homepage's title and description, and no canonical URL.
 */
export function generateStaticParams() {
  return TEAM_IDS.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  // An address that isn't a team renders "team not found"; keep it out of the index.
  if (!TEAM_IDS.includes(id)) return { title: "Team not found — Over the Apron", robots: { index: false, follow: true } };
  const { title, description, canonical } = teamSheetMeta(id);
  return { title, description, alternates: { canonical }, openGraph: { title, description, url: canonical } };
}

export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return children;
}
