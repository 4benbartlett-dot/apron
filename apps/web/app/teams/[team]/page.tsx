import { redirect, notFound } from "next/navigation";
import { teamIdFromSlug } from "@/lib/seo";

/** /teams/lakers → /teams/lakers/trade-machine (the canonical page). */
export default async function TeamAlias({ params }: { params: Promise<{ team: string }> }) {
  const { team } = await params;
  if (!teamIdFromSlug(team)) notFound();
  redirect(`/teams/${team.toLowerCase()}/trade-machine`);
}
