"use client";

import { useEffect, useState } from "react";

const DAY = 86_400_000;
// 2026 negotiation window (June 30, 6 PM ET), the first day of camp, opening
// night and the last day of the regular season (NBA 2026-27 schedule).
const FA_OPEN = new Date("2026-06-30T18:00:00-04:00").getTime();
const CAMP = new Date("2026-10-01T00:00:00-04:00").getTime();
const OPENER = new Date("2026-10-20T00:00:00-04:00").getTime();
const SEASON_END = new Date("2027-04-12T00:00:00-04:00").getTime();

/** Where the league year stands for the reader, today. It said "free agency
 * · day 107" in mid-October because free agency was the only phase it knew;
 * each phase now gets its own clock. Client-side only, so the count is the
 * reader's now, not the build's. */
export function seasonPhase(now: number): string | null {
  if (now < FA_OPEN) return null;
  if (now < CAMP) return `free agency · day ${Math.floor((now - FA_OPEN) / DAY) + 1}`;
  if (now < OPENER) {
    const left = Math.ceil((OPENER - now) / DAY);
    return left === 1 ? "opening night is tomorrow" : `training camp · ${left} days to opening night`;
  }
  if (now < SEASON_END) return `regular season · day ${Math.floor((now - OPENER) / DAY) + 1}`;
  return null;
}

export function SeasonTicker() {
  const [phase, setPhase] = useState<string | null>(null);
  useEffect(() => setPhase(seasonPhase(Date.now())), []);
  return (
    <div className="label ml-auto hidden shrink-0 whitespace-nowrap xl:block">
      2026–27{phase ? <span className="tabular"> · {phase}</span> : null}
    </div>
  );
}
