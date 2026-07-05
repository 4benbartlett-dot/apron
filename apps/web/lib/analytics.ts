/** Cookieless usage counts via Umami. The script only loads when
 * NEXT_PUBLIC_UMAMI_WEBSITE_ID is set (see layout.tsx), so this is a
 * no-op in dev and for anyone running the repo themselves.
 *
 * Event taxonomy — keep it small, these are counters not a ledger:
 *   trade_staged   { result }  a verdict panel appeared on the board
 *   move           { kind }    any move actually executed, sim or /trade
 *   share_open     { result }  share card opened
 *   share_tweet / share_copy / share_download
 */
declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, string | number>) => void };
  }
}

export function track(event: string, data?: Record<string, string | number>) {
  try {
    window.umami?.track(event, data);
  } catch {
    /* analytics must never break the app */
  }
}
