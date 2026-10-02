// Firecrawl's plan allows ~11 scrape requests a minute. Every scraper here
// fires its requests back to back, so a routine refresh (the transactions
// window split, thirty cap tables) trips the limit and dies mid-pull — on
// Oct 2 2026 the transactions scrape, the signed-FA page, the apron tracker,
// the pick ledger and the deadline pages all failed inside one minute.
//
// Imported for its side effect: it wraps globalThis.fetch for
// api.firecrawl.dev only, spaces those calls FIRECRAWL_MIN_GAP_MS apart
// (default 6.5s, under the limit), and when a "Rate limit exceeded" reply
// comes back anyway it waits the "retry after Ns" it states and tries again.
// A dropped connection is retried the same way. Every other fetch is untouched.

const realFetch = globalThis.fetch;
const MIN_GAP_MS = Number(process.env.FIRECRAWL_MIN_GAP_MS ?? 6500);
const MAX_ATTEMPTS = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;

globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith("https://api.firecrawl.dev/")) return realFetch(url, init);
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    let res;
    let text;
    try {
      res = await realFetch(url, init);
      text = await res.text();
    } catch (e) {
      if (attempt === MAX_ATTEMPTS) throw e;
      console.error(`  firecrawl: ${e?.cause?.code ?? e?.message ?? e} — retry ${attempt}/${MAX_ATTEMPTS - 1}`);
      await sleep(5000 * attempt);
      continue;
    }
    if (res.status === 429 || /Rate limit exceeded/i.test(text)) {
      const m = text.match(/retry after (\d+)\s*s/i);
      const s = (m ? Number(m[1]) : 30) + 3;
      console.error(`  firecrawl: rate limited — waiting ${s}s (attempt ${attempt}/${MAX_ATTEMPTS})`);
      await sleep(s * 1000);
      continue;
    }
    return new Response(text, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json" } });
  }
  throw new Error(`firecrawl: still rate limited after ${MAX_ATTEMPTS} attempts`);
};
