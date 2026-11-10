// TODAY where the transactions happen, not in UTC.
//
// Every script that stamps "as of" into a data file needs the wall-clock date
// of the pull. Taking it from toISOString() meant that from 4 or 5 p.m. Pacific
// onward the date had already rolled over in UTC, so an evening refresh
// advertised data "as of" a day that had not happened yet. The transactions
// scraper learned this first and grew its own fix; six other scripts kept the
// UTC stamp, and on Nov 9 2026 the exception ledger and next season's cap table
// were both stamped Nov 10. This is the one copy.
//
// Date-only arithmetic (adding days to an ISO date) stays on UTC, where it is
// exact; only "what day is it" is local.

/** Today's date as yyyy-mm-dd on this machine's clock. */
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
