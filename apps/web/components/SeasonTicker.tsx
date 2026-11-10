"use client";

import { useEffect, useState } from "react";
import { CALENDAR_2026_27 as CAL } from "@apron/cba-engine";

const DAY = 86_400_000;
// The league's dates are days; the reader's clock is an instant. Each boundary
// is the calendar's day at midnight Eastern, except the negotiation window,
// which opens at 6 p.m. The dates themselves are the engine calendar's.
const eastern = (iso: string, time = "00:00:00") => new Date(`${iso}T${time}-04:00`).getTime();
const FA_OPEN = eastern(CAL.leagueYearOpens, "18:00:00");
const CAMP = eastern(CAL.campOpens);
const OPENER = eastern(CAL.openingNight);
// The first midnight after the last day of the season.
const SEASON_END = eastern(CAL.regularSeasonEnd) + DAY;

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
