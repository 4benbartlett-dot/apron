// Tell search engines which pages changed, through IndexNow.
//
// IndexNow is one request: "these URLs on this site changed". Bing, Yandex and
// the engines that share their index pick it up within minutes instead of
// waiting for the next crawl. The site proves it sent the request by hosting
// a key file: apps/web/public/<key>.txt, whose content is the key.
//
// Run it AFTER a deploy is live. It reads the live sitemap, so it can only
// ever submit pages that exist, and it stops if the key file isn't being
// served yet.
//
//   node scripts/indexnow.mjs                    every URL in the live sitemap
//   node scripts/indexnow.mjs /rules /team/TOR   only these paths
//   node scripts/indexnow.mjs --dry              print what would be sent

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, "..", "..", "..", "apps", "web", "public");
const HOST = "overtheapron.com";
const SITE = `https://${HOST}`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const paths = args.filter((a) => a.startsWith("/"));

const keyFile = readdirSync(PUBLIC).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!keyFile) {
  console.error(`No IndexNow key file in ${PUBLIC} (a 32-character hex name ending in .txt).`);
  process.exit(1);
}
const key = readFileSync(join(PUBLIC, keyFile), "utf8").trim();
if (`${key}.txt` !== keyFile) {
  console.error(`${keyFile} should contain its own name without ".txt"; it contains something else.`);
  process.exit(1);
}
const keyLocation = `${SITE}/${keyFile}`;

// The key has to be live before a request that names it.
const served = await fetch(keyLocation).then((r) => (r.ok ? r.text() : ""), () => "");
if (served.trim() !== key) {
  console.error(`${keyLocation} is not serving the key yet. Deploy first, then run this again.`);
  process.exit(1);
}

let urlList;
if (paths.length) {
  urlList = paths.map((p) => SITE + p);
} else {
  const xml = await fetch(`${SITE}/sitemap.xml`).then((r) => r.text());
  urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}
urlList = [...new Set(urlList)].filter((u) => u.startsWith(SITE));
if (!urlList.length) {
  console.error("Nothing to submit.");
  process.exit(1);
}

console.log(`${urlList.length} URL${urlList.length === 1 ? "" : "s"} for ${HOST}${dry ? " (dry run, nothing sent)" : ""}`);
for (const u of urlList.slice(0, 5)) console.log(`  ${u}`);
if (urlList.length > 5) console.log(`  ... and ${urlList.length - 5} more`);
if (dry) process.exit(0);

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key, keyLocation, urlList }),
});
// 200 and 202 both mean received; 202 means the key is still being checked.
if (res.status === 200 || res.status === 202) {
  console.log(`IndexNow accepted the list (HTTP ${res.status}).`);
} else {
  console.error(`IndexNow refused the list: HTTP ${res.status} ${await res.text().catch(() => "")}`);
  process.exit(1);
}
