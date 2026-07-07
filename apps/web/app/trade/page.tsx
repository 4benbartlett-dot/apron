import { redirect, permanentRedirect } from "next/navigation";

/**
 * The standalone trade machine folded into the main offseason board — you now
 * trade and sign from one place. Old links fold in: a shared trade token lands
 * on the card-first home unfurl, and a team pre-select (?a=) opens the board
 * with that team loaded.
 */
export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; a?: string }>;
}) {
  const { t, a } = await searchParams;
  if (t) redirect(`/?t=${encodeURIComponent(t)}`); // dynamic share token — temporary
  if (a) permanentRedirect(`/?team=${encodeURIComponent(a)}`);
  permanentRedirect("/");
}
