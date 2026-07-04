"use client";

import { useEffect, useState } from "react";

/** "Free agency · day N" — counted from the 2026 negotiation window opening
 * (June 30, 6 PM ET). Rendered client-side only so the count is the
 * reader's now, not the build's. */
export function SeasonTicker() {
  const [day, setDay] = useState<number | null>(null);
  useEffect(() => {
    const open = new Date("2026-06-30T18:00:00-04:00").getTime();
    const d = Math.floor((Date.now() - open) / 86_400_000) + 1;
    if (d >= 1 && d <= 120) setDay(d);
  }, []);
  return (
    <div className="label ml-auto hidden shrink-0 whitespace-nowrap xl:block">
      2026–27{day ? <span className="tabular"> · free agency · day {day}</span> : null}
    </div>
  );
}
